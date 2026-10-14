using LongBeach.Contracts.Fiscal;
namespace LongBeach.Application.Fiscal;

public sealed class InvoiceRuleException(string message) : Exception(message);
public interface IReceivedInvoices
{
    Task<InvoiceChoices> Choices(CancellationToken ct);
    InvoiceData Preview(InvoiceUpload input);
    Task<InvoiceImportResult> Import(InvoiceUpload input, Guid actor, CancellationToken ct);
    Task<InvoicePage> List(int page, CancellationToken ct, string? purpose = null);
    Task<InvoiceDetail> Classify(Guid id, InvoiceClassificationInput input, CancellationToken ct);
    Task<InvoiceDetail> Detail(Guid id, CancellationToken ct);
    Task<Guid> CreatePurchase(Guid id, InvoicePurchaseInput input, Guid actor, CancellationToken ct);
    Task<(string FileName, byte[] Content)> Original(Guid id, CancellationToken ct);
}
