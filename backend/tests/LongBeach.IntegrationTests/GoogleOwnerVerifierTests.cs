using LongBeach.Application.Abstractions;
using LongBeach.Domain.Auditing;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Bootstrap;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed class GoogleOwnerVerifierTests
{
    private static readonly DateTimeOffset From = DateTimeOffset.Parse("2026-10-05T19:39:20Z");
    private static readonly DateTimeOffset To = DateTimeOffset.Parse("2026-10-05T19:39:23Z");

    [Theory]
    [InlineData("Staging")]
    [InlineData("Development")]
    [InlineData("Test")]
    public async Task Verification_requires_production_before_accessing_the_database(string environment)
    {
        await using var db = UnconfiguredDb();
        var verifier = new GoogleOwnerVerifier(db, Configuration("target@longbeach.test"), new TestHostEnvironment(environment));

        await Assert.ThrowsAsync<InvalidOperationException>(() => verifier.VerifyAsync(CancellationToken.None));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ; , ")]
    [InlineData("target@longbeach.test,unlisted@longbeach.test")]
    public async Task Verification_rejects_missing_empty_or_unlisted_explicit_targets_before_database_access(string? targets)
    {
        await using var db = UnconfiguredDb();
        var configuration = Configuration("target@longbeach.test", new Dictionary<string, string?>
        {
            [GoogleAllowedOwnerBootstrapper.ProvisionOwnerEmailsKey] = targets
        });

        await Assert.ThrowsAsync<InvalidOperationException>(() => Verifier(db, configuration).VerifyAsync(CancellationToken.None));
    }

    [Theory]
    [InlineData(null, "2026-10-05T19:39:23Z")]
    [InlineData("2026-10-05T19:39:20Z", null)]
    [InlineData("2026-10-05T19:39:20", "2026-10-05T19:39:23Z")]
    [InlineData("2026-10-05T16:39:20-03:00", "2026-10-05T19:39:23Z")]
    [InlineData("invalid", "2026-10-05T19:39:23Z")]
    [InlineData("2026-10-05T19:39:23Z", "2026-10-05T19:39:23Z")]
    [InlineData("2026-10-05T19:39:24Z", "2026-10-05T19:39:23Z")]
    [InlineData("0001-01-01T00:00:00Z", "2026-10-05T19:39:23Z")]
    public async Task Verification_rejects_missing_nonutc_or_unbounded_windows_before_database_access(string? from, string? to)
    {
        await using var db = UnconfiguredDb();
        var configuration = Configuration("target@longbeach.test", new Dictionary<string, string?>
        {
            [GoogleOwnerVerifier.FromUtcKey] = from,
            [GoogleOwnerVerifier.ToUtcKey] = to
        });

        await Assert.ThrowsAsync<InvalidOperationException>(() => Verifier(db, configuration).VerifyAsync(CancellationToken.None));
    }

    [PostgresFact]
    public async Task Active_target_owner_verifies_without_writes_and_ignores_grants_outside_window_or_other_roles()
    {
        var (from, to) = IsolatedWindow();
        await using var provider = await Provider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var ownerRole = await db.Roles.SingleAsync(role => role.Name == SystemRoles.Owner);
        var otherRole = new Role($"VerificationStaff-{Guid.NewGuid():N}");
        var target = User.Create("Target fixture", Email(), "fixture-password-hash");
        var outsider = User.Create("Other fixture", Email(), "fixture-password-hash");
        target.AssignRole(ownerRole);
        outsider.AssignRole(ownerRole);
        db.AddRange(target, outsider, otherRole);
        db.AddRange(
            Grant(target.Id, ownerRole.Id, from),
            Grant(outsider.Id, ownerRole.Id, from.AddMilliseconds(-1)),
            Grant(outsider.Id, ownerRole.Id, to.AddMilliseconds(1)),
            Grant(outsider.Id, otherRole.Id, from.AddSeconds(1)),
            Grant(outsider.Id, ownerRole.Id, from.AddSeconds(1), action: "Modified"),
            Grant(outsider.Id, ownerRole.Id, from.AddSeconds(1), resource: nameof(User)));
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var before = await Snapshot(db);
        var configuration = Configuration(target.Email, new Dictionary<string, string?>
        {
            [GoogleAllowedOwnerBootstrapper.ProvisionOwnerEmailsKey] = $" {target.Email.ToUpperInvariant()} ; {target.Email}",
            [GoogleAllowedOwnerBootstrapper.EnabledKey] = "true",
            [GoogleOwnerVerifier.FromUtcKey] = from.ToString("O"),
            [GoogleOwnerVerifier.ToUtcKey] = to.ToString("O")
        });

        var result = await Verifier(db, configuration).VerifyAsync(CancellationToken.None);
        var repeated = await Verifier(db, configuration).VerifyAsync(CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal(1, result.TargetCount);
        Assert.Equal(1, result.ActiveOwnerCount);
        Assert.Equal(0, result.OutsideTargetGrantCount);
        Assert.Equal(result, repeated);
        Assert.Equal(before, await Snapshot(db));
        Assert.False(db.ChangeTracker.HasChanges());
        Assert.Empty(db.ChangeTracker.Entries());
    }

    [PostgresFact]
    public async Task Owner_grants_outside_targets_are_counted_at_both_window_boundaries_without_writes()
    {
        var (from, to) = IsolatedWindow();
        await using var provider = await Provider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var ownerRole = await db.Roles.SingleAsync(role => role.Name == SystemRoles.Owner);
        var target = User.Create("Target fixture", Email(), "fixture-password-hash");
        target.AssignRole(ownerRole);
        db.Users.Add(target);
        db.AddRange(Grant(Guid.NewGuid(), ownerRole.Id, from), Grant(Guid.NewGuid(), ownerRole.Id, to));
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var before = await Snapshot(db);

        var result = await Verifier(db, Configuration(target.Email, new Dictionary<string, string?>
        {
            [GoogleOwnerVerifier.FromUtcKey] = from.ToString("O"),
            [GoogleOwnerVerifier.ToUtcKey] = to.ToString("O")
        })).VerifyAsync(CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(1, result.ActiveOwnerCount);
        Assert.Equal(2, result.OutsideTargetGrantCount);
        Assert.Equal(before, await Snapshot(db));
        Assert.Empty(db.ChangeTracker.Entries());
    }

    [PostgresFact]
    public async Task Missing_inactive_and_nonowner_targets_fail_without_promoting_or_activating_them()
    {
        await using var provider = await Provider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var ownerRole = await db.Roles.SingleAsync(role => role.Name == SystemRoles.Owner);
        var missing = Email();
        var inactive = User.Create("Inactive fixture", Email(), "inactive-fixture-hash");
        inactive.AssignRole(ownerRole);
        inactive.Deactivate();
        var nonowner = User.Create("Nonowner fixture", Email(), "nonowner-fixture-hash");
        db.AddRange(inactive, nonowner);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var before = await Snapshot(db);

        var result = await Verifier(db, Configuration($"{missing},{inactive.Email},{nonowner.Email}"))
            .VerifyAsync(CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(3, result.TargetCount);
        Assert.Equal(0, result.ActiveOwnerCount);
        Assert.Equal(before, await Snapshot(db));
        Assert.Empty(db.ChangeTracker.Entries());
    }

    private static AuditLog Grant(Guid userId, Guid roleId, DateTimeOffset when, string action = "Added", string resource = nameof(UserRole)) =>
        AuditLog.Create(null, action, resource, $"{userId}:{roleId}", "{}", null, null, "owner-verification-test", when);

    private static string Email() => $"verification-{Guid.NewGuid():N}@longbeach.test";

    private static (DateTimeOffset From, DateTimeOffset To) IsolatedWindow()
    {
        var from = From.AddTicks(Random.Shared.NextInt64(TimeSpan.TicksPerDay * 365L * 100 / 10) * 10);
        return (from, from.AddSeconds(3));
    }

    private static IConfiguration Configuration(string targets, Dictionary<string, string?>? overrides = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["Authentication:Google:AllowedEmail"] = targets,
            [GoogleAllowedOwnerBootstrapper.ProvisionOwnerEmailsKey] = targets,
            [GoogleOwnerVerifier.FromUtcKey] = From.ToString("O"),
            [GoogleOwnerVerifier.ToUtcKey] = To.ToString("O")
        };
        if (overrides is not null) foreach (var pair in overrides) values[pair.Key] = pair.Value;
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private static GoogleOwnerVerifier Verifier(LongBeachDbContext db, IConfiguration configuration) =>
        new(db, configuration, new TestHostEnvironment(Environments.Production));

    private static LongBeachDbContext UnconfiguredDb() =>
        new(new DbContextOptionsBuilder<LongBeachDbContext>().Options, TimeProvider.System);

    private static async Task<(int Users, int UserRoles, int Audits)> Snapshot(LongBeachDbContext db) =>
        (await db.Users.CountAsync(), await db.UserRoles.CountAsync(), await db.AuditLogs.CountAsync());

    private static async Task<ServiceProvider> Provider()
    {
        var connectionString = Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")!;
        var databaseName = new NpgsqlConnectionStringBuilder(connectionString).Database ?? string.Empty;
        Assert.True(databaseName.Contains("test", StringComparison.OrdinalIgnoreCase) || databaseName.Contains("ci", StringComparison.OrdinalIgnoreCase));
        var services = new ServiceCollection();
        services.AddSingleton(TimeProvider.System);
        services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(connectionString)
            .AddInterceptors(new AuditSaveChangesInterceptor(new NullAuditContext(), TimeProvider.System)));
        var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        await db.Database.MigrateAsync();
        if (!await db.Roles.AnyAsync(role => role.Name == SystemRoles.Owner))
        {
            db.Roles.Add(new Role(SystemRoles.Owner));
            await db.SaveChangesAsync();
        }
        return provider;
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "LongBeach.IntegrationTests";
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
