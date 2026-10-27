using LongBeach.Contracts.Bar;

namespace LongBeach.Application.Bar;

public interface ICatalogImport
{
    Task<CatalogImportPreview> Preview(Guid batchId, CancellationToken ct);
    Task<CatalogImportPreview> Apply(Guid batchId, string confirmationToken, CancellationToken ct);
}
