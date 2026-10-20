using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using LongBeach.Application.Bar;
using LongBeach.Domain.Bar;
using Microsoft.Extensions.Options;

namespace LongBeach.Infrastructure.C6;

/// <summary>C6 immediate Pix collections. Bank responses, never webhook bodies, establish payment.</summary>
public sealed partial class C6PaymentGateway(C6ApiClient client, IOptions<C6Options> options, TimeProvider? clock = null) : IPaymentGateway
{
    private readonly TimeProvider time = clock ?? TimeProvider.System;
    private const string PaymentReference = "longbeach-payment-id";
    private const string AccountReference = "longbeach-account-id";
    public bool Enabled => options.Value.Enabled && options.Value.PixEnabled;
    public static string TransactionId(Guid operationId) => operationId.ToString("N");

    public async Task<GatewayPayment> CreatePix(Guid paymentId, Guid operationId, decimal amount, DateTimeOffset expires, PixCustomer customer, CancellationToken ct)
    {
        Require(paymentId != Guid.Empty && operationId != Guid.Empty && amount > 0 && BarRules.Money(amount) == amount,
            "Dados da cobrança Pix C6 inválidos.");
        Require(TaxIdPattern().IsMatch(customer.TaxId), "Documento do pagador deve conter 11 ou 14 dígitos.");
        Require(!string.IsNullOrWhiteSpace(options.Value.PixKey), "Configure a chave Pix da conta C6 no servidor.");
        var txid = TransactionId(operationId);
        try { return ValidateCreation(await Get(txid, ct), paymentId, amount); }
        catch (C6ApiException e) when (e.StatusCode == HttpStatusCode.NotFound) { /* Only confirmed absence permits creation. */ }
        if (!Enabled) throw new BarRuleException("Novas cobranças Pix C6 estão desabilitadas.");
        var seconds = (long)Math.Ceiling((expires - time.GetUtcNow()).TotalSeconds);
        Require(seconds is > 0 and <= 86400, "A validade da cobrança Pix C6 deve ser de até 24 horas.");
        var payer = new Dictionary<string, string>
        {
            [customer.TaxId.Length == 11 ? "cpf" : "cnpj"] = customer.TaxId,
            ["nome"] = BarRules.Text(customer.Name, 200, "Nome do pagador")
        };
        var payload = new
        {
            calendario = new { expiracao = seconds }, devedor = payer,
            valor = new { original = amount.ToString("0.00", CultureInfo.InvariantCulture), modalidadeAlteracao = 0 },
            chave = options.Value.PixKey,
            solicitacaoPagador = "Pagamento Long Beach",
            infoAdicionais = new[]
            {
                new { nome = PaymentReference, valor = paymentId.ToString() },
                new { nome = AccountReference, valor = options.Value.AccountId }
            }
        };
        try
        {
            using var json = await client.Send(HttpMethod.Put, ChargePath(txid), payload, ct);
            // The creation schema may omit payment status/BR Code; fetch the complete persisted charge.
            return ValidateCreation(await Get(txid, ct), paymentId, amount);
        }
        catch (C6ApiException) when (!ct.IsCancellationRequested)
        {
            // A lost response never authorizes another charge; read the same immutable txid.
            return ValidateCreation(await Get(txid, ct), paymentId, amount);
        }
    }

    public async Task<GatewayPayment> Get(string orderId, CancellationToken ct)
    {
        Require(TxIdPattern().IsMatch(orderId), "Identificador Pix C6 inválido.");
        Require(!string.IsNullOrWhiteSpace(options.Value.PixKey), "Configure a chave Pix da conta C6 no servidor.");
        using var json = await client.Send(HttpMethod.Get, ChargePath(orderId), null, ct);
        return Read(json.RootElement, orderId);
    }

    public Task<GatewayPayment> Refund(string orderId, Guid operationId, decimal amount, CancellationToken ct)
        => RefundPartial(orderId, operationId, amount, 0, ct);

