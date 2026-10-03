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

        services.AddScoped<IUserRepository, UserRepository>();
        services.Configure<Microsoft.AspNetCore.Identity.PasswordHasherOptions>(options =>
            options.IterationCount = 210_000);
        services.AddSingleton<IPasswordHasher, AspNetIdentityPasswordHasher>();
        services.AddSingleton<ITokenService, JwtTokenService>();
        services.AddScoped<PostgresHealthCheck>();
        services.AddHostedService<AuthorizationCatalogBootstrapper>();
        services.AddHostedService<DevelopmentAdminBootstrapper>();
        services.AddHostedService<ProductionOwnerBootstrapper>();

        return services;
    }
}
