using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LongBeach.Application.Auth;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Identity;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class VisitorAccessTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Visitor_reads_published_menu_and_public_options_without_a_session_or_registration(bool operationalDemoFlag)
    {
        var registration = new RegistrationGuard();
        await using var factory = Factory(registration, operationalDemoFlag);
        using var client = factory.CreateClient();
        using var menu = await client.GetAsync("/api/v1/menu/published");
        Assert.Equal(HttpStatusCode.OK, menu.StatusCode);
        Assert.Equal("no-store", menu.Headers.CacheControl?.ToString());
        Assert.False(menu.Headers.Contains("Set-Cookie"));
        var document = await menu.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(new[] { "pages", "publishedAtUtc", "title", "version" }, document.EnumerateObject().Select(p => p.Name).Order().ToArray());
        var item = document.GetProperty("pages")[0].GetProperty("items")[0];
        Assert.Equal(new[] { "description", "id", "name", "price" }, item.EnumerateObject().Select(p => p.Name).Order().ToArray());
        Assert.Equal(5m, item.GetProperty("price").GetDecimal());

        using var options = await client.GetAsync("/api/v1/auth/options");
        Assert.Equal(HttpStatusCode.OK, options.StatusCode);
        Assert.Equal("no-store", options.Headers.CacheControl?.ToString());
        Assert.False(options.Headers.Contains("Set-Cookie"));
        var publicOptions = await options.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(new[] { "clientRegistrationEnabled", "googleClientId", "homologationLoginEnabled" }, publicOptions.EnumerateObject().Select(p => p.Name).Order().ToArray());
        Assert.True(publicOptions.GetProperty("clientRegistrationEnabled").GetBoolean());
        Assert.False(publicOptions.GetProperty("homologationLoginEnabled").GetBoolean());
        Assert.Equal(0, registration.Calls);
        Assert.Equal(new[] { "Manager", "Operations", "Student", "Teacher" }, SystemRoles.All.Order().ToArray());
        Assert.False(SystemRoles.IsValid("Visitor"));
    }

    [Fact]
    public async Task Visitor_cannot_read_or_change_private_data_even_if_a_demo_flag_was_left_enabled_in_production()
    {
        var registration = new RegistrationGuard();
        await using var factory = Factory(registration, operationalDemoFlag: true);
        using var client = factory.CreateClient();
        foreach (var path in new[]
        {
            "/api/v1/auth/me", "/api/v1/me/customer", "/api/v1/me/portal/profile", "/api/v1/me/portal/agenda",
            "/api/v1/me/billing/accounts", "/api/v1/me/teaching", "/api/v1/customers", "/api/v1/portal/requests",
            "/api/v1/operations/students", "/api/v1/operations/team", "/api/v1/operations/inventory", "/api/v1/operations/projects",
            "/api/v1/operations/classes", "/api/v1/operations/enrollments", "/api/v1/operations/presences",
            "/api/v1/operations/courts/schedule?date=2026-10-29", "/api/v1/teaching/access",
            "/api/v1/financial-history", "/api/v1/billing/accounts", "/api/v1/expenses", "/api/v1/received-invoices",
            "/api/v1/imports", "/api/v1/bar/menu", "/api/v1/bar/catalog", "/api/v1/bar/products", "/api/v1/bar/tabs",
            "/api/v1/bar/cash/current", "/api/v1/bar/client", "/api/v1/bar/client/catalog", "/api/v1/bar/client/config"
        })
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/google", new { email = "visitor@example.invalid", name = "Visitante", role = "Manager" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsJsonAsync("/api/v1/me/customer", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsJsonAsync("/api/v1/operations/students/00000000-0000-4000-8000-000000000001", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/bar/menu/publish", new { version = 1 })).StatusCode);
        Assert.Equal(0, registration.Calls);
    }

    private static Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> Factory(RegistrationGuard registration, bool operationalDemoFlag) =>
        new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .UseEnvironment("Production")
            .UseSetting("ConnectionStrings:LongBeach", "Host=127.0.0.1;Port=1;Database=visitor_test;Username=test;Password=test")
            .UseSetting("Cors:AllowedOrigins:0", "https://longbeach.test")
            .UseSetting("Authentication:Google:Enabled", "true")
            .UseSetting("Authentication:Google:ClientId", "visitor-test.apps.googleusercontent.com")
            .ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["BackgroundJobs:Enabled"] = "false",
                ["DemoMode:PublicOperationalData"] = operationalDemoFlag.ToString(),
                ["Authentication:Google:Enabled"] = "true",
                ["Authentication:Google:ClientId"] = "visitor-test.apps.googleusercontent.com",
                ["Authentication:Google:ClientRegistrationEnabled"] = "true",
                ["Authentication:Google:ProvisionAllowedEmailsAsOwners"] = "false",
                ["Bootstrap:InitialOwner:Enabled"] = "false"
            }))
            .ConfigureServices(services =>
            {
                services.AddSingleton<IBarMenu>(new PublishedMenuStub());
                services.AddSingleton<IGoogleClientRegistration>(registration);
            }));

    private sealed class RegistrationGuard : IGoogleClientRegistration
    {
        public int Calls { get; private set; }
        public Task EnsureClientAsync(string subject, string email, string? name, CancellationToken cancellationToken)
        { Calls++; throw new InvalidOperationException("Browsing as a visitor must not register an account."); }
    }

    private sealed class PublishedMenuStub : IBarMenu
    {
        public Task<MenuManagement> Get(CancellationToken ct) => throw new NotSupportedException();
        public Task<MenuManagement> Save(MenuSaveInput input, CancellationToken ct) => throw new NotSupportedException();
        public Task<MenuManagement> Publish(MenuPublishInput input, CancellationToken ct) => throw new NotSupportedException();
        public Task<PublishedMenu?> Published(CancellationToken ct) => Task.FromResult<PublishedMenu?>(new(1, DateTimeOffset.UtcNow, "Cardápio", [new("page", "Bebidas", 10, [new("water", "Água", "", 5)])]));
    }
}
