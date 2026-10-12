namespace LongBeach.Application.Bar;
public sealed record PixCustomer(string Name, string Email, string TaxId);
public sealed record GatewayPayment(string OrderId, string ChargeId, string Reference, string State, long Amount, string Currency, string? PixText, string? QrImageUrl, long Refunded = 0);
public interface IPaymentGateway
{
    bool Enabled { get; }
    bool CardEnabled => false;
    Task<string?> CardPublicKey(CancellationToken ct) => Task.FromResult<string?>(null);
    Task<GatewayPayment> CreateCard(Guid paymentId, Guid operationId, decimal amount, PixCustomer customer, string encryptedCard, CancellationToken ct) => throw new LongBeach.Domain.Bar.BarRuleException("Cartão online indisponível.");
    Task<GatewayPayment> CreatePix(Guid paymentId, Guid operationId, decimal amount, DateTimeOffset expires, PixCustomer customer, CancellationToken ct);
    Task<GatewayPayment> Get(string orderId, CancellationToken ct);
    Task<GatewayPayment> Refund(string orderId,Guid operationId,decimal amount,CancellationToken ct);
    Task<GatewayPayment> RefundPartial(string orderId, Guid operationId, decimal amount, decimal previouslyRefunded, CancellationToken ct) => previouslyRefunded == 0
        ? Refund(orderId, operationId, amount, ct)
        : throw new LongBeach.Domain.Bar.BarRuleException("Provedor não oferece estorno parcial conciliado.");
    bool VerifyWebhook(byte[] body, IEnumerable<string> signatures);
    Task<bool> VerifyWebhookAsync(byte[] body,IEnumerable<string> signatures,CancellationToken ct) => Task.FromResult(VerifyWebhook(body,signatures));
}
