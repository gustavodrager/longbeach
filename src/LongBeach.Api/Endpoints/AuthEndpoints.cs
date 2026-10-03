using System.Security.Claims;
using LongBeach.Application.Auth;
using LongBeach.Contracts.Auth;

namespace LongBeach.Api.Endpoints;

public static class AuthEndpoints
{
    private const string RefreshCookie = "lb_refresh";
    private const string CsrfCookie = "lb_csrf";
    private const string ClientHeader = "X-LongBeach-Client";
    private const string CsrfHeader = "X-CSRF-Token";

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints, bool googleSignInEnabled)
    {
        var group = endpoints.MapGroup("/api/v1/auth").WithTags("Authentication");

        if (!googleSignInEnabled)
        {
            group.MapPost("/login", LoginAsync).AllowAnonymous().RequireRateLimiting("auth-login");
        }
        group.MapPost("/refresh", RefreshAsync).AllowAnonymous().RequireRateLimiting("auth-refresh");
        group.MapPost("/logout", LogoutAsync).AllowAnonymous();
        group.MapPost("/change-password", ChangePasswordAsync)
            .RequireAuthorization()
            .RequireRateLimiting("auth-login");
        group.MapGet("/me", CurrentUser).RequireAuthorization();

        if (googleSignInEnabled)
        {
            group.MapPost("/google", LoginWithGoogleAsync)
                .RequireAuthorization("GoogleSignIn")
                .RequireRateLimiting("auth-login");
        }

        return endpoints;
    }

    private static async Task<IResult> LoginWithGoogleAsync(
        ClaimsPrincipal principal,
        HttpContext httpContext,
        IConfiguration configuration,
        IAuthService authService,
        CancellationToken cancellationToken)
    {
        var email = principal.FindFirstValue("email");
        var allowedEmail = configuration["Authentication:Google:AllowedEmail"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(allowedEmail) ||
            !string.Equals(email, allowedEmail.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return Results.Unauthorized();
        }

        var session = await authService.LoginWithGoogleAsync(email, GetIpAddress(httpContext), cancellationToken);
        SetNoStore(httpContext.Response);
        SetSessionCookies(httpContext.Response, session, configuration);
        return Results.Ok(session.Response);
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request,
        HttpContext httpContext,
        IConfiguration configuration,
        IAuthService authService,
        CancellationToken cancellationToken)
    {
        var errors = ValidateLogin(request);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var session = await authService.LoginAsync(
            request.Email!,
            request.Password!,
            GetIpAddress(httpContext),
            cancellationToken);

        SetNoStore(httpContext.Response);
        if (IsMobile(httpContext.Request, configuration))
        {
            return Results.Ok(ToMobileResponse(session));
        }

        SetSessionCookies(httpContext.Response, session, configuration);
        return Results.Ok(session.Response);
    }

    private static async Task<IResult> RefreshAsync(
        RefreshRequest? request,
        HttpContext httpContext,
        IConfiguration configuration,
        IAuthService authService,
        CancellationToken cancellationToken)
    {
        var isMobile = IsMobile(httpContext.Request, configuration);
        if (!isMobile)
        {
            ValidateWebOrigin(httpContext.Request, configuration);
        }

        var refreshToken = isMobile
            ? request?.RefreshToken
            : httpContext.Request.Cookies[RefreshCookie];

        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(RefreshRequest.RefreshToken)] = ["Refresh token is required."]
            });
        }

        var session = await authService.RefreshAsync(
            refreshToken,
            isMobile ? null : httpContext.Request.Headers[CsrfHeader].ToString(),
            !isMobile,
            GetIpAddress(httpContext),
            cancellationToken);

        SetNoStore(httpContext.Response);
        if (isMobile)
        {
            return Results.Ok(ToMobileResponse(session));
        }

        SetSessionCookies(httpContext.Response, session, configuration);
        return Results.Ok(session.Response);
    }

    private static async Task<IResult> LogoutAsync(
        LogoutRequest? request,
        HttpContext httpContext,
        IConfiguration configuration,
        IAuthService authService,
        CancellationToken cancellationToken)
    {
        var isMobile = IsMobile(httpContext.Request, configuration);
        var refreshToken = isMobile
            ? request?.RefreshToken
            : httpContext.Request.Cookies[RefreshCookie];

        if (!string.IsNullOrWhiteSpace(refreshToken))
        {
            if (!isMobile)
            {
                ValidateWebOrigin(httpContext.Request, configuration);
            }

            await authService.LogoutAsync(
                refreshToken,
                isMobile ? null : httpContext.Request.Headers[CsrfHeader].ToString(),
                !isMobile,
                GetIpAddress(httpContext),
                cancellationToken);
        }

        if (!isMobile)
        {
            httpContext.Response.Cookies.Delete(RefreshCookie, RefreshCookieOptions());
            httpContext.Response.Cookies.Delete(CsrfCookie, CsrfCookieOptions(configuration));
        }

        return Results.NoContent();
    }

    private static async Task<IResult> ChangePasswordAsync(
        ChangePasswordRequest request,
        ClaimsPrincipal principal,
        HttpContext httpContext,
        IConfiguration configuration,
        IAuthService authService,
        CancellationToken cancellationToken)
    {
        var errors = ValidatePasswordChange(request);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
        {
            return Results.Unauthorized();
        }

        await authService.ChangePasswordAsync(
            userId,
            request.CurrentPassword!,
            request.NewPassword!,
            GetIpAddress(httpContext),
            cancellationToken);

        ClearSessionCookies(httpContext.Response, configuration);
        SetNoStore(httpContext.Response);
        return Results.Ok(new ChangePasswordResponse(
            "Password changed successfully. Sign in again with the new password.",
            true));
    }

    private static IResult CurrentUser(ClaimsPrincipal principal)
    {
        var idValue = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        _ = Guid.TryParse(idValue, out var id);

        return Results.Ok(new UserSummary(
            id,
            principal.FindFirstValue(ClaimTypes.Name) ?? string.Empty,
            principal.FindFirstValue("email") ?? string.Empty,
            principal.FindAll(ClaimTypes.Role).Select(claim => claim.Value).Distinct().ToArray(),
            principal.FindAll("permission").Select(claim => claim.Value).Distinct().ToArray()));
    }

    private static Dictionary<string, string[]> ValidateLogin(LoginRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            errors[nameof(request.Email)] = ["Email is required."];
        }
        else if (request.Email.Length > 320)
        {
            errors[nameof(request.Email)] = ["Email must contain at most 320 characters."];
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            errors[nameof(request.Password)] = ["Password is required."];
        }
        else if (request.Password.Length > 256)
        {
            errors[nameof(request.Password)] = ["Password must contain at most 256 characters."];
        }

        return errors;
    }

    private static Dictionary<string, string[]> ValidatePasswordChange(ChangePasswordRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.CurrentPassword))
        {
            errors[nameof(request.CurrentPassword)] = ["Current password is required."];
        }
        else if (request.CurrentPassword.Length > PasswordPolicy.MaximumLength)
        {
            errors[nameof(request.CurrentPassword)] =
                [$"Current password must contain at most {PasswordPolicy.MaximumLength} characters."];
        }

        if (string.IsNullOrWhiteSpace(request.NewPassword))
        {
            errors[nameof(request.NewPassword)] = ["New password is required."];
        }
        else if (request.NewPassword.Length > PasswordPolicy.MaximumLength)
        {
            errors[nameof(request.NewPassword)] =
                [$"New password must contain at most {PasswordPolicy.MaximumLength} characters."];
        }

        return errors;
    }

    private static string? GetIpAddress(HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString();

    private static bool IsMobile(HttpRequest request, IConfiguration configuration)
    {
        if (!string.Equals(request.Headers[ClientHeader].ToString(), "mobile", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var origin = request.Headers.Origin.ToString();
        if (string.IsNullOrWhiteSpace(origin))
        {
            return true;
        }

        var allowedOrigins = configuration
            .GetSection("Authentication:MobileAllowedOrigins")
            .Get<string[]>() ?? [];
        return allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);
    }

    private static void ValidateWebOrigin(HttpRequest request, IConfiguration configuration)
    {
        var origin = request.Headers.Origin.ToString();
        var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        if (string.IsNullOrWhiteSpace(origin) ||
            !allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
        {
            throw new CsrfValidationException();
        }
    }

    private static MobileAuthResponse ToMobileResponse(AuthSession session) =>
        new(
            session.Response.AccessToken,
            session.Response.AccessTokenExpiresAtUtc,
            session.RefreshToken,
            session.RefreshTokenExpiresAtUtc,
            session.Response.User);

    private static void SetSessionCookies(
        HttpResponse response,
        AuthSession session,
        IConfiguration configuration)
    {
        var refreshOptions = RefreshCookieOptions();
        refreshOptions.Expires = session.RefreshTokenExpiresAtUtc;
        response.Cookies.Append(RefreshCookie, session.RefreshToken, refreshOptions);

        var csrfOptions = CsrfCookieOptions(configuration);
        csrfOptions.Expires = session.RefreshTokenExpiresAtUtc;
        response.Cookies.Append(CsrfCookie, session.CsrfToken, csrfOptions);
    }

    private static void ClearSessionCookies(HttpResponse response, IConfiguration configuration)
    {
        response.Cookies.Delete(RefreshCookie, RefreshCookieOptions());
        response.Cookies.Delete(CsrfCookie, CsrfCookieOptions(configuration));
    }

    private static CookieOptions RefreshCookieOptions() => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Lax,
        Path = "/api/v1/auth",
        IsEssential = true
    };

    private static CookieOptions CsrfCookieOptions(IConfiguration configuration)
    {
        var domain = configuration["Authentication:CookieDomain"];
        return new CookieOptions
        {
            HttpOnly = false,
            Secure = true,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            Domain = string.IsNullOrWhiteSpace(domain) ? null : domain,
            IsEssential = true
        };
    }

    private static void SetNoStore(HttpResponse response)
    {
        response.Headers.CacheControl = "no-store";
        response.Headers.Pragma = "no-cache";
    }
}
