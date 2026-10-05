using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using LongBeach.Api.Endpoints;
using LongBeach.Api.Infrastructure;
using LongBeach.Api.Middleware;
using LongBeach.Api.Startup;
using LongBeach.Application;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Application.Authorization;
using LongBeach.Infrastructure;
using LongBeach.Infrastructure.Bootstrap;
using LongBeach.Infrastructure.Health;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using Serilog;

var builder = WebApplication.CreateBuilder(args);
var startupCommand = StartupCommandParser.Parse(args);
var verifyGoogleOwners = args.Contains("--verify-google-owners", StringComparer.OrdinalIgnoreCase);
if (verifyGoogleOwners && startupCommand == StartupCommand.MigrateOnly)
{
    throw new InvalidOperationException("--verify-google-owners cannot be combined with --migrate-only.");
}

builder.Host.UseSerilog((context, services, logger) => logger
    .ReadFrom.Configuration(context.Configuration)
    .ReadFrom.Services(services)
    .Enrich.FromLogContext());

builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddApplication();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IAuditContext, HttpAuditContext>();
builder.Services.AddInfrastructure(builder.Configuration);

ConfigureAuthentication(builder.Services, builder.Configuration);
ConfigureAuthorization(builder.Services, builder.Configuration);
ConfigureCors(builder.Services, builder.Configuration, builder.Environment);
ConfigureForwardedHeaders(builder.Services, builder.Configuration);
ConfigureHealthChecks(builder.Services, builder.Configuration);
ConfigureRateLimiting(builder.Services);

var app = builder.Build();

if (verifyGoogleOwners)
{
    try
    {
        await using var verificationScope = app.Services.CreateAsyncScope();
        var verificationDbContext = verificationScope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var verification = new GoogleOwnerVerifier(verificationDbContext, app.Configuration, app.Environment);
        var result = await verification.VerifyAsync(CancellationToken.None);
        app.Logger.LogInformation(
            "Google Owner verification: target count {TargetCount}; active Owner count {ActiveOwnerCount}; grants outside targets {OutsideTargetGrantCount}; succeeded {Succeeded}.",
            result.TargetCount, result.ActiveOwnerCount, result.OutsideTargetGrantCount, result.Succeeded);
        Environment.ExitCode = result.Succeeded ? 0 : 1;
    }
    catch (Exception)
    {
        app.Logger.LogError("Google Owner verification completed: succeeded false.");
        Environment.ExitCode = 1;
    }
    return;
}

if (startupCommand == StartupCommand.MigrateOnly)
{
    await using var migrationScope = app.Services.CreateAsyncScope();
    var migrationDbContext = migrationScope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
    await migrationDbContext.Database.MigrateAsync();
    app.Logger.LogInformation("Database migrations completed successfully.");
    return;
}

app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api/v1"))
    {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers.Pragma = "no-cache";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
    }
    await next(context);
});
app.UseSerilogRequestLogging();
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseCors("web-client");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Test"))
{
    app.MapOpenApi().AllowAnonymous();
}

app.MapHealthChecks("/health", new HealthCheckOptions
{
    Predicate = _ => true
}).AllowAnonymous();

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = registration => registration.Tags.Contains("live")
}).AllowAnonymous();

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = registration => registration.Tags.Contains("ready") || registration.Tags.Contains("live")
}).AllowAnonymous();

app.MapBarEndpoints();
app.MapBarTabsEndpoints();
app.MapImportEndpoints();
app.MapAuthEndpoints(builder.Configuration.GetValue<bool>("Authentication:Google:Enabled"));
var publicOperationalDemo = !app.Environment.IsProduction() && app.Configuration.GetValue("DemoMode:PublicOperationalData", false);
app.MapOperationalEndpoints(publicOperationalDemo);

if (app.Configuration.GetValue("Database:MigrateOnStartup", false))
{
    await using var scope = app.Services.CreateAsyncScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
    await dbContext.Database.MigrateAsync();
}

await app.RunAsync();

