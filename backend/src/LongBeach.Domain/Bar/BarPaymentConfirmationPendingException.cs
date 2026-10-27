namespace LongBeach.Domain.Bar;

public sealed class BarPaymentConfirmationPendingException(Guid paymentId, Guid operationId, string message, Exception? inner = null) : Exception(message, inner)
{
    public Guid PaymentId { get; } = paymentId;
    public Guid OperationId { get; } = operationId;
}
