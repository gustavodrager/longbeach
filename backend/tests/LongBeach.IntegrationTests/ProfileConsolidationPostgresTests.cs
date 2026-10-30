using System.Text.Json;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Bootstrap;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed class ProfileConsolidationPostgresTests
{
    [PostgresFact]
    public async Task Preview_is_read_only_and_incomplete_mapping_cannot_change_any_account_or_catalog()
    {
        await using var fixture = await Fixture.Create(); var db = fixture.Db;
        var owner = await fixture.UserWithLegacyRoles("Owner");
        var bar = await fixture.UserWithLegacyRoles("BarOperator");
        var before = await Snapshot(db);
        // Fixture queries intentionally return tracked entities; isolate the preview's own tracking.
        db.ChangeTracker.Clear();
        var service = new ProfileConsolidationService(db, TimeProvider.System);
        var preview = await service.PreviewAsync(new());
        Assert.False(preview.CanApply);
        Assert.Contains(preview.Issues, issue => issue.UserId == bar.Id && issue.Code == "explicit_mapping_required");
        Assert.Equal(before, await Snapshot(db));
        Assert.Empty(db.ChangeTracker.Entries());
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ApplyAsync(new(preview.Fingerprint)));
        Assert.Equal(before, await Snapshot(db));
        Assert.Equal("Owner", await RoleFor(db, owner.Id));
        var serialized = JsonSerializer.Serialize(preview);
        Assert.DoesNotContain(owner.Name, serialized); Assert.DoesNotContain(owner.Email, serialized);
        Assert.DoesNotContain(owner.PasswordHash, serialized);
    }

    [PostgresFact]
    public async Task Complete_conversion_preserves_identity_history_and_status_revokes_sessions_and_reconciles_grants()
    {
        await using var fixture = await Fixture.Create(); var db = fixture.Db;
        var owner = await fixture.UserWithLegacyRoles("Owner");
        var combined = await fixture.UserWithLegacyRoles("Teacher", "BarOperator");
        var inactive = await fixture.UserWithLegacyRoles("Viewer"); inactive.Deactivate();
        owner = await db.Users.Include(u => u.RefreshTokens).SingleAsync(u => u.Id == owner.Id);
        combined = await db.Users.Include(u => u.RefreshTokens).SingleAsync(u => u.Id == combined.Id);
        owner.AddRefreshToken(RefreshToken.Create(Guid.NewGuid(), owner.Id, Guid.NewGuid(), "owner-refresh-hash", "csrf-hash", DateTimeOffset.UtcNow.AddHours(1), null));
        combined.AddRefreshToken(RefreshToken.Create(Guid.NewGuid(), combined.Id, Guid.NewGuid(), "staff-refresh-hash", "csrf-hash", DateTimeOffset.UtcNow.AddHours(1), null));
        await db.SaveChangesAsync();
        var original = await db.Users.AsNoTracking().ToDictionaryAsync(u => u.Id, u => new { u.Name, u.Email, u.PasswordHash, u.IsActive });
        var auditCount = await db.AuditLogs.CountAsync(); db.ChangeTracker.Clear();
        var mappings = new[] { new ProfileConsolidationMapping(combined.Id, ["BarOperator", "Teacher"], "Operations"), new ProfileConsolidationMapping(inactive.Id, ["Viewer"], "Student") };
        var service = new ProfileConsolidationService(db, TimeProvider.System);
        var preview = await service.PreviewAsync(new(Mappings: mappings));
        Assert.True(preview.CanApply); Assert.Equal(3, preview.Changes.Count);
        var result = await service.ApplyAsync(new(preview.Fingerprint, mappings));
        Assert.Equal(3, result.ChangedUsers); Assert.Equal(2, result.RevokedRefreshTokens); Assert.Equal(1, result.ActiveManagers);
        db.ChangeTracker.Clear();
        Assert.Equal("Manager", await RoleFor(db, owner.Id)); Assert.Equal("Operations", await RoleFor(db, combined.Id)); Assert.Equal("Student", await RoleFor(db, inactive.Id));
        foreach (var user in await db.Users.AsNoTracking().ToListAsync())
        {
            var prior = original[user.Id]; Assert.Equal(prior.Name, user.Name); Assert.Equal(prior.Email, user.Email);
            Assert.Equal(prior.PasswordHash, user.PasswordHash); Assert.Equal(prior.IsActive, user.IsActive);
        }
        Assert.All(await db.RefreshTokens.ToListAsync(), token => Assert.NotNull(token.RevokedAtUtc));
        foreach (var name in SystemRoles.All)
        {
            var grants = await db.RolePermissions.Where(rp => rp.Role.Name == name).Select(rp => rp.Permission.Name).ToArrayAsync();
            Assert.Equal(ProfileAccess.Grants[name].Order(), grants.Order());
        }
        Assert.False(await db.RolePermissions.AnyAsync(rp => !SystemRoles.All.Contains(rp.Role.Name)));
        var audits = await db.AuditLogs.Where(a => a.Action == "ProfileConsolidated").ToArrayAsync(); Assert.Equal(3, audits.Length);
        Assert.True(await db.AuditLogs.CountAsync() > auditCount);
        foreach (var audit in audits)
        {
            Assert.DoesNotContain("fixture-name", audit.MetadataJson); Assert.DoesNotContain("@fixture.test", audit.MetadataJson);
            Assert.DoesNotContain("fixture-password", audit.MetadataJson); Assert.DoesNotContain("refresh-hash", audit.MetadataJson);
        }
        db.ChangeTracker.Clear();
        var repeatedPreview = await service.PreviewAsync(new()); Assert.True(repeatedPreview.CanApply); Assert.Empty(repeatedPreview.Changes);
        var repeated = await service.ApplyAsync(new(repeatedPreview.Fingerprint)); Assert.Equal(0, repeated.ChangedUsers);
    }

    [PostgresFact]
    public async Task Changed_inventory_or_expected_roles_rejects_entire_conversion_and_last_manager_is_preserved()
    {
        await using var fixture = await Fixture.Create(); var db = fixture.Db;
        var owner = await fixture.UserWithLegacyRoles("Owner");
        var service = new ProfileConsolidationService(db, TimeProvider.System);
        var preview = await service.PreviewAsync(new());
        var student = await fixture.UserWithLegacyRoles("Student");
        var before = await Snapshot(db);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ApplyAsync(new(preview.Fingerprint)));
        Assert.Equal(before, await Snapshot(db));
        var fresh = await service.PreviewAsync(new());
        var changedRoles = new[] { new ProfileConsolidationMapping(owner.Id, ["Administrator"], "Manager") };
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ApplyAsync(new(fresh.Fingerprint, changedRoles)));
        Assert.Equal(before, await Snapshot(db));
        var removeLast = new[] { new ProfileConsolidationMapping(owner.Id, ["Owner"], "Student") };
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ApplyAsync(new(fresh.Fingerprint, removeLast)));
        Assert.Equal(before, await Snapshot(db));
        Assert.Equal("Owner", await RoleFor(db, owner.Id)); Assert.Equal("Student", await RoleFor(db, student.Id));
    }

    [PostgresFact]
    public async Task Pending_and_expired_managers_cannot_replace_the_only_completed_manager()
    {
        await using var fixture = await Fixture.Create(); var db = fixture.Db;
        var owner = await fixture.UserWithLegacyRoles("Owner");
        var pending = await fixture.PendingManager(DateTimeOffset.UtcNow.AddDays(1));
        var expired = await fixture.PendingManager(DateTimeOffset.UtcNow.AddDays(-1));
        var mappings = new[] { new ProfileConsolidationMapping(owner.Id, ["Owner"], "Student") };
        var before = await Snapshot(db);
        var service = new ProfileConsolidationService(db, TimeProvider.System);
        var preview = await service.PreviewAsync(new(Mappings: mappings));
        Assert.False(preview.CanApply); Assert.Equal(0, preview.ActiveManagers);
        Assert.Contains(preview.Issues, issue => issue.Code == "active_manager_required");
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ApplyAsync(new(preview.Fingerprint, mappings)));
        Assert.Equal(before, await Snapshot(db)); Assert.Equal("Owner", await RoleFor(db, owner.Id));
        Assert.True((await db.Users.AsNoTracking().SingleAsync(u => u.Id == pending.Id)).RequiresFirstAccess);
        Assert.True((await db.Users.AsNoTracking().SingleAsync(u => u.Id == expired.Id)).RequiresFirstAccess);
        var safePreview = await service.PreviewAsync(new());
        Assert.True(safePreview.CanApply); Assert.Equal(1, safePreview.ActiveManagers);
    }

    private static Task<string> RoleFor(LongBeachDbContext db, Guid id) => db.UserRoles.Where(ur => ur.UserId == id).Select(ur => ur.Role.Name).SingleAsync();
    private static async Task<string> Snapshot(LongBeachDbContext db) => JsonSerializer.Serialize(new
    {
        Users = await db.Users.AsNoTracking().OrderBy(u => u.Id).Select(u => new { u.Id, u.IsActive, u.RequiresFirstAccess, u.InitialAccessExpiresAtUtc, u.Name, u.PasswordHash }).ToArrayAsync(),
        UserRoles = await db.UserRoles.AsNoTracking().OrderBy(ur => ur.UserId).ThenBy(ur => ur.RoleId).Select(ur => new { ur.UserId, ur.RoleId }).ToArrayAsync(),
        Roles = await db.Roles.AsNoTracking().OrderBy(r => r.Id).Select(r => r.Id).ToArrayAsync(),
        Permissions = await db.Permissions.AsNoTracking().OrderBy(p => p.Id).Select(p => p.Id).ToArrayAsync(),
        Grants = await db.RolePermissions.AsNoTracking().OrderBy(rp => rp.RoleId).ThenBy(rp => rp.PermissionId).Select(rp => new { rp.RoleId, rp.PermissionId }).ToArrayAsync(),
        Audits = await db.AuditLogs.AsNoTracking().OrderBy(a => a.Id).Select(a => a.Id).ToArrayAsync()
    });

    private sealed class Fixture(string connectionString, string schema, LongBeachDbContext db) : IAsyncDisposable
    {
        public LongBeachDbContext Db { get; } = db;
        public static async Task<Fixture> Create()
        {
            var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")) { Pooling = false };
            Assert.True(connection.Database?.Contains("test", StringComparison.OrdinalIgnoreCase) == true || connection.Database?.Contains("ci", StringComparison.OrdinalIgnoreCase) == true);
            var schema = "profiles_test_" + Guid.NewGuid().ToString("N"); var original = connection.ConnectionString;
            await using (var admin = new NpgsqlConnection(original))
            { await admin.OpenAsync(); await using var command = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", admin); await command.ExecuteNonQueryAsync(); }
            connection.SearchPath = schema;
            var context = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(connection.ConnectionString,
                options => options.MigrationsHistoryTable("__EFMigrationsHistory", schema)).Options, TimeProvider.System);
            var fixture = new Fixture(original, schema, context);
            try { await context.Database.MigrateAsync(); return fixture; }
            catch { await fixture.DisposeAsync(); throw; }
        }

        public async Task<User> UserWithLegacyRoles(params string[] names)
        {
            var user = User.Create("fixture-name-" + Guid.NewGuid().ToString("N"), Guid.NewGuid().ToString("N") + "@fixture.test", "fixture-password-hash");
            Db.Users.Add(user); await Db.SaveChangesAsync();
            foreach (var name in names)
            {
                var role = await Db.Roles.SingleOrDefaultAsync(r => r.Name == name);
                if (role is null) { role = new Role(name); Db.Roles.Add(role); await Db.SaveChangesAsync(); }
                // The fixture represents persisted legacy data that new AssignRole deliberately rejects.
                await Db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO user_roles (\"UserId\", \"RoleId\") VALUES ({user.Id}, {role.Id})");
            }
            Db.ChangeTracker.Clear();
            return await Db.Users.Include(u => u.UserRoles).ThenInclude(ur => ur.Role).SingleAsync(u => u.Id == user.Id);
        }

        public async Task<User> PendingManager(DateTimeOffset expiresAt)
        {
            var role = await Db.Roles.SingleOrDefaultAsync(r => r.Name == SystemRoles.Manager);
            if (role is null) { role = new Role(SystemRoles.Manager); Db.Roles.Add(role); }
            var user = User.CreateForFirstAccess("fixture-name-" + Guid.NewGuid().ToString("N"),
                "pending." + Guid.NewGuid().ToString("N"), "fixture-password-hash", expiresAt);
            user.AssignRole(role); Db.Users.Add(user); await Db.SaveChangesAsync(); Db.ChangeTracker.Clear();
            return user;
        }

        public async ValueTask DisposeAsync()
        {
            await Db.DisposeAsync(); await using var admin = new NpgsqlConnection(connectionString); await admin.OpenAsync();
            await using var command = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", admin); await command.ExecuteNonQueryAsync();
        }
    }
}