static void ConfigureAuthentication(IServiceCollection services, IConfiguration configuration)
{
    var authentication = services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer();

    if (configuration.GetValue<bool>("Authentication:Google:Enabled"))
    {
        var googleClientId = configuration["Authentication:Google:ClientId"];
        if (string.IsNullOrWhiteSpace(googleClientId))
        {
            throw new InvalidOperationException("Authentication:Google:ClientId is required when Google sign-in is enabled.");
        }
        if (GoogleEmailAllowlist.Parse(configuration["Authentication:Google:AllowedEmail"]).Length == 0)
        {
            throw new InvalidOperationException("Authentication:Google:AllowedEmail is required when Google sign-in is enabled.");
        }

        authentication.AddJwtBearer("Google", google =>
        {
            google.Authority = "https://accounts.google.com";
            google.Audience = googleClientId;
            google.RequireHttpsMetadata = true;
            google.MapInboundClaims = false;
            google.TokenValidationParameters.ValidIssuers = ["https://accounts.google.com", "accounts.google.com"];
            google.TokenValidationParameters.ValidAudience = googleClientId;
        });
    }

    services
        .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
        .Configure<Microsoft.Extensions.Options.IOptions<JwtOptions>>((jwt, configuredOptions) =>
        {
            var options = configuredOptions.Value;
            jwt.MapInboundClaims = false;
            jwt.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = options.Issuer,
                ValidateAudience = true,
                ValidAudience = options.Audience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SigningKey)),
                ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                ValidateLifetime = true,
                RequireExpirationTime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
                NameClaimType = ClaimTypes.Name,
                RoleClaimType = ClaimTypes.Role
            };
        });
}

static void ConfigureAuthorization(IServiceCollection services, IConfiguration configuration)
{
    services.AddAuthorization(options =>
    {
        options.FallbackPolicy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .Build();
        options.AddPolicy(AuthorizationPolicyCatalog.Owner, policy =>
            policy.RequireRole(AuthorizationPolicyCatalog.Owner));
        options.AddPolicy("Administrator", policy => policy.RequireRole(
            AuthorizationPolicyCatalog.Owner,
            AuthorizationPolicyCatalog.Administrator));
        foreach (var permission in AuthorizationPolicyCatalog.Permissions)
        {
            options.AddPolicy(permission, policy => policy.RequireClaim("permission", permission));
        }

        if (configuration.GetValue<bool>("Authentication:Google:Enabled"))
        {
            options.AddPolicy("GoogleSignIn", policy => policy
                .AddAuthenticationSchemes("Google")
                .RequireAuthenticatedUser()
                .RequireClaim("email_verified", "true"));
        }
    });
}

static void ConfigureRateLimiting(IServiceCollection services)
{
    services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.AddPolicy("auth-login", context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                AutoReplenishment = true
            }));
        options.AddPolicy("auth-refresh", context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                AutoReplenishment = true
            }));
        options.AddPolicy("public-demo-write", context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                AutoReplenishment = true
            }));
    });
}

static void ConfigureCors(
    IServiceCollection services,
    IConfiguration configuration,
    IHostEnvironment environment)
{
    var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
    var mobileOrigins = configuration.GetSection("Authentication:MobileAllowedOrigins").Get<string[]>() ?? [];
    var corsOrigins = allowedOrigins
        .Concat(mobileOrigins)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();
    if (allowedOrigins.Length == 0 && !environment.IsDevelopment() && !environment.IsEnvironment("Test"))
    {
        throw new InvalidOperationException("Cors:AllowedOrigins must be configured outside Development and Test.");
    }

    services.AddCors(options => options.AddPolicy("web-client", policy =>
    {
        if (corsOrigins.Length == 0)
        {
            policy.SetIsOriginAllowed(_ => true);
        }
        else
        {
            policy.WithOrigins(corsOrigins);
        }

        policy.AllowAnyHeader().AllowAnyMethod().AllowCredentials();
    }));
}

static void ConfigureHealthChecks(IServiceCollection services, IConfiguration configuration)
{
    var checks = services.AddHealthChecks()
        .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"]);

    if (configuration.GetValue("HealthChecks:DatabaseEnabled", true))
    {
        checks.AddCheck<PostgresHealthCheck>("postgresql", tags: ["ready"]);
    }
}

static void ConfigureForwardedHeaders(IServiceCollection services, IConfiguration configuration)
{
    services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = 1;

        if (configuration.GetValue("ReverseProxy:TrustAllForwarders", false))
        {
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        }
    });
}

public partial class Program { }
