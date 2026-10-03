using LongBeach.Infrastructure.Bootstrap;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace LongBeach.UnitTests;

public sealed class ProductionOwnerBootstrapperTests
{
    [Fact]
    public async Task Enabled_bootstrap_fails_before_database_access_when_password_is_missing()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var configuration = Configuration(new Dictionary<string, string?>
        {
            [ProductionOwnerBootstrapper.EnabledKey] = "true",
            [ProductionOwnerBootstrapper.NameKey] = "Arena Owner",
            [ProductionOwnerBootstrapper.EmailKey] = "owner@example.com"
        });
        var bootstrapper = new ProductionOwnerBootstrapper(
            services.GetRequiredService<IServiceScopeFactory>(),
            configuration,
            new TestHostEnvironment(Environments.Production),
            NullLogger<ProductionOwnerBootstrapper>.Instance);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            bootstrapper.StartAsync(CancellationToken.None));

        Assert.Contains(ProductionOwnerBootstrapper.PasswordKey, exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Production_bootstrap_is_disabled_by_default()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var bootstrapper = new ProductionOwnerBootstrapper(
            services.GetRequiredService<IServiceScopeFactory>(),
            Configuration([]),
            new TestHostEnvironment(Environments.Production),
            NullLogger<ProductionOwnerBootstrapper>.Instance);

        await bootstrapper.StartAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Production_credentials_are_ignored_outside_production()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var configuration = Configuration(new Dictionary<string, string?>
        {
            [ProductionOwnerBootstrapper.EnabledKey] = "true"
        });
        var bootstrapper = new ProductionOwnerBootstrapper(
            services.GetRequiredService<IServiceScopeFactory>(),
            configuration,
            new TestHostEnvironment(Environments.Staging),
            NullLogger<ProductionOwnerBootstrapper>.Instance);

        await bootstrapper.StartAsync(CancellationToken.None);
    }

    private static IConfiguration Configuration(IEnumerable<KeyValuePair<string, string?>> values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "LongBeach.UnitTests";
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
