using System.Security.Claims;
using LongBeach.Application.Auth;
using LongBeach.Application.Authorization;
using LongBeach.Application.Customers;
using LongBeach.Contracts.Auth;
using LongBeach.Contracts.Customers;
using LongBeach.Domain.Identity;
using Microsoft.AspNetCore.Authentication;

namespace LongBeach.Api.Endpoints;

public static class ClientAccessEndpoints
{
    private static Guid Actor(HttpContext http) => Guid.Parse(http.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private static bool LocalRegistration(IConfiguration config) => config.GetValue("Authentication:Local:Enabled", true)
        && config.GetValue("Authentication:Local:ClientRegistrationEnabled", false);
    private static VerifiedGoogleIdentity? Google(ClaimsPrincipal? principal)
    {
        var subject = principal?.FindFirstValue("sub"); var email = principal?.FindFirstValue("email");
        return principal?.FindFirstValue("email_verified") == "true" && !string.IsNullOrWhiteSpace(subject) && !string.IsNullOrWhiteSpace(email)
            ? new(subject, email, principal?.FindFirstValue("name")) : null;
    }
    public static IEndpointRouteBuilder MapClientAccessEndpoints(this IEndpointRouteBuilder endpoints, bool googleEnabled)
    {
        endpoints.MapGet("/api/v1/customers/access-review", async (HttpContext http, IClientAccess access, CancellationToken ct) =>
        { http.Response.Headers.CacheControl = "no-store"; return Results.Ok(await access.Readiness(ct)); })
            .RequireAuthorization(AuthorizationPolicyCatalog.Management, SystemPermissions.UsersManage, SystemPermissions.CustomersWrite);
        var auth = endpoints.MapGroup("/api/v1/auth").WithTags("Client access").AddEndpointFilter(async (context, next) =>
        { context.HttpContext.Response.Headers.CacheControl = "no-store"; return await next(context); });
        auth.MapPost("/register", async (ClientRegistrationInput input, IConfiguration config, IClientAccess access, CancellationToken ct) =>
        {
            if (!LocalRegistration(config)) return Results.StatusCode(403);
            await access.Register(input, ct); return Results.NoContent();
        }).AllowAnonymous().RequireRateLimiting("auth-login");
        auth.MapPost("/access/inspect", async (AccessTokenInput input, IClientAccess access, CancellationToken ct) => Results.Ok(await access.Inspect(input.Token, ct)))
            .AllowAnonymous().RequireRateLimiting("auth-login");
        auth.MapPost("/access/activate", async (AccessActivationInput input, IConfiguration config, IClientAccess access, CancellationToken ct) =>
        {
            if (!config.GetValue("Authentication:Local:Enabled", true)) return Results.StatusCode(403);
            await access.Activate(input, ct); return Results.NoContent();
        }).AllowAnonymous().RequireRateLimiting("auth-login");
        auth.MapPost("/access/recover", async (AccessActivationInput input, IConfiguration config, IClientAccess access, CancellationToken ct) =>
        {
            if (!config.GetValue("Authentication:Local:Enabled", true)) return Results.StatusCode(403);
            await access.Recover(input, ct); return Results.NoContent();
        }).AllowAnonymous().RequireRateLimiting("auth-login");
        if (googleEnabled)
        {
            auth.MapPost("/google/register", async (GoogleRegistrationInput input, HttpContext http, IConfiguration config, IClientAccess access, CancellationToken ct) =>
            {
                if (!config.GetValue<bool>("Authentication:Google:ClientRegistrationEnabled")) return Results.StatusCode(403);
                var google = Google(http.User); if (google is null) return Results.Unauthorized();
                await access.RegisterGoogle(input, google, ct); return Results.NoContent();
            }).RequireAuthorization("GoogleSignIn").RequireRateLimiting("auth-login");
            auth.MapPost("/access/activate/google", async (AccessTokenInput input, HttpContext http, IClientAccess access, CancellationToken ct) =>
            {
                var google = Google(http.User); if (google is null) return Results.Unauthorized();
                await access.ActivateGoogle(input.Token, google, ct); return Results.NoContent();
            }).RequireAuthorization("GoogleSignIn").RequireRateLimiting("auth-login");
        }
        var customers = endpoints.MapGroup("/api/v1/customers/{id:guid}")
            .RequireAuthorization(AuthorizationPolicyCatalog.Management, SystemPermissions.UsersManage, SystemPermissions.CustomersWrite)
            .AddEndpointFilter(async (context, next) => { context.HttpContext.Response.Headers.CacheControl = "no-store"; return await next(context); });
        customers.MapGet("/access", async (Guid id, IClientAccess access, CancellationToken ct) => Results.Ok(await access.Status(id, ct)));
        customers.MapPost("/access/invitations", async (Guid id, AccessIssueInput input, HttpContext http, IClientAccess access, CancellationToken ct) =>
            Results.Ok(await access.Issue(id, input, Actor(http), false, ct))).RequireRateLimiting("auth-login");
        customers.MapPost("/access/recovery", async (Guid id, AccessIssueInput input, HttpContext http, IClientAccess access, CancellationToken ct) =>
            Results.Ok(await access.Issue(id, input, Actor(http), true, ct))).RequireRateLimiting("auth-login");
        customers.MapPost("/access/revoke", async (Guid id, AccessIssueInput input, IClientAccess access, CancellationToken ct) =>
        { await access.Revoke(id, input, ct); return Results.NoContent(); });
        customers.MapGet("/guardians", async (Guid id, ICustomerGuardians guardians, CancellationToken ct) => Results.Ok(await guardians.List(id, ct)));
        customers.MapGet("/guardian-candidates", async (Guid id, string? search, ICustomerGuardians guardians, CancellationToken ct) => Results.Ok(await guardians.Candidates(id, search, ct)));
        customers.MapPut("/guardians/{userId:guid}", async (Guid id, Guid userId, CustomerGuardianInput input, HttpContext http, ICustomerGuardians guardians, CancellationToken ct) =>
            Results.Ok(await guardians.Set(id, userId, input, Actor(http), ct)));
        var me = endpoints.MapGroup("/api/v1/me/auth-methods").RequireAuthorization()
            .AddEndpointFilter(async (context, next) => { context.HttpContext.Response.Headers.CacheControl = "no-store"; return await next(context); });
        me.MapGet("/", async (HttpContext http, IClientAccess access, CancellationToken ct) => Results.Ok(await access.Methods(Actor(http), ct)));
        me.MapPut("/", async (AuthMethodsInput input, HttpContext http, IConfiguration config, IClientAccess access, CancellationToken ct) =>
        {
            if (input.Action == "password" && !config.GetValue("Authentication:Local:Enabled", true)) return Results.StatusCode(403);
            if (input.CurrentPassword?.Length > PasswordPolicy.MaximumLength) return Results.BadRequest();
            VerifiedGoogleIdentity? google = null;
            if (googleEnabled && http.Request.Headers.ContainsKey("X-Google-Id-Token"))
            {
                var result = await http.AuthenticateAsync("Google");
                if (!result.Succeeded || (google = Google(result.Principal)) is null) return Results.BadRequest(new { detail = "Não foi possível confirmar a conta Google. Tente novamente." });
            }
            await access.ChangeMethods(Actor(http), input, google, http.Connection.RemoteIpAddress?.ToString(), ct);
            return Results.NoContent();
        }).RequireRateLimiting("auth-login");
        return endpoints;
    }
}