    public async Task<GatewayPayment> RefundPartial(string orderId, Guid operationId, decimal amount, decimal previouslyRefunded, CancellationToken ct)
    {
        Require(operationId != Guid.Empty && amount > 0 && previouslyRefunded >= 0
            && BarRules.Money(amount) == amount && BarRules.Money(previouslyRefunded) == previouslyRefunded, "Valor de devolução Pix inválido.");
        var expected = Cents(amount + previouslyRefunded);
        var current = await Get(orderId, ct);
        Require(current.State == "PAID" && current.PixEndToEndId is not null && expected <= current.Amount, "Pix C6 sem recebimento confirmado para devolução.");
        var refundId = operationId.ToString("N");
        var path = $"/v2/pix/pix/{current.PixEndToEndId}/devolucao/{refundId}";
        try
        {
            using var known = await client.Send(HttpMethod.Get, path, null, ct);
            ValidateRefund(known.RootElement, refundId, amount);
            return await ConfirmRefund(orderId, expected, ct);
        }
        catch (C6ApiException e) when (e.StatusCode == HttpStatusCode.NotFound) { }
        Require(current.Refunded == Cents(previouslyRefunded), "Devolução externa diverge do histórico. Concilie antes de continuar.");
        using (var snapshot = await client.Send(HttpMethod.Get, ChargePath(orderId), null, ct))
        {
            var reviewed = Read(snapshot.RootElement, orderId);
            Require(reviewed.State == "PAID" && reviewed.PixEndToEndId == current.PixEndToEndId
                && reviewed.Refunded == Cents(previouslyRefunded), "Recebimento C6 mudou durante a devolução. Concilie antes de continuar.");
            var receipt = snapshot.RootElement.GetProperty("pix")[0];
            Require(!receipt.TryGetProperty("devolucoes", out var existingRefunds)
                || !existingRefunds.EnumerateArray().Any(x => Text(x, "status") == "EM_PROCESSAMENTO"),
                "Já existe uma devolução Pix C6 em processamento. Aguarde a confirmação antes de solicitar outra.");
        }
        try
        {
            using var result = await client.Send(HttpMethod.Put, path, new { valor = amount.ToString("0.00", CultureInfo.InvariantCulture) }, ct);
            ValidateRefund(result.RootElement, refundId, amount);
        }
        catch (C6ApiException) when (!ct.IsCancellationRequested)
        {
            using var recovered = await client.Send(HttpMethod.Get, path, null, ct);
            ValidateRefund(recovered.RootElement, refundId, amount);
        }
        return await ConfirmRefund(orderId, expected, ct);
    }

    private async Task<GatewayPayment> ConfirmRefund(string orderId, long expected, CancellationToken ct)
    {
        var confirmed = await Get(orderId, ct);
        Require(confirmed.Refunded == expected, "Devolução Pix C6 ainda não conciliada. Consulte antes de repetir.");
        return confirmed;
    }

    private static void ValidateRefund(JsonElement refund, string id, decimal amount)
    {
        Require(Text(refund, "id") == id && Money(refund, "valor") == amount, "Devolução Pix C6 divergente.");
        Require(Text(refund, "status") == "DEVOLVIDO", "Devolução Pix C6 ainda não confirmada. Consulte antes de repetir.");
    }

    // Callbacks are untrusted lookup hints. Only an authenticated bank read can confirm a payment.
    public bool VerifyWebhook(byte[] body, IEnumerable<string> signatures) => false;

