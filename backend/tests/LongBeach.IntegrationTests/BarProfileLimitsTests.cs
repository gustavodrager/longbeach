using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Cash;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class BarProfileLimitsTests
{
    public static IEnumerable<object[]> RestrictedActions()
    {
        const string id = "00000000-0000-4000-8000-000000000001";
        foreach (var role in new[] { "Operations", "Teacher", "Student" })
        foreach (var action in new[]
        {
            ("POST", $"/sales/{id}/discount"), ("POST", $"/sales/{id}/courtesy"),
            ("POST", $"/sales/{id}/refund"), ("POST", $"/tabs/{id}/adjustments"),
            ("POST", $"/tabs/{id}/payments/{id}/refund"), ("POST", $"/tabs/{id}/items/{id}/reverse"),
            ("PUT", $"/products/{id}/stock"), ("PUT", "/stock/available"),
            ("POST", "/stock/transfers"), ("POST", "/counts"), ("POST", $"/counts/{id}/approve"),
            ("POST", "/purchases"), ("POST", $"/purchases/{id}/receive"),
            ("POST", $"/cash/sessions/{id}/reopen")
        }) yield return [role, action.Item1, "/api/v1/bar" + action.Item2];
    }

    [Theory]
    [MemberData(nameof(RestrictedActions))]
    public async Task Only_management_can_discount_refund_purchase_or_correct_stock_even_with_old_full_claims(string role, string method, string path)
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), [role]));
        using var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = new StringContent("{}", Encoding.UTF8, "application/json") };
        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task Current_cash_exposes_values_only_to_the_operator_who_opened_it_or_management()
    {
        var operatorId = Guid.NewGuid();
        var row = new CashHistoryRow(Guid.NewGuid(), operatorId, "Operador", "Bar", "Terminal", "Open", 125, 250, DateTimeOffset.UtcNow);
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureServices(services => services.AddSingleton<IBarCash>(new Cash(row))));
        using var client = factory.CreateClient(); const string path = "/api/v1/bar/cash/current";
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), ["Operations"]));
        Assert.Equal("null", await client.GetStringAsync(path));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ProfileAuthorizationTests.Token(operatorId, ["Operations"]));
        Assert.Equal(row, await client.GetFromJsonAsync<CashHistoryRow>(path));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), ["Manager"]));
        Assert.Equal(row, await client.GetFromJsonAsync<CashHistoryRow>(path));
    }

    private sealed class Cash(CashHistoryRow row) : IBarCash
    {
        public Task<CashHistoryRow?> Current(CancellationToken ct) => Task.FromResult<CashHistoryRow?>(row);
        public Task<CashHistoryPage> History(string? search, string? state, int page, CancellationToken ct) => throw new NotSupportedException();
        public Task<CashDetails> Details(Guid id, CancellationToken ct) => throw new NotSupportedException();
        public Task<IReadOnlyList<CashRegister>> Registers(CancellationToken ct) => throw new NotSupportedException();
        public Task<CashRegister> CreateRegister(string name, CancellationToken ct) => throw new NotSupportedException();
        public Task<IReadOnlyList<CashSession>> Sessions(CancellationToken ct) => throw new NotSupportedException();
        public Task<CashSession> Open(OpenCashInput input, Guid actor, CancellationToken ct) => throw new NotSupportedException();
        public Task<CashSession> Move(Guid id, CashMovementInput input, string kind, Guid actor, CancellationToken ct) => throw new NotSupportedException();
        public Task<CashClosing> Close(Guid id, CloseCashInput input, Guid actor, bool supervisor, CancellationToken ct) => throw new NotSupportedException();
        public Task<CashSession> Reopen(Guid id, string reason, Guid actor, CancellationToken ct) => throw new NotSupportedException();
    }
}
