using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Infrastructure.Security;
using Microsoft.Extensions.Options;

namespace LongBeach.IntegrationTests;

public sealed class PasswordChangeApiTests(LongBeachWebApplicationFactory factory)
    : IClassFixture<LongBeachWebApplicationFactory>
{
    [Fact]
    public async Task Authenticated_password_change_requires_reauthentication_and_clears_web_session_cookies()
    {
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            IssueAccessToken());

        var response = await client.PostAsJsonAsync("/api/v1/auth/change-password", new
        {
            currentPassword = "CurrentPassword1!",
            newPassword = "NewPassword2026!"
        });
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        var cookies = response.Headers.GetValues("Set-Cookie").ToArray();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(json.RootElement.GetProperty("requiresReauthentication").GetBoolean());
        Assert.Contains("Sign in again", json.RootElement.GetProperty("message").GetString());
        Assert.Contains(cookies, value =>
            value.StartsWith("lb_refresh=", StringComparison.OrdinalIgnoreCase) &&
            value.Contains("expires=", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(cookies, value =>
            value.StartsWith("lb_csrf=", StringComparison.OrdinalIgnoreCase) &&
            value.Contains("expires=", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    private static string IssueAccessToken()
    {
        var tokenService = new JwtTokenService(Options.Create(new JwtOptions
        {
            Issuer = "LongBeach.Tests",
            Audience = "LongBeach.Tests.Client",
            SigningKey = "integration-tests-only-signing-key-with-more-than-32-characters",
            AccessTokenMinutes = 15,
            RefreshTokenDays = 30
        }));
        var issued = tokenService.Issue(
            new TokenPrincipal(
                Guid.Parse("11111111-1111-1111-1111-111111111111"),
                "Arena Owner",
                "owner@longbeach.test",
                ["Owner"],
                ["users:manage"]),
            DateTimeOffset.UtcNow);

        return issued.AccessToken;
    }
}
