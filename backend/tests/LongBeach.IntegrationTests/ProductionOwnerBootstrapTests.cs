using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
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

public sealed class ProductionOwnerBootstrapTests
{
    [Fact]
    public async Task Production_owner_bootstrap_is_idempotent_against_postgresql()
    {
        var connectionString = Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        var connection = new NpgsqlConnectionStringBuilder(connectionString);
        var databaseName = connection.Database ?? string.Empty;
        Assert.True(
            databaseName.Contains("test", StringComparison.OrdinalIgnoreCase) ||
            databaseName.Contains("ci", StringComparison.OrdinalIgnoreCase),
            "The integration database name must contain 'test' or 'ci'.");

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [ProductionOwnerBootstrapper.EnabledKey] = "true",
                [ProductionOwnerBootstrapper.NameKey] = "Arena Owner",
                [ProductionOwnerBootstrapper.EmailKey] = "owner@example.com",
                [ProductionOwnerBootstrapper.PasswordKey] = "integration-owner-password"
            })
            .Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(TimeProvider.System);
        services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(connectionString));
        services.Configure<PasswordHasherOptions>(options => options.IterationCount = 10_000);
        services.AddSingleton<IPasswordHasher, AspNetIdentityPasswordHasher>();

        await using var provider = services.BuildServiceProvider();
        await using (var setupScope = provider.CreateAsyncScope())
        {
            var dbContext = setupScope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            await dbContext.Database.EnsureDeletedAsync();
            await dbContext.Database.MigrateAsync();
            dbContext.Roles.Add(new Role(SystemRoles.Owner));
            await dbContext.SaveChangesAsync();
        }

        var bootstrapper = new ProductionOwnerBootstrapper(
            provider.GetRequiredService<IServiceScopeFactory>(),
            configuration,
            new TestHostEnvironment(Environments.Production),
            NullLogger<ProductionOwnerBootstrapper>.Instance);

        await bootstrapper.StartAsync(CancellationToken.None);
        await bootstrapper.StartAsync(CancellationToken.None);

        await using var verificationScope = provider.CreateAsyncScope();
        var verificationDbContext = verificationScope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var users = await verificationDbContext.Users
            .Include(user => user.UserRoles)
                .ThenInclude(userRole => userRole.Role)
            .ToArrayAsync();
        var user = Assert.Single(users);
        Assert.Equal("owner@example.com", user.Email);
        Assert.Contains(user.UserRoles, userRole => userRole.Role.Name == SystemRoles.Owner);
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
