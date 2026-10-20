namespace LongBeach.Contracts.Finance;

public sealed record C6StatementItem(Guid Id, string EntryId, DateOnly BookedDate, long AmountCents,
    string Title, string Description, string OperationType, string TransactionType, string? EndToEndId, string SourceSha256, Guid? LinkedPaymentId = null);
public sealed record C6StatementReport(string Environment, string Account, DateOnly From, DateOnly Through,
    IReadOnlyList<C6StatementItem> Items, int Total, int Page);

