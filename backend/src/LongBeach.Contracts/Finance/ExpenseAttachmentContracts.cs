namespace LongBeach.Contracts.Finance;

public sealed record ExpenseAttachmentInput(Guid OperationId, string FileName, string ContentBase64);
public sealed record ExpenseAttachmentRow(Guid Id, Guid ExpenseId, string FileName, string ContentType, int Size, DateTimeOffset CreatedAtUtc);
public sealed record ExpenseAttachmentDownload(string FileName, string ContentType, string ContentBase64);
