using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Bootstrap;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Infrastructure.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed class GoogleAllowedOwnerBootstrapperTests
{
    private const string AllowlistKey = "Authentication:Google:AllowedEmail";

    [Theory]
    [InlineData("")]
    [InlineData(" ; , ")]
    [InlineData(null)]
    public async Task Explicit_empty_owner_list_fails_before_database_access(string? owners)
    {
        await using var provider = new ServiceCollection().BuildServiceProvider();
        var configuration = Configuration("allowed@longbeach.test", owners);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Bootstrapper(provider, configuration).StartAsync(CancellationToken.None));

        Assert.Contains(GoogleAllowedOwnerBootstrapper.ProvisionOwnerEmailsKey, error.Message);
    }

    [Fact]
    public async Task Any_unlisted_target_rejects_the_entire_list_before_database_access()
    {
        await using var provider = new ServiceCollection().BuildServiceProvider();
        var configuration = Configuration("allowed@longbeach.test", "allowed@longbeach.test,unlisted@longbeach.test");

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Bootstrapper(provider, configuration).StartAsync(CancellationToken.None));

        Assert.Contains(AllowlistKey, error.Message);
    }

    [Theory]
    [InlineData("Production", false)]
    [InlineData("Staging", true)]
    [InlineData("Development", true)]
    public async Task Disabled_or_nonproduction_bootstrap_does_not_access_the_database(string environment, bool enabled)
    {
        await using var provider = new ServiceCollection().BuildServiceProvider();
        var configuration = Configuration("", "", enabled: enabled);

        await Bootstrapper(provider, configuration, environment).StartAsync(CancellationToken.None);
    }

    [PostgresFact]
    public async Task Targeted_promotion_is_idempotent_and_preserves_other_allowed_users_and_existing_credentials()
    {
        await using var provider = await Provider();
        var target = Email("target");
        var other = Email("other");
        var allowedButAbsent = Email("absent");
        Guid targetId;
        Guid otherId;
        string originalHash;
        await using (var scope = provider.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            var staffRole = new Role($"Staff-{Guid.NewGuid():N}");
            originalHash = scope.ServiceProvider.GetRequiredService<IPasswordHasher>().Hash("test-existing-password");
            var targetUser = User.Create("Existing target", target, originalHash);
            var otherUser = User.Create("Existing colleague", other, originalHash);
            targetUser.AssignRole(staffRole);
            otherUser.AssignRole(staffRole);
            targetId = targetUser.Id;
            otherId = otherUser.Id;
            db.AddRange(staffRole, targetUser, otherUser);
            await db.SaveChangesAsync();
        }
        var configuration = Configuration($"{target};{other};{allowedButAbsent}", $" {target.ToUpperInvariant()} ; {target}");
        var bootstrapper = Bootstrapper(provider, configuration);

        await bootstrapper.StartAsync(CancellationToken.None);
        await bootstrapper.StartAsync(CancellationToken.None);

        await using var verification = provider.CreateAsyncScope();
        var verificationDb = verification.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var targetedUser = await verificationDb.Users.Include(user => user.UserRoles).ThenInclude(role => role.Role)
            .SingleAsync(user => user.Id == targetId);
        var colleague = await verificationDb.Users.Include(user => user.UserRoles).ThenInclude(role => role.Role)
            .SingleAsync(user => user.Id == otherId);
        Assert.Equal("Existing target", targetedUser.Name);
        Assert.Equal(originalHash, targetedUser.PasswordHash);
        Assert.True(targetedUser.IsActive);
        Assert.Equal(2, targetedUser.UserRoles.Count);
        Assert.Single(targetedUser.UserRoles, role => role.Role.Name == SystemRoles.Owner);
        Assert.Single(colleague.UserRoles);
        Assert.DoesNotContain(colleague.UserRoles, role => role.Role.Name == SystemRoles.Owner);
        Assert.Equal(originalHash, colleague.PasswordHash);
        Assert.False(await verificationDb.Users.AnyAsync(user => user.NormalizedEmail == User.NormalizeEmail(allowedButAbsent)));
        var ownerRole = await verificationDb.Roles.SingleAsync(role => role.Name == SystemRoles.Owner);
        Assert.Single(await verificationDb.AuditLogs.Where(audit => audit.Resource == nameof(UserRole) &&
            audit.ResourceId == $"{targetId}:{ownerRole.Id}").ToArrayAsync());
    }

    [PostgresFact]
    public async Task Targeted_creation_stores_only_a_password_hash_and_does_not_create_other_allowed_accounts()
    {
        await using var provider = await Provider();
        var target = Email("created");
        var other = Email("not-created");

        await Bootstrapper(provider, Configuration($"{target},{other}", target)).StartAsync(CancellationToken.None);

        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var user = await db.Users.Include(item => item.UserRoles).ThenInclude(role => role.Role)
            .SingleAsync(item => item.NormalizedEmail == User.NormalizeEmail(target));
        Assert.Single(user.UserRoles, role => role.Role.Name == SystemRoles.Owner);
        Assert.True(user.IsActive);
        Assert.NotEmpty(user.PasswordHash);
        var userAudit = Assert.Single(await db.AuditLogs.Where(audit => audit.Resource == nameof(User) &&
            audit.ResourceId == user.Id.ToString()).ToArrayAsync());
        Assert.Contains("[REDACTED]", userAudit.MetadataJson);
        Assert.DoesNotContain(user.PasswordHash, userAudit.MetadataJson);
        Assert.False(await db.Users.AnyAsync(item => item.NormalizedEmail == User.NormalizeEmail(other)));
        Assert.Equal(PasswordHashVerificationResult.Failed,
            scope.ServiceProvider.GetRequiredService<IPasswordHasher>().Verify(target, user.PasswordHash));
    }

    [PostgresFact]
    public async Task Unlisted_target_prevents_writing_an_earlier_allowed_target_in_postgresql()
    {
        await using var provider = await Provider();
        var allowed = Email("allowed");
        var unlisted = Email("unlisted");
        int originalUserCount;
        int originalRoleAssignmentCount;
        int originalAuditCount;
        await using (var before = provider.CreateAsyncScope())
        {
            var db = before.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            originalUserCount = await db.Users.CountAsync();
            originalRoleAssignmentCount = await db.UserRoles.CountAsync();
            originalAuditCount = await db.AuditLogs.CountAsync();
        }

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Bootstrapper(provider, Configuration(allowed, $"{allowed},{unlisted}")).StartAsync(CancellationToken.None));

        await using var after = provider.CreateAsyncScope();
        var dbAfter = after.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        Assert.Equal(originalUserCount, await dbAfter.Users.CountAsync());
        Assert.Equal(originalRoleAssignmentCount, await dbAfter.UserRoles.CountAsync());
        Assert.Equal(originalAuditCount, await dbAfter.AuditLogs.CountAsync());
    }

    [PostgresFact]
    public async Task Inactive_target_prevents_all_writes_including_an_earlier_new_target()
    {
        await using var provider = await Provider();
        var newTarget = Email("new");
        var inactiveTarget = Email("inactive");
        Guid inactiveId;
        await using (var scope = provider.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            var inactive = User.Create("Inactive target", inactiveTarget, "test-hash");
            inactive.Deactivate();
            inactiveId = inactive.Id;
            db.Users.Add(inactive);
            await db.SaveChangesAsync();
        }
        var configuration = Configuration($"{newTarget},{inactiveTarget}", $"{newTarget},{inactiveTarget}");

        await Assert.ThrowsAsync<InvalidOperationException>(() => Bootstrapper(provider, configuration).StartAsync(CancellationToken.None));

        await using var verification = provider.CreateAsyncScope();
        var dbAfter = verification.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        Assert.False(await dbAfter.Users.AnyAsync(user => user.NormalizedEmail == User.NormalizeEmail(newTarget)));
        var stillInactive = await dbAfter.Users.Include(user => user.UserRoles).SingleAsync(user => user.Id == inactiveId);
        Assert.False(stillInactive.IsActive);
        Assert.Empty(stillInactive.UserRoles);
        Assert.Equal("test-hash", stillInactive.PasswordHash);
    }

    [PostgresFact]
    public async Task Unconfigured_owner_list_preserves_legacy_allowlist_provisioning()
    {
        await using var provider = await Provider();
        var first = Email("legacy-first");
        var second = Email("legacy-second");

        await Bootstrapper(provider, Configuration($"{first},{second}", null, explicitOwners: false))
            .StartAsync(CancellationToken.None);

        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var targets = new[] { User.NormalizeEmail(first), User.NormalizeEmail(second) };
        var users = await db.Users.Include(user => user.UserRoles).ThenInclude(role => role.Role)
            .Where(user => targets.Contains(user.NormalizedEmail)).ToArrayAsync();
        Assert.Equal(2, users.Length);
        Assert.All(users, user => Assert.Single(user.UserRoles, role => role.Role.Name == SystemRoles.Owner));
    }

    private static string Email(string prefix) => $"{prefix}-{Guid.NewGuid():N}@longbeach.test";

    private static IConfiguration Configuration(string allowed, string? owners, bool explicitOwners = true, bool enabled = true)
    {
        var values = new Dictionary<string, string?>
        {
            [GoogleAllowedOwnerBootstrapper.EnabledKey] = enabled.ToString(),
            [AllowlistKey] = allowed
        };
        if (explicitOwners) values[GoogleAllowedOwnerBootstrapper.ProvisionOwnerEmailsKey] = owners;
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private static GoogleAllowedOwnerBootstrapper Bootstrapper(ServiceProvider provider, IConfiguration configuration,
        string environment = "Production") => new(provider.GetRequiredService<IServiceScopeFactory>(), configuration,
            new TestHostEnvironment(environment), NullLogger<GoogleAllowedOwnerBootstrapper>.Instance);

    private static async Task<ServiceProvider> Provider()
    {
        var connectionString = Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")!;
        var databaseName = new NpgsqlConnectionStringBuilder(connectionString).Database ?? string.Empty;
        Assert.True(databaseName.Contains("test", StringComparison.OrdinalIgnoreCase) ||
            databaseName.Contains("ci", StringComparison.OrdinalIgnoreCase), "The integration database must be a test database.");
        var services = new ServiceCollection();
        services.AddSingleton(TimeProvider.System);
        services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(connectionString)
            .AddInterceptors(new AuditSaveChangesInterceptor(new NullAuditContext(), TimeProvider.System)));
        services.Configure<PasswordHasherOptions>(options => options.IterationCount = 10_000);
        services.AddSingleton<IPasswordHasher, AspNetIdentityPasswordHasher>();
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
