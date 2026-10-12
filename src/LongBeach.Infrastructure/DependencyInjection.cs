using LongBeach.Application.Abstractions;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Bootstrap;
using LongBeach.Infrastructure.Health;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace LongBeach.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("LongBeach");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("ConnectionStrings:LongBeach must be configured.");
        }

        services.AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.SectionName))
            .Validate(options => !string.IsNullOrWhiteSpace(options.Issuer), "JWT issuer is required.")
            .Validate(options => !string.IsNullOrWhiteSpace(options.Audience), "JWT audience is required.")
            .Validate(options => options.SigningKey.Length >= 32, "JWT signing key must contain at least 32 characters.")
            .Validate(options => options.AccessTokenMinutes is >= 5 and <= 120, "Access token lifetime must be between 5 and 120 minutes.")
            .Validate(options => options.RefreshTokenDays is >= 1 and <= 90, "Refresh token lifetime must be between 1 and 90 days.")
            .ValidateOnStart();

        services.TryAddScoped<IAuditContext, NullAuditContext>();
        services.AddScoped<AuditSaveChangesInterceptor>();
        services.AddDbContext<LongBeachDbContext>((serviceProvider, options) =>
            options
                .UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsAssembly(typeof(LongBeachDbContext).Assembly.GetName().Name!))
                .AddInterceptors(serviceProvider.GetRequiredService<AuditSaveChangesInterceptor>()));

        services.AddScoped<LongBeach.Application.Teaching.ITeaching, LongBeach.Infrastructure.Teaching.TeachingService>();
        services.AddScoped<LongBeach.Application.Portal.IClientPortal, LongBeach.Infrastructure.Portal.ClientPortalService>();
        services.AddScoped<LongBeach.Application.Billing.IBilling, LongBeach.Infrastructure.Billing.BillingService>();
        services.AddHostedService<LongBeach.Infrastructure.Billing.BillingWorker>();
        services.AddHttpClient<LongBeach.Application.Billing.IRecurringGateway, LongBeach.Infrastructure.Payments.PagBankRecurringGateway>(client => client.Timeout = TimeSpan.FromSeconds(20)).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        services.AddHostedService<LongBeach.Infrastructure.Payments.PagBankReconciliationWorker>();
        services.AddScoped<LongBeach.Application.Finance.IFinancialHistory, LongBeach.Infrastructure.Finance.FinancialHistoryService>();
        services.AddHttpClient("PagBankEdi", client => client.Timeout = TimeSpan.FromSeconds(45))
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        services.AddSingleton<LongBeach.Infrastructure.Finance.PagBankEdiWorker>();
        services.AddSingleton<LongBeach.Application.Finance.IPagBankEdiCollection>(sp => sp.GetRequiredService<LongBeach.Infrastructure.Finance.PagBankEdiWorker>());
        services.AddHostedService(sp => sp.GetRequiredService<LongBeach.Infrastructure.Finance.PagBankEdiWorker>());
        services.AddSingleton<LongBeach.Infrastructure.Payments.PagBankWebhookKeys>();
        services.AddHttpClient<LongBeach.Application.Bar.IPaymentGateway, LongBeach.Infrastructure.Payments.PagBankPaymentGateway>(client => client.Timeout = TimeSpan.FromSeconds(20))
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        services.AddScoped<LongBeach.Application.Bar.IBarPayments, LongBeach.Infrastructure.Bar.BarPaymentsService>();
        services.AddScoped<LongBeach.Application.Bar.IBarTabs, LongBeach.Infrastructure.Bar.BarTabsService>();
        services.AddScoped<LongBeach.Application.Bar.IBarPurchases, LongBeach.Infrastructure.Bar.BarPurchasesService>();
        services.AddScoped<LongBeach.Application.Bar.IBarSales, LongBeach.Infrastructure.Bar.BarSalesService>();
        services.AddScoped<LongBeach.Application.Bar.IBarCash, LongBeach.Infrastructure.Bar.BarCashService>();
        services.AddScoped<LongBeach.Application.Bar.IBarStock, LongBeach.Infrastructure.Bar.BarStockService>();
        services.AddScoped<LongBeach.Application.Bar.IBarCatalog, LongBeach.Infrastructure.Bar.BarCatalogService>();
        services.AddScoped<LongBeach.Application.Bar.ICatalogImport, LongBeach.Infrastructure.Bar.CatalogImportService>();
        services.AddScoped<LongBeach.Application.Operations.IRentalGroups, LongBeach.Infrastructure.Operations.RentalGroupsService>();
        services.AddScoped<LongBeach.Application.Operations.IRentalGroupImport, LongBeach.Infrastructure.Operations.RentalGroupImportService>();
        services.AddScoped<LongBeach.Application.Operations.IGradeImport, LongBeach.Infrastructure.Operations.GradeImportService>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<LongBeach.Application.Auth.IGoogleClientRegistration, LongBeach.Infrastructure.Auth.GoogleClientRegistration>();
        services.Configure<Microsoft.AspNetCore.Identity.PasswordHasherOptions>(options =>
            options.IterationCount = 210_000);
        services.AddSingleton<IPasswordHasher, AspNetIdentityPasswordHasher>();
        services.AddSingleton<ITokenService, JwtTokenService>();
        services.AddScoped<PostgresHealthCheck>();
        services.AddHostedService<AuthorizationCatalogBootstrapper>();
        services.AddHostedService<DevelopmentAdminBootstrapper>();
        services.AddHostedService<ProductionOwnerBootstrapper>();
        services.AddHostedService<GoogleAllowedOwnerBootstrapper>();

        return services;
    }
}
