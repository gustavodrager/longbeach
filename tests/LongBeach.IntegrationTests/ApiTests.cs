using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LongBeach.Api.Startup;

namespace LongBeach.IntegrationTests;

public sealed class ApiTests(LongBeachWebApplicationFactory factory)
    : IClassFixture<LongBeachWebApplicationFactory>
{
    [Theory]
    [InlineData("--migrate-only")]
    [InlineData("--MIGRATE-ONLY")]
    public void Startup_command_parser_recognizes_migration_mode(string argument)
    {
        Assert.Equal(StartupCommand.MigrateOnly, StartupCommandParser.Parse([argument]));
    }

    [Fact]
    public void Startup_command_parser_defaults_to_run_mode()
    {
        Assert.Equal(StartupCommand.Run, StartupCommandParser.Parse(["--urls", "http://localhost:5100"]));
    }

    [Fact]
    public async Task Health_is_available_without_a_database_in_test_mode()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Me_requires_an_access_token()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Browser_login_keeps_refresh_token_out_of_the_body_and_in_a_secure_cookie()
    {
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = "owner@longbeach.test",
            password = "password"
        });
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        var cookies = response.Headers.GetValues("Set-Cookie").ToArray();
        var refreshCookie = Assert.Single(cookies, value => value.StartsWith("lb_refresh=", StringComparison.OrdinalIgnoreCase));
        var csrfCookie = Assert.Single(cookies, value => value.StartsWith("lb_csrf=", StringComparison.OrdinalIgnoreCase));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(json.RootElement.TryGetProperty("accessToken", out _));
        Assert.True(json.RootElement.TryGetProperty("csrfToken", out _));
        Assert.False(json.RootElement.TryGetProperty("refreshToken", out _));
        Assert.Contains("httponly", refreshCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", refreshCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", refreshCookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("httponly", csrfCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/", csrfCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", csrfCookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Mobile_login_uses_the_explicit_transport_contract()
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login")
        {
            Content = JsonContent.Create(new
            {
                email = "owner@longbeach.test",
                password = "password"
            })
        };
        request.Headers.Add("X-LongBeach-Client", "mobile");

        var response = await client.SendAsync(request);
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("refresh-token", json.RootElement.GetProperty("refreshToken").GetString());
        Assert.False(response.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Capacitor_origin_can_use_mobile_contract()
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login")
        {
            Content = JsonContent.Create(new { email = "owner@longbeach.test", password = "password" })
        };
        request.Headers.Add("X-LongBeach-Client", "mobile");
        request.Headers.Add("Origin", "capacitor://localhost");

        var response = await client.SendAsync(request);
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.Equal("refresh-token", json.RootElement.GetProperty("refreshToken").GetString());
    }

    [Fact]
    public async Task Web_origin_cannot_switch_to_mobile_contract_with_a_header()
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login")
        {
            Content = JsonContent.Create(new { email = "owner@longbeach.test", password = "password" })
        };
        request.Headers.Add("X-LongBeach-Client", "mobile");
        request.Headers.Add("Origin", "https://longbeach.test");

        var response = await client.SendAsync(request);
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.False(json.RootElement.TryGetProperty("refreshToken", out _));
        Assert.True(response.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Empty_login_returns_validation_problem()
    {
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Browser_refresh_rejects_a_missing_origin()
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh")
        {
            Content = JsonContent.Create(new { })
        };
        request.Headers.Add("Cookie", "lb_refresh=refresh-token");
        request.Headers.Add("X-CSRF-Token", "csrf-token");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
