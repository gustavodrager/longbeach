using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class BarCashHttpContractPostgresTests
{
    [PostgresFact]
    public async Task Current_cash_is_valid_json_when_all_sessions_are_closed_and_preserves_open_session_contract()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        var owner = User.Create("Cash contract owner", $"cash-contract-{Guid.NewGuid():N}@example.invalid", "test-only-hash");
        var location = await db.Set<StockLocation>().SingleAsync(x => x.Name == "Bar");
        var register = new CashRegister("Cash contract register");
        var closed = new CashSession(register.Id, location.Id, owner.Id, "Previous shift", 25);
        closed.Close();
        db.AddRange(owner, register, closed);
        await db.SaveChangesAsync();

        var connection = db.Database.GetConnectionString();
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:LongBeach"] = connection,
                ["BackgroundJobs:Enabled"] = "false"
            }))
            .ConfigureServices(services => services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(connection))));
        using var client = factory.CreateClient();
        const string path = "/api/v1/bar/cash/current";

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Student");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Owner");

        using var empty = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, empty.StatusCode);
        Assert.Equal("application/json", empty.Content.Headers.ContentType?.MediaType);
        var body = await empty.Content.ReadAsStringAsync();
        Assert.Equal("null", body);
        using (var document = JsonDocument.Parse(body))
            Assert.Equal(JsonValueKind.Null, document.RootElement.ValueKind);
        Assert.Null(await empty.Content.ReadFromJsonAsync<CashHistoryRow>());

        var open = new CashSession(register.Id, location.Id, owner.Id, "Current shift", 50);
        db.Add(open);
        await db.SaveChangesAsync();

        using var current = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, current.StatusCode);
        Assert.Equal("application/json", current.Content.Headers.ContentType?.MediaType);
        using (var document = JsonDocument.Parse(await current.Content.ReadAsStringAsync()))
            Assert.Equal(
                new[] { "createdAtUtc", "expected", "id", "openedBy", "opening", "register", "responsible", "state", "terminal" },
                document.RootElement.EnumerateObject().Select(property => property.Name).Order().ToArray());
        var actual = await current.Content.ReadFromJsonAsync<CashHistoryRow>();
        Assert.NotNull(actual);
        Assert.Equal(open.Id, actual.Id);
        Assert.Equal(owner.Id, actual.OpenedBy);
        Assert.Equal(owner.Name, actual.Responsible);
        Assert.Equal(register.Name, actual.Register);
        Assert.Equal(open.Terminal, actual.Terminal);
        Assert.Equal("Open", actual.State);
        Assert.Equal(50, actual.Opening);
        Assert.Equal(50, actual.Expected);
        Assert.NotEqual(default, actual.CreatedAtUtc);
    }
}
