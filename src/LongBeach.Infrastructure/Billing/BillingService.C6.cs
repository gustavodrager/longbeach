using System.Text.Json;
using LongBeach.Domain.Billing;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Billing;

public sealed partial class BillingService
{
    private const int C6WebhookCandidateLimit = 5;
    private void AuditC6(BillingPayment payment, string action, Guid? actor = null) => db.AuditLogs.Add(LongBeach.Domain.Auditing.AuditLog.Create(
        actor, action, "BillingPayment", payment.Id.ToString(), JsonSerializer.Serialize(new
        {
            payment.OperationId, payment.Provider, payment.ProviderEnvironment, payment.ProviderAccountId,
            payment.State, payment.Amount, payment.Refunded
        }), null, "LongBeachOS", payment.OperationId.ToString(), time.GetUtcNow()));

    // The public callback is a bounded hint only: no balance or payment status is trusted.
    // Unknown txids and payments from another account/environment never cause bank requests.
    public async Task<bool> C6PixNotification(byte[] body, CancellationToken ct)
    {
        if (paymentGateways is null || body.Length > 65536) return false;
        using var json = JsonDocument.Parse(body, new JsonDocumentOptions { MaxDepth = 16 });
        if (json.RootElement.ValueKind != JsonValueKind.Object) return false;
        var payload = json.RootElement;
        var wrapped = payload.TryGetProperty("information", out var information);
        if (wrapped && (HintText(payload, "service") != "PIX" || information.ValueKind != JsonValueKind.String)) return false;
        if (!wrapped && payload.TryGetProperty("service", out _)) return false;
        // C6's webhook service sends an escaped JSON string in information. Bound both
        // document depths and parse it before using any of its transaction hints.
        using var nested = wrapped ? JsonDocument.Parse(information.GetString()!, new JsonDocumentOptions { MaxDepth = 16 }) : null;
        if (wrapped)
        {
            if (!paymentGateways.MatchesC6WebhookKey(HintText(payload, "key"))) return false;
            payload = nested!.RootElement;
        }
        if (payload.ValueKind != JsonValueKind.Object || !payload.TryGetProperty("pix", out var rows)
            || rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() > C6WebhookCandidateLimit) return false;
        var operations = new HashSet<Guid>();
        var receipts = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows.EnumerateArray())
        {
            if (row.ValueKind != JsonValueKind.Object) continue;
            if (row.TryGetProperty("chave", out var key)
                && (key.ValueKind != JsonValueKind.String || !paymentGateways.MatchesC6WebhookKey(key.GetString()!))) continue;
            if (Guid.TryParseExact(HintText(row, "txid"), "N", out var operation)) operations.Add(operation);
            var receipt = HintText(row, "endToEndId");
            if (receipt.Length == 32 && receipt[0] == 'E' && receipt.Skip(1).All(char.IsAsciiLetterOrDigit)) receipts.Add(receipt);
        }
        if (operations.Count == 0 && receipts.Count == 0) return false;
        var candidates = await db.Set<BillingPayment>()
            .Where(p => p.Provider == "C6" && p.Method == "Pix"
                && (operations.Contains(p.OperationId) || (p.PixEndToEndId != null && receipts.Contains(p.PixEndToEndId)))).ToListAsync(ct);
        var observed = false;
        foreach (var payment in candidates.Where(paymentGateways.MatchesC6Scope).Take(C6WebhookCandidateLimit))
        {
            var remote = await PaymentGateway(payment).Get(payment.ProviderId ?? payment.OperationId.ToString("N"), ct);
            await Observe(payment, remote, ct);
            observed = true;
        }
        return observed;
    }

    private static string HintText(JsonElement value, string name) => value.TryGetProperty(name, out var item)
        && item.ValueKind == JsonValueKind.String ? item.GetString()! : "";
}
