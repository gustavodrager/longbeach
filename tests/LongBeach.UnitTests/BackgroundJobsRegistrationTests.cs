using LongBeach.Application;
using LongBeach.Application.Finance;
using LongBeach.Infrastructure;
using LongBeach.Infrastructure.Billing;
using LongBeach.Infrastructure.Bootstrap;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Payments;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace LongBeach.UnitTests;

public sealed class BackgroundJobsRegistrationTests
{
    private static readonly Type[] HostedServices =
    [
        typeof(BillingWorker),
        typeof(PagBankReconciliationWorker),
        typeof(C6BankingWorker),
        typeof(PagBankEdiWorker),
        typeof(AuthorizationCatalogBootstrapper),
        typeof(DevelopmentAdminBootstrapper),
        typeof(ProductionOwnerBootstrapper),
        typeof(GoogleAllowedOwnerBootstrapper)
    ];

    [Theory]
    [InlineData(null)]
    [InlineData("true")]
    public void Default_and_enabled_configuration_preserve_all_background_services(string? enabled)
    {
        var builder = Builder(enabled);
        using var host = builder.Build();

        var services = host.Services.GetServices<IHostedService>().ToArray();

        Assert.Equal(HostedServices, services.Select(service => service.GetType()));
        Assert.Same(host.Services.GetRequiredService<IC6Collection>(), services.OfType<C6BankingWorker>().Single());
        Assert.Same(host.Services.GetRequiredService<IPagBankEdiCollection>(), services.OfType<PagBankEdiWorker>().Single());
    }

    [Fact]
    public async Task Disabled_configuration_starts_without_polling_or_running_enabled_bootstrappers()
    {
        var builder = Builder("false");
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authorization:SeedOnStartup"] = "true",
            [ProductionOwnerBootstrapper.EnabledKey] = "true",
            [GoogleAllowedOwnerBootstrapper.EnabledKey] = "true",
            ["Integrations:C6:Enabled"] = "true",
            ["Integrations:PagBankEdi:Enabled"] = "true"
        });
        using var host = builder.Build();

        Assert.Empty(host.Services.GetServices<IHostedService>());
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await host.StartAsync(timeout.Token);
        await host.StopAsync(timeout.Token);
    }

    [Fact]
    public void Disabled_configuration_keeps_explicit_collectors_and_migrations_available()
    {
        var builder = Builder("false");
        using var host = builder.Build();
        using var scope = host.Services.CreateScope();

        Assert.Same(host.Services.GetRequiredService<C6BankingWorker>(), host.Services.GetRequiredService<IC6Collection>());
        Assert.Same(host.Services.GetRequiredService<PagBankEdiWorker>(), host.Services.GetRequiredService<IPagBankEdiCollection>());
        var database = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        Assert.NotEmpty(database.Database.GetMigrations());
        Assert.Equal("/cloudsql/test-project:southamerica-east1:test-instance/.s.PGSQL.5432",
            database.Database.GetDbConnection().DataSource);
    }

    private static HostApplicationBuilder Builder(string? enabled)
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
        {
            DisableDefaults = true,
            EnvironmentName = Environments.Production
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:LongBeach"] = "Host=/cloudsql/test-project:southamerica-east1:test-instance;Database=test;Username=test;Password=test;Timeout=1",
            ["Authentication:Jwt:Issuer"] = "LongBeach.Tests",
            ["Authentication:Jwt:Audience"] = "LongBeach.Tests.Client",
            ["Authentication:Jwt:SigningKey"] = "tests-only-signing-key-with-more-than-32-characters"
        });
        if (enabled is not null)
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["BackgroundJobs:Enabled"] = enabled });
        builder.Services.AddApplication();
        builder.Services.AddInfrastructure(builder.Configuration);
        return builder;
    }
}
