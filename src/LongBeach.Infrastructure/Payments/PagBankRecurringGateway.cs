using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using LongBeach.Application.Billing;
using LongBeach.Contracts.Billing;
using LongBeach.Domain.Bar;
using Microsoft.Extensions.Configuration;
namespace LongBeach.Infrastructure.Payments;

public sealed class PagBankRecurringGateway(HttpClient http, IConfiguration config) : IRecurringGateway
{
    public bool Enabled => config.GetValue("Payments:PagBankSubscriptions:Enabled", false);
    private void Configure()
    {
        var url = config["Payments:PagBankSubscriptions:BaseUrl"] ?? "https://sandbox.api.assinaturas.pagseguro.com/";
        if (url is not ("https://sandbox.api.assinaturas.pagseguro.com/" or "https://api.assinaturas.pagseguro.com/")) throw new BarRuleException("Ambiente de assinaturas inválido.");
        var token = config["Payments:PagBankSubscriptions:Token"]; if (string.IsNullOrWhiteSpace(token)) throw new BarRuleException("Credencial de assinaturas ausente.");
        http.BaseAddress ??= new Uri(url); http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }
    private async Task<JsonElement> Request(HttpMethod method, string path, object? body, Guid? operation, CancellationToken ct)
    {
        Configure(); using var request = new HttpRequestMessage(method, path); if (body is not null) request.Content = JsonContent.Create(body);
        if (operation.HasValue) request.Headers.Add("x-idempotency-key", operation.Value.ToString("N"));
        using var response = await http.SendAsync(request, ct); if (!response.IsSuccessStatusCode) throw new BarRuleException("Assinatura aguardando confirmação do PagBank. Consulte antes de repetir.");
        if (response.StatusCode == System.Net.HttpStatusCode.NoContent) return JsonSerializer.SerializeToElement(new { });
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct)); return json.RootElement.Clone();
    }
    private static string Id(string id, string prefix) => Regex.IsMatch(id, "^" + prefix + "_[A-Za-z0-9-]+$") ? id : throw new BarRuleException("Identificador PagBank inválido.");
    private static string S(JsonElement r, string k) => r.GetProperty(k).GetString()!;
    private static RecurringState State(JsonElement r) => new(S(r, "id"), S(r, "reference_id"), S(r, "status"), r.GetProperty("amount").GetProperty("value").GetInt64(), S(r.GetProperty("amount"), "currency"));
    public async Task<string?> PublicKey(CancellationToken ct) => S(await Request(HttpMethod.Get, "public-keys", null, null, ct), "public_key");
    public async Task<string> CreatePlan(Guid reference, decimal amount, int trialDays, CancellationToken ct)
    {
        if (!Enabled) throw new BarRuleException("Novas assinaturas desabilitadas.");
        return S(await Request(HttpMethod.Post, "plans", new { reference_id = reference.ToString(), name = "Mensalidade Long Beach", amount = new { value = checked((long)(amount * 100)), currency = "BRL" }, interval = new { unit = "MONTH", length = 1 }, trial = new { enabled = trialDays > 0, days = trialDays, hold_setup_fee = false }, payment_method = new[] { "CREDIT_CARD" }, editable = false }, reference, ct), "id");
    }
    public async Task<RecurringState> Create(Guid reference, Guid operation, string plan, SubscribeInput i, CancellationToken ct)
    {
        if (!Enabled) throw new BarRuleException("Novas assinaturas desabilitadas.");
        var body = new { reference_id = reference.ToString(), plan = new { id = Id(plan, "PLAN") }, customer = new { reference_id = reference.ToString(), name = i.Name, email = i.Email, tax_id = i.TaxId, phones = new[] { new { country = "55", area = i.Phone[..2], number = i.Phone[2..] } }, billing_info = new[] { new { type = "CREDIT_CARD", card = new { encrypted = i.EncryptedCard } } } }, payment_method = new[] { new { type = "CREDIT_CARD", card = new { security_code = i.SecurityCode } } }, pro_rata = false, best_invoice_date = new { day = i.ExpectedFirstDue.Day.ToString() } };
        return State(await Request(HttpMethod.Post, "subscriptions", body, operation, ct));
    }
    public async Task<RecurringState> Get(string id, CancellationToken ct) => State(await Request(HttpMethod.Get, "subscriptions/" + Id(id, "SUBS"), null, null, ct));
    public async Task<RecurringState> Cancel(string id, Guid operation, CancellationToken ct)
    {
        var current = await Get(id, ct); if (current.State == "CANCELED") return current;
        await Request(HttpMethod.Put, "subscriptions/" + Id(id, "SUBS") + "/cancel", new { }, operation, ct); return await Get(id, ct);
    }
    public async Task<IReadOnlyList<RecurringInvoice>> Invoices(string id, CancellationToken ct)
    {
        var result = new List<RecurringInvoice>(); var seen = new HashSet<string>();
        for (var offset = 0; offset < 10000; offset += 100)
        {
            var page = await Request(HttpMethod.Get, $"subscriptions/{Id(id, "SUBS")}/invoices?offset={offset}&limit=100", null, null, ct);
            var invoices = page.GetProperty("invoices");
            foreach (var item in invoices.EnumerateArray())
            {
                var invoiceId = Id(S(item, "id"), "INVO"); if (!seen.Add(invoiceId)) throw new BarRuleException("Paginação de faturas inconsistente.");
                var invoice = await Request(HttpMethod.Get, "invoices/" + invoiceId, null, null, ct);
                if (S(invoice.GetProperty("subscription"), "id") != id) throw new BarRuleException("Fatura de outra assinatura.");
                var payments = await Request(HttpMethod.Get, $"invoices/{invoiceId}/payments", null, null, ct);
                var attempts = payments.GetProperty("payments");
                var complete = payments.GetProperty("result_set").GetProperty("total").GetInt32() == attempts.GetArrayLength();
                var safe = complete && attempts.EnumerateArray().All(p => S(p, "status") is "DENIED" or "UNPAID") && S(invoice, "status") is "UNPAID" or "OVERDUE";
                var paid = attempts.EnumerateArray().Where(p => S(p, "status") is "APPROVED" or "REFUNDED").ToArray();
                if (paid.Length > 1) throw new BarRuleException("Mais de um pagamento confirmado na mesma fatura. Conciliação necessária.");
                string? paymentId = null, state = null;
                if (paid.Length == 1)
                {
                    paymentId = Id(S(paid[0], "id"), "PAYM"); var p = await Request(HttpMethod.Get, "payments/" + paymentId, null, null, ct);
                    if (S(p.GetProperty("invoice"), "id") != invoiceId || p.GetProperty("invoice").GetProperty("amount").GetProperty("value").GetInt64() != invoice.GetProperty("amount").GetProperty("value").GetInt64() || S(p.GetProperty("invoice").GetProperty("amount"), "currency") != "BRL") throw new BarRuleException("Pagamento de assinatura divergente.");
                    state = S(p, "status");
                }
                result.Add(new(invoiceId, invoice.GetProperty("occurrence").GetInt32(), S(invoice, "status"), invoice.GetProperty("amount").GetProperty("value").GetInt64(), S(invoice.GetProperty("amount"), "currency"), paymentId, state, safe));
            }
            if (invoices.GetArrayLength() < 100) return result;
        }
        throw new BarRuleException("Limite de faturas excedido.");
    }
    public async Task Refund(string paymentId, Guid operation, decimal amount, decimal previous, CancellationToken ct)
    {
        var path = "payments/" + Id(paymentId, "PAYM"); var p = await Request(HttpMethod.Get, path, null, null, ct);
        if (previous != 0 || p.GetProperty("invoice").GetProperty("amount").GetProperty("value").GetInt64() != checked((long)(amount * 100))) throw new BarRuleException("Assinaturas permitem somente estorno total nesta integração.");
        if (S(p, "status") == "REFUNDED") return;
        await Request(HttpMethod.Post, path + "/refunds", new { }, operation, ct);
        if (S(await Request(HttpMethod.Get, path, null, null, ct), "status") != "REFUNDED") throw new BarRuleException("Estorno de assinatura ainda não confirmado.");
    }
}
