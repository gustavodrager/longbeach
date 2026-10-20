using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.C6;
using Microsoft.Extensions.Options;

namespace LongBeach.UnitTests;

public sealed class C6GatewayTests
{
    private static readonly Guid PaymentId = Guid.Parse("74c9dddf-9096-4893-b25a-89d22d74bf14");
    private static readonly Guid OperationId = Guid.Parse("19931e21-1e72-4132-a67d-7481eb091304");
    private static readonly string Txid = OperationId.ToString("N");
    private const string EndToEnd = "E12345678202610191200abcdefghijk";

    [Fact]
    public async Task Repeated_creation_uses_same_txid_and_only_creates_after_explicit_absence()
    {
        var time = new C6TestTime(); var created = false; var puts = 0; string? body = null;
        using var client = C6TestFixture.Client(async (request, ct) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/") return C6TestFixture.Auth();
            Assert.Equal("/v2/pix/cob/" + Txid, request.RequestUri.AbsolutePath);
            if (request.Method == HttpMethod.Put) { puts++; body = await request.Content!.ReadAsStringAsync(ct); created = true; return C6TestFixture.Json("{}", HttpStatusCode.Created); }
            return created ? C6TestFixture.Json(Charge()) : C6TestFixture.Json("{}", HttpStatusCode.NotFound);
        }, time: time);
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()), time);
        var first = await gateway.CreatePix(PaymentId, OperationId, 10, time.GetUtcNow().AddMinutes(10), Customer(), default);
        var repeated = await gateway.CreatePix(PaymentId, OperationId, 10, time.GetUtcNow().AddMinutes(10), Customer(), default);
        Assert.Equal(first, repeated); Assert.Equal(1, puts);
        Assert.Equal(Txid, first.OrderId); Assert.Equal(Txid, first.ChargeId);
        using var json = JsonDocument.Parse(body!);
        Assert.Equal("10.00", json.RootElement.GetProperty("valor").GetProperty("original").GetString());
        Assert.Equal(600, json.RootElement.GetProperty("calendario").GetProperty("expiracao").GetInt32());
        Assert.Equal(PaymentId.ToString(), first.Reference);
    }

    [Fact]
    public async Task Ambiguous_creation_is_recovered_by_reading_the_same_charge()
    {
        var time = new C6TestTime(); var created = false; var puts = 0;
        using var client = C6TestFixture.Client((request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/") return Task.FromResult(C6TestFixture.Auth());
            if (request.Method == HttpMethod.Put) { puts++; created = true; throw new HttpRequestException("untrusted detail"); }
            return Task.FromResult(created ? C6TestFixture.Json(Charge()) : C6TestFixture.Json("{}", HttpStatusCode.NotFound));
        }, time: time);
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()), time);
        var recovered = await gateway.CreatePix(PaymentId, OperationId, 10, time.GetUtcNow().AddMinutes(10), Customer(), default);
        Assert.Equal(Txid, recovered.OrderId); Assert.Equal(1, puts);
    }

    [Fact]
    public async Task Failed_initial_lookup_never_authorizes_creation()
    {
        var puts = 0; var time = new C6TestTime();
        using var client = C6TestFixture.Client((request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/") return Task.FromResult(C6TestFixture.Auth());
            if (request.Method == HttpMethod.Put) puts++;
            return Task.FromResult(C6TestFixture.Json("{}", HttpStatusCode.ServiceUnavailable));
        });
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()), time);
        await Assert.ThrowsAsync<C6ApiException>(() => gateway.CreatePix(PaymentId, OperationId, 10, time.GetUtcNow().AddMinutes(10), Customer(), default));
        Assert.Equal(0, puts);
    }

    [Theory]
    [InlineData("key")]
    [InlineData("scope")]
    [InlineData("txid")]
    [InlineData("receipt-value")]
    [InlineData("receipt-txid")]
    [InlineData("no-receipt")]
    [InlineData("missing-reference")]
    [InlineData("unknown-status")]
    public async Task Inconsistent_bank_evidence_never_confirms_payment(string fault)
    {
        var charge = Charge("CONCLUIDA", fault: fault);
        using var client = C6TestFixture.Client((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/" ? C6TestFixture.Auth() : C6TestFixture.Json(charge)));
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()), new C6TestTime());
        await Assert.ThrowsAsync<BarRuleException>(() => gateway.Get(Txid, default));
    }

    [Fact]
    public async Task Confirmed_payment_carries_account_environment_and_receipt_for_reconciliation()
    {
        using var client = C6TestFixture.Client((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/" ? C6TestFixture.Auth() : C6TestFixture.Json(Charge("CONCLUIDA"))));
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()));
        var result = await gateway.Get(Txid, default);
        Assert.Equal("PAID", result.State); Assert.Equal(1000, result.Amount); Assert.Equal("BRL", result.Currency);
        Assert.Equal("test-account", result.ProviderAccountId); Assert.Equal("Sandbox", result.ProviderEnvironment); Assert.Equal(EndToEnd, result.PixEndToEndId);
    }

    [Fact]
    public async Task Confirmed_charge_accepts_receipt_without_optional_txid_and_keeps_parent_binding()
    {
        var charge = JsonNode.Parse(Charge("CONCLUIDA"))!;
        charge["pix"]![0]!.AsObject().Remove("txid");
        using var client = C6TestFixture.Client((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/"
            ? C6TestFixture.Auth() : C6TestFixture.Json(charge.ToJsonString())));
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()));
        var result = await gateway.Get(Txid, default);
        Assert.Equal("PAID", result.State); Assert.Equal(Txid, result.OrderId);
        Assert.Equal(PaymentId.ToString(), result.Reference); Assert.Equal(EndToEnd, result.PixEndToEndId);
    }

    [Fact]
    public async Task Disabled_creation_still_allows_monitoring_existing_payments()
    {
        var options = C6TestFixture.Settings(); options.PixEnabled = false;
        using var client = C6TestFixture.Client((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/" ? C6TestFixture.Auth() : C6TestFixture.Json(Charge("CONCLUIDA"))), options);
        var gateway = new C6PaymentGateway(client, Options.Create(options), new C6TestTime());
        Assert.False(gateway.Enabled);
        Assert.Equal("PAID", (await gateway.Get(Txid, default)).State);
        Assert.Equal("PAID", (await gateway.CreatePix(PaymentId, OperationId, 10, DateTimeOffset.UtcNow.AddMinutes(10), Customer(), default)).State);
        Assert.False(gateway.VerifyWebhook("{}"u8.ToArray(), ["forged"]));
    }

    [Fact]
    public async Task Disabled_creation_blocks_new_charge_after_confirmed_absence()
    {
        var options = C6TestFixture.Settings(); options.PixEnabled = false; var puts = 0;
        using var client = C6TestFixture.Client((request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/") return Task.FromResult(C6TestFixture.Auth());
            if (request.Method == HttpMethod.Put) puts++;
            return Task.FromResult(C6TestFixture.Json("{}", HttpStatusCode.NotFound));
        }, options);
        var gateway = new C6PaymentGateway(client, Options.Create(options), new C6TestTime());
        await Assert.ThrowsAsync<BarRuleException>(() => gateway.CreatePix(PaymentId, OperationId, 10, DateTimeOffset.UtcNow.AddMinutes(10), Customer(), default));
        Assert.Equal(0, puts);
    }

    [Fact]
    public async Task Expired_active_charge_keeps_monitoring_without_creating_a_new_charge()
    {
        var time = new C6TestTime(); time.Advance(TimeSpan.FromHours(1));
        using var client = C6TestFixture.Client((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/" ? C6TestFixture.Auth() : C6TestFixture.Json(Charge())));
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()), time);
        var result = await gateway.Get(Txid, default);
        Assert.Equal("WAITING", result.State); Assert.Null(result.PixEndToEndId);
    }

    [Fact]
    public async Task Expired_uncreated_operation_never_sends_a_new_charge()
    {
        var time = new C6TestTime(); var puts = 0;
        using var client = C6TestFixture.Client((request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/") return Task.FromResult(C6TestFixture.Auth());
            if (request.Method == HttpMethod.Put) puts++;
            return Task.FromResult(C6TestFixture.Json("{}", HttpStatusCode.NotFound));
        });
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()), time);
        await Assert.ThrowsAsync<BarRuleException>(() => gateway.CreatePix(PaymentId, OperationId, 10, time.GetUtcNow().AddSeconds(-1), Customer(), default));
        Assert.Equal(0, puts);
    }

    [Fact]
    public async Task Bank_removal_is_authoritative_even_when_local_expiry_is_in_the_future()
    {
        using var client = C6TestFixture.Client((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/"
            ? C6TestFixture.Auth() : C6TestFixture.Json(Charge("REMOVIDA_PELO_USUARIO_RECEBEDOR"))));
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()), new C6TestTime());
        Assert.Equal("CANCELED", (await gateway.Get(Txid, default)).State);
    }

    [Fact]
    public async Task Refund_recovery_uses_same_operation_and_original_end_to_end_id()
    {
        var refund = Guid.NewGuid(); var completed = false; var puts = 0;
        using var client = C6TestFixture.Client((request, _) =>
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/v1/auth/") return Task.FromResult(C6TestFixture.Auth());
            if (path == "/v2/pix/cob/" + Txid) return Task.FromResult(C6TestFixture.Json(Charge("CONCLUIDA", completed ? refund.ToString("N") : null)));
            Assert.Equal($"/v2/pix/pix/{EndToEnd}/devolucao/{refund:N}", path);
            if (request.Method == HttpMethod.Put) { puts++; completed = true; throw new HttpRequestException(); }
            return Task.FromResult(completed ? C6TestFixture.Json(JsonSerializer.Serialize(new { id = refund.ToString("N"), valor = "5.00", status = "DEVOLVIDO" })) : C6TestFixture.Json("{}", HttpStatusCode.NotFound));
        });
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()));
        var first = await gateway.RefundPartial(Txid, refund, 5, 0, default);
        var retry = await gateway.RefundPartial(Txid, refund, 5, 0, default);
        Assert.Equal(500, first.Refunded); Assert.Equal(first, retry); Assert.Equal(1, puts);
    }

    [Fact]
    public async Task New_refund_is_blocked_while_another_bank_refund_is_processing()
    {
        var puts = 0;
        var charge = Charge("CONCLUIDA", Guid.NewGuid().ToString("N")).Replace("DEVOLVIDO", "EM_PROCESSAMENTO", StringComparison.Ordinal);
        using var client = C6TestFixture.Client((request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/") return Task.FromResult(C6TestFixture.Auth());
            if (request.Method == HttpMethod.Put) puts++;
            return Task.FromResult(request.RequestUri.AbsolutePath.Contains("/devolucao/", StringComparison.Ordinal)
                ? C6TestFixture.Json("{}", HttpStatusCode.NotFound) : C6TestFixture.Json(charge));
        });
        var gateway = new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings()));
        var exception = await Assert.ThrowsAsync<BarRuleException>(() => gateway.RefundPartial(Txid, Guid.NewGuid(), 5, 0, default));
        Assert.Contains("em processamento", exception.Message);
        Assert.Equal(0, puts);
    }

    private static PixCustomer Customer() => new("Pagador teste", "payer@longbeach.test", "12345678909");
    private static string Charge(string status = "ATIVA", string? refund = null, string? fault = null)
    {
        var metadata = new List<object> { new { nome = "longbeach-account-id", valor = fault == "scope" ? "another-account" : "test-account" } };
        if (fault != "missing-reference") metadata.Add(new { nome = "longbeach-payment-id", valor = PaymentId.ToString() });
        var receipts = status == "CONCLUIDA" && fault != "no-receipt" ? new object[]
        {
            new { endToEndId = EndToEnd, txid = fault == "receipt-txid" ? Guid.NewGuid().ToString("N") : Txid,
                valor = fault == "receipt-value" ? "9.00" : "10.00",
                devolucoes = refund is null ? Array.Empty<object>() : new object[] { new { id = refund, valor = "5.00", status = "DEVOLVIDO" } } }
        } : [];
        return JsonSerializer.Serialize(new
        {
            txid = fault == "txid" ? Guid.NewGuid().ToString("N") : Txid,
            chave = fault == "key" ? "another-key" : "pix-test@longbeach.test", infoAdicionais = metadata,
            valor = new { original = "10.00" }, status = fault == "unknown-status" ? "UNKNOWN" : status,
            calendario = new { criacao = "2026-10-19T12:00:00Z", expiracao = 600 }, pix = receipts, pixCopiaECola = "test-pix-code"
        });
    }
}
