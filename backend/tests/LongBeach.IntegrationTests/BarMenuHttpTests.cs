using System.Net;
using System.Net.Http.Json;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using Microsoft.Extensions.DependencyInjection;
namespace LongBeach.IntegrationTests;
public sealed class BarMenuHttpTests
{
    [Fact]
    public async Task Public_endpoint_is_anonymous_and_exposes_only_presentation_fields()
    {
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(b => b.ConfigureServices(s => s.AddSingleton<IBarMenu>(new PublicMenuStub())));
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/v1/menu/published");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"price\":5", json);
        foreach (var hidden in new[] { "draft", "productIds", "averageCost", "stock", "supplier", "password" }) Assert.DoesNotContain(hidden, json);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/bar/menu")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsJsonAsync("/api/v1/bar/menu", new { })).StatusCode);
    }
    private sealed class PublicMenuStub : IBarMenu
    {
        public Task<MenuManagement> Get(CancellationToken ct) => throw new NotSupportedException();
        public Task<MenuManagement> Save(MenuSaveInput i, CancellationToken ct) => throw new NotSupportedException();
        public Task<MenuManagement> Publish(MenuPublishInput i, CancellationToken ct) => throw new NotSupportedException();
        public Task<PublishedMenu?> Published(CancellationToken ct) => Task.FromResult<PublishedMenu?>(new(1, DateTimeOffset.UtcNow, "Cardápio", [new("p", "Bebidas", 10, [new("i", "Água", "", 5)])]));
    }
}
