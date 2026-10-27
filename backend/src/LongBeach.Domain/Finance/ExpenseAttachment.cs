using LongBeach.Domain.Common;

namespace LongBeach.Domain.Finance;

public sealed class ExpenseAttachment : Entity
{
    private ExpenseAttachment() { }

    public ExpenseAttachment(Guid expenseId, Guid operationId, string fileName, string contentType, byte[] content, string contentHash, Guid actor)
        : base(Guid.NewGuid())
    {
        ExpenseId = expenseId;
        OperationId = operationId;
        FileName = fileName;
        ContentType = contentType;
        Content = content;
        ContentHash = contentHash;
        UploadedBy = actor;
    }

    public Guid ExpenseId { get; private set; }
    public Guid OperationId { get; private set; }
    public string FileName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public byte[] Content { get; private set; } = [];
    public string ContentHash { get; private set; } = "";
    public Guid UploadedBy { get; private set; }
}

public sealed class ExpenseAttachmentRuleException(string message) : Exception(message);
