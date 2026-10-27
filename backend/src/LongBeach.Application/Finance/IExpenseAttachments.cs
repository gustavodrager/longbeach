using LongBeach.Contracts.Finance;

namespace LongBeach.Application.Finance;

public interface IExpenseAttachments
{
    Task<IReadOnlyList<ExpenseAttachmentRow>> List(Guid expenseId, CancellationToken ct);
    Task<ExpenseAttachmentRow> Add(Guid expenseId, ExpenseAttachmentInput input, Guid actor, CancellationToken ct);
    Task<ExpenseAttachmentDownload> Download(Guid expenseId, Guid attachmentId, CancellationToken ct);
}