    private GatewayPayment Read(JsonElement charge, string expectedTxid)
    {
        try
        {
            Require(Text(charge, "txid") == expectedTxid && Text(charge, "chave") == options.Value.PixKey, "Conta ou identificador Pix C6 divergente.");
            var metadata = charge.GetProperty("infoAdicionais").EnumerateArray().ToArray();
            var references = metadata.Where(x => Text(x, "nome") == PaymentReference).ToArray();
            var accounts = metadata.Where(x => Text(x, "nome") == AccountReference).ToArray();
            Require(references.Length == 1 && Guid.TryParse(Text(references[0], "valor"), out _)
                && accounts.Length == 1 && Text(accounts[0], "valor") == options.Value.AccountId, "Referência ou conta Pix C6 divergente.");
            var amount = Money(charge.GetProperty("valor"), "original");
            Require(amount > 0, "Valor Pix C6 inválido.");
            var state = Text(charge, "status") switch
            {
                "ATIVA" => "WAITING", "CONCLUIDA" => "PAID",
                "REMOVIDA_PELO_USUARIO_RECEBEDOR" or "REMOVIDA_PELO_PSP" => "CANCELED",
                _ => throw new BarRuleException("Situação Pix C6 desconhecida; concilie a cobrança.")
            };
            string? endToEndId = null;
            long refunded = 0;
            if (state == "PAID")
            {
                Require(charge.TryGetProperty("pix", out var receipts) && receipts.ValueKind == JsonValueKind.Array
                    && receipts.GetArrayLength() == 1, "Recebimento Pix C6 exige conferência.");
                var receipt = receipts[0];
                endToEndId = Text(receipt, "endToEndId");
                // The receipt's txid is optional in C6's contract. Its parent charge was already
                // verified against the requested txid; reject a supplied receipt id that disagrees.
                Require(EndToEndPattern().IsMatch(endToEndId)
                    && (!receipt.TryGetProperty("txid", out _) || Text(receipt, "txid") == expectedTxid)
                    && (!receipt.TryGetProperty("chave", out _) || Text(receipt, "chave") == options.Value.PixKey)
                    && Money(receipt, "valor") == amount, "Identificador ou valor recebido no C6 divergente.");
                if (receipt.TryGetProperty("devolucoes", out var refunds))
                {
                    var ids = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var refund in refunds.EnumerateArray())
                    {
                        Require(ids.Add(Text(refund, "id")), "Devoluções Pix C6 duplicadas na resposta.");
                        var refundState = Text(refund, "status");
                        Require(refundState is "DEVOLVIDO" or "EM_PROCESSAMENTO" or "NAO_REALIZADO", "Situação de devolução Pix C6 desconhecida.");
                        var refundAmount = Money(refund, "valor");
                        Require(refundAmount > 0, "Valor de devolução Pix C6 inválido.");
                        if (refundState == "DEVOLVIDO") refunded = checked(refunded + Cents(refundAmount));
                    }
                }
                Require(refunded <= Cents(amount), "Valor devolvido no C6 excede o recebimento.");
            }
            else if (charge.TryGetProperty("pix", out var unexpected) && unexpected.ValueKind == JsonValueKind.Array && unexpected.GetArrayLength() > 0)
                throw new BarRuleException("Recebimento Pix C6 com situação divergente; concilie a cobrança.");
            // ATIVA describes bank state, independently of expiration. Keep monitoring until C6
            // confirms payment or removal; local clock expiry must not suppress a delayed receipt.
            return new GatewayPayment(expectedTxid, expectedTxid, Text(references[0], "valor"), state, Cents(amount), "BRL",
                charge.TryGetProperty("pixCopiaECola", out var pixText) && pixText.ValueKind == JsonValueKind.String ? pixText.GetString() : null,
                null, refunded, options.Value.AccountId, options.Value.Environment, endToEndId);
        }
        catch (Exception e) when (e is InvalidOperationException or KeyNotFoundException or FormatException or OverflowException)
        {
            throw new BarRuleException("Resposta Pix C6 incompleta ou inválida. Concilie antes de confirmar o pagamento.");
        }
    }

    private static GatewayPayment ValidateCreation(GatewayPayment value, Guid paymentId, decimal amount)
    {
        Require(value.Reference == paymentId.ToString() && value.Amount == Cents(amount), "Cobrança Pix C6 pertence a outra operação ou valor.");
        Require(value.State != "WAITING" || !string.IsNullOrWhiteSpace(value.PixText), "O C6 ainda não disponibilizou o código Pix. Consulte a mesma cobrança antes de tentar novamente.");
        return value;
    }

    private static string ChargePath(string txid) => "/v2/pix/cob/" + txid;
    private static string Text(JsonElement value, string key) => value.TryGetProperty(key, out var item) && item.ValueKind == JsonValueKind.String ? item.GetString()! : "";
    private static decimal Money(JsonElement value, string key)
    {
        var text = Text(value, key);
        Require(AmountPattern().IsMatch(text) && decimal.TryParse(text, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out _), "Valor Pix C6 inválido.");
        return decimal.Parse(text, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture);
    }
    private static long Cents(decimal value) => checked((long)(value * 100));
    private static void Require(bool condition, string message) { if (!condition) throw new BarRuleException(message); }
    [GeneratedRegex("^[A-Za-z0-9]{26,35}$")] private static partial Regex TxIdPattern();
    [GeneratedRegex("^[A-Za-z0-9]{32}$")] private static partial Regex EndToEndPattern();
    [GeneratedRegex("^(?:[0-9]{11}|[0-9]{14})$")] private static partial Regex TaxIdPattern();
    [GeneratedRegex("^[0-9]{1,10}\\.[0-9]{2}$")] private static partial Regex AmountPattern();
}
