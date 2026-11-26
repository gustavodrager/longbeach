namespace LongBeach.Application.Bar;

/// <summary>
/// A direct sale could not be confirmed. Retaining its operation ID is mandatory:
/// a failed attempt does not prove that an earlier request was never committed.
/// </summary>
public sealed class DirectSaleWriteException(
    Guid tabId,
    Guid operationId,
    bool retryable,
    int attempts,
    Exception innerException) : Exception(
        retryable
            ? "O registro encontrou uma alteração simultânea. Retome a confirmação deste item."
            : "Não foi possível confirmar este item. Mantenha o registro para conferência e continue o atendimento.",
        innerException)
{
    public Guid TabId { get; } = tabId;
    public Guid OperationId { get; } = operationId;
    public bool Retryable { get; } = retryable;
    public int Attempts { get; } = attempts;
    public string Code => Retryable ? "direct_sale_retryable_conflict" : "direct_sale_write_failed";
    public string Outcome => "unconfirmed";
}
