using System.Text.Json;

namespace LongBeach.Infrastructure.C6;

public interface IC6BankingApi
{
    Task<JsonDocument> Statement(DateOnly from, DateOnly through, CancellationToken ct);
    Task<JsonDocument> Balance(CancellationToken ct);
}

public sealed class C6BankingApi(C6ApiClient client) : IC6BankingApi
{
    public Task<JsonDocument> Statement(DateOnly from, DateOnly through, CancellationToken ct) =>
        client.Send(HttpMethod.Get, $"/v1/statement/?start_date={from:yyyy-MM-dd}&end_date={through:yyyy-MM-dd}", null, ct);
    public Task<JsonDocument> Balance(CancellationToken ct) => client.Send(HttpMethod.Get, "/v1/statement/balance", null, ct);
}

