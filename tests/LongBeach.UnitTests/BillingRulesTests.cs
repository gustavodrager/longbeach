using LongBeach.Domain.Billing;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Payments;
using LongBeach.Application.Bar;
using Microsoft.Extensions.Configuration;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Security.Cryptography;
namespace LongBeach.UnitTests;

public sealed class BillingRulesTests
{
    [Fact]
    public void Repeated_or_older_notifications_do_not_regress_receipt_or_refund()
    {
        var p = new BillingPayment(Guid.NewGuid(), Guid.NewGuid(), 100, "Pix", Guid.NewGuid(), DateTimeOffset.UtcNow); var now = DateTimeOffset.UtcNow;
        p.Observe("PAID", 0, now); var version = p.Version; p.Observe("PAID", 0, now.AddHours(1)); Assert.Equal(version, p.Version); Assert.Equal(now, p.PaidAtUtc);
        p.Observe("PAID", 40, now); p.Observe("WAITING", 0, now); Assert.Equal(40, p.Refunded); Assert.Equal("Approved", p.State);
        p.Observe("PAID", 100, now); p.Observe("PAID", 0, now); Assert.Equal("Refunded", p.State); Assert.Equal(100, p.Refunded);
    }
    [Fact]
    public void Canceled_payment_cannot_silently_become_paid_after_balance_was_released()
    {
        var p = new BillingPayment(Guid.NewGuid(), Guid.NewGuid(), 100, "Pix", Guid.NewGuid(), DateTimeOffset.UtcNow); p.Observe("CANCELED", 0, DateTimeOffset.UtcNow);
        Assert.Throws<BarRuleException>(() => p.Observe("PAID", 0, DateTimeOffset.UtcNow));
    }
    [Fact]
    public async Task Card_sends_only_encrypted_data_one_installment_and_recovers_with_new_payments_disabled()
    {
        JsonElement sent = default; var reference = Guid.NewGuid(); var op = Guid.NewGuid();
        using var http = new HttpClient(new Handler(async request =>
        {
            if (request.Method == HttpMethod.Post) { Assert.Equal(op.ToString(), request.Headers.GetValues("x-idempotency-key").Single()); using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync()); sent = body.RootElement.Clone(); }
            return Json(new { id = "ORDE_TEST", charges = new[] { new { id = "CHAR_TEST", reference_id = reference.ToString(), status = "DECLINED", amount = new { value = 10000, currency = "BRL" } } } });
        }));
        var config = Config(new() { ["Payments:PagBank:Enabled"] = "true", ["Payments:PagBank:CardEnabled"] = "true", ["Payments:PagBank:Token"] = "test-token", ["Payments:PagBank:WebhookUrl"] = "https://example.invalid/webhook" }); var gateway = new PagBankPaymentGateway(http, config);
        await gateway.CreateCard(reference, op, 100, new PixCustomer("Teste", "test@example.invalid", "12345678909"), "encrypted-test", default);
        var method = sent.GetProperty("charges")[0].GetProperty("payment_method"); Assert.Equal(1, method.GetProperty("installments").GetInt32()); Assert.Equal("CREDIT_CARD", method.GetProperty("type").GetString()); Assert.Equal("encrypted-test", method.GetProperty("card").GetProperty("encrypted").GetString()); Assert.False(method.GetProperty("card").GetProperty("store").GetBoolean()); Assert.False(method.GetProperty("card").TryGetProperty("security_code", out _));
        config["Payments:PagBank:Enabled"] = "false"; Assert.Equal("DECLINED", (await gateway.Get("ORDE_TEST", default)).State); await Assert.ThrowsAsync<BarRuleException>(() => gateway.CreateCard(reference, op, 100, new("Teste", "test@example.invalid", "12345678909"), "encrypted-test", default));
    }
    [Fact]
    public async Task Webhook_refreshes_public_key_once_and_rejects_changed_bytes()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256); var requests = 0;
        using var http = new HttpClient(new Handler(request => { requests++; Assert.Equal("?type=webhook", request.RequestUri!.Query); return Task.FromResult(Json(new { public_key = Convert.ToBase64String(key.ExportSubjectPublicKeyInfo()) })); }));
        var g = new PagBankPaymentGateway(http, Config(new() { ["Payments:PagBank:Token"] = "test", ["Payments:PagBank:RefreshWebhookKeys"] = "true" }));
        var body = Encoding.UTF8.GetBytes("{\"id\":\"ORDE_TEST\"}"); var signature = Convert.ToBase64String(key.SignData(body, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence));
        Assert.True(await g.VerifyWebhookAsync(body, ["invalid," + signature], default)); Assert.True(await g.VerifyWebhookAsync(body, [signature], default)); Assert.False(await g.VerifyWebhookAsync([1, 2], [signature], default)); Assert.Equal(1, requests);
    }
    [Fact]
    public void Settlement_requires_balanced_amounts() => Assert.Throws<BarRuleException>(() => new BillingSettlement(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "event", 100, 3, 99, DateOnly.FromDateTime(DateTime.UtcNow)));
    private static IConfigurationRoot Config(Dictionary<string, string?> values) => new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    private static HttpResponseMessage Json(object body) => new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };
    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> run) : HttpMessageHandler { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => run(request); }
}
