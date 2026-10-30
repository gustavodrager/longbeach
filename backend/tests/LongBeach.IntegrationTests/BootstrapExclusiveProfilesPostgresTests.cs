using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Bootstrap;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed class BootstrapExclusiveProfilesPostgresTests
{
    [PostgresFact]
    public async Task Administrative_bootstraps_refuse_existing_missing_different_multiple_or_inactive_profiles_without_writes()
    {
        await using var fixture = await Fixture.Create();
        string[][] profilesToReject = [[], ["Teacher"], ["Owner"], ["Manager", "Teacher"]];
        foreach (var development in new[] { false, true })
        {
            foreach (var profiles in profilesToReject)
            {
                var target = await fixture.Existing(profiles);
                var before = await fixture.Snapshot();
                var error = await Assert.ThrowsAsync<InvalidOperationException>(() => fixture.Run(development, target.Email));
                Assert.Contains("consolidation", error.Message, StringComparison.OrdinalIgnoreCase);
                Assert.Equal(before, await fixture.Snapshot());
            }
            var inactive = await fixture.Existing(["Manager"], active: false);
            var inactiveBefore = await fixture.Snapshot();
            await Assert.ThrowsAsync<InvalidOperationException>(() => fixture.Run(development, inactive.Email));
            Assert.Equal(inactiveBefore, await fixture.Snapshot());
        }
    }

    [PostgresFact]
    public async Task New_accounts_receive_one_manager_and_retries_preserve_existing_identity_and_credentials()
    {
        await using var fixture = await Fixture.Create();
        foreach (var development in new[] { false, true })
        {
            var email = Guid.NewGuid().ToString("N") + "@bootstrap.fixture.test";
            await fixture.Run(development, email);
            var before = await fixture.Snapshot();
            await fixture.Run(development, email, "different-bootstrap-password");
            Assert.Equal(before, await fixture.Snapshot());
            await using var scope = fixture.Provider.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            var account = await db.Users.Include(u => u.UserRoles).ThenInclude(ur => ur.Role).SingleAsync(u => u.NormalizedEmail == User.NormalizeEmail(email));
            Assert.Equal(SystemRoles.Manager, Assert.Single(account.UserRoles).Role.Name);
            Assert.Equal("fixture-hash:original-bootstrap-password", account.PasswordHash);
        }
    }

    private sealed class Fixture(string connectionString, string schema, ServiceProvider provider) : IAsyncDisposable
    {
        public ServiceProvider Provider { get; } = provider;

        public static async Task<Fixture> Create()
        {
            var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")) { Pooling = false };
            Assert.True(connection.Database?.Contains("test", StringComparison.OrdinalIgnoreCase) == true || connection.Database?.Contains("ci", StringComparison.OrdinalIgnoreCase) == true);
            var original = connection.ConnectionString; var schema = "bootstrap_profiles_test_" + Guid.NewGuid().ToString("N");
            await using (var admin = new NpgsqlConnection(original))
            { await admin.OpenAsync(); await using var command = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", admin); await command.ExecuteNonQueryAsync(); }
            connection.SearchPath = schema;
            var services = new ServiceCollection();
            services.AddSingleton(TimeProvider.System);
            services.AddSingleton<IPasswordHasher, FixtureHasher>();
            services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(connection.ConnectionString,
                postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", schema))
                .AddInterceptors(new AuditSaveChangesInterceptor(new NullAuditContext(), TimeProvider.System)));
            var fixture = new Fixture(original, schema, services.BuildServiceProvider());
            try
            {
                await using var scope = fixture.Provider.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
                await db.Database.MigrateAsync();
                if (!await db.Roles.AnyAsync(r => r.Name == SystemRoles.Manager)) db.Roles.Add(new Role(SystemRoles.Manager));
                await db.SaveChangesAsync();
                return fixture;
            }
            catch { await fixture.DisposeAsync(); throw; }
        }

        public async Task<User> Existing(string[] profiles, bool active = true)
        {
            await using var scope = Provider.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            var user = User.Create("Bootstrap fixture", Guid.NewGuid().ToString("N") + "@bootstrap.fixture.test", "existing-credential-hash");
            if (!active) user.Deactivate();
            db.Users.Add(user); await db.SaveChangesAsync();
            foreach (var profile in profiles)
            {
                var role = await db.Roles.SingleOrDefaultAsync(r => r.Name == profile);
                if (role is null) { role = new Role(profile); db.Roles.Add(role); await db.SaveChangesAsync(); }
                // These rows model pre-consolidation identities, including combinations prohibited by the new domain API.
                await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO user_roles (\"UserId\", \"RoleId\") VALUES ({user.Id}, {role.Id})");
            }
            return user;
        }

        public async Task Run(bool development, string email, string password = "original-bootstrap-password")
        {
            var factory = Provider.GetRequiredService<IServiceScopeFactory>();
            if (!development)
            {
                var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
                {
                    [ProductionOwnerBootstrapper.EnabledKey] = "true", [ProductionOwnerBootstrapper.NameKey] = "Bootstrap fixture",
                    [ProductionOwnerBootstrapper.EmailKey] = email, [ProductionOwnerBootstrapper.PasswordKey] = password
                }).Build();
                await new ProductionOwnerBootstrapper(factory, config, new EnvironmentStub("Production"), NullLogger<ProductionOwnerBootstrapper>.Instance).StartAsync(default);
                return;
            }
            string[] keys = ["LONG_BEACH_BOOTSTRAP_ADMIN_EMAIL", "LONG_BEACH_BOOTSTRAP_ADMIN_PASSWORD", "LONG_BEACH_BOOTSTRAP_ADMIN_NAME"];
            var original = keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
            try
            {
                Environment.SetEnvironmentVariable(keys[0], email); Environment.SetEnvironmentVariable(keys[1], password); Environment.SetEnvironmentVariable(keys[2], "Bootstrap fixture");
                await new DevelopmentAdminBootstrapper(factory, new EnvironmentStub("Development"), NullLogger<DevelopmentAdminBootstrapper>.Instance).StartAsync(default);
            }
            finally { foreach (var key in keys) Environment.SetEnvironmentVariable(key, original[key]); }
        }

        public async Task<string> Snapshot()
        {
            await using var scope = Provider.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            return JsonSerializer.Serialize(new
            {
                Users = await db.Users.AsNoTracking().OrderBy(u => u.Id).Select(u => new { u.Id, u.Name, u.Email, u.PasswordHash, u.IsActive }).ToArrayAsync(),
                Roles = await db.UserRoles.AsNoTracking().OrderBy(ur => ur.UserId).ThenBy(ur => ur.RoleId).Select(ur => new { ur.UserId, ur.RoleId }).ToArrayAsync(),
                Audits = await db.AuditLogs.AsNoTracking().OrderBy(a => a.Id).Select(a => a.Id).ToArrayAsync()
            });
        }

        public async ValueTask DisposeAsync()
        {
            await Provider.DisposeAsync(); await using var admin = new NpgsqlConnection(connectionString); await admin.OpenAsync();
            await using var command = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", admin); await command.ExecuteNonQueryAsync();
        }
    }

    private sealed class FixtureHasher : IPasswordHasher
    {
        public string DummyHash => "fixture-dummy-hash";
        public string Hash(string password) => "fixture-hash:" + password;
        public PasswordHashVerificationResult Verify(string password, string encodedHash) => encodedHash == Hash(password)
            ? PasswordHashVerificationResult.Success : PasswordHashVerificationResult.Failed;
    }
    private sealed class EnvironmentStub(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "BootstrapExclusiveProfileTests";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
