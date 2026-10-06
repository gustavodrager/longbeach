using LongBeach.Contracts.Operations;

namespace LongBeach.Application.Operations;

public interface IGradeImport
{
    Task<GradeImportPreview> Preview(Guid batchId, CancellationToken ct);
    Task<GradeImportPreview> Apply(Guid batchId, string confirmationToken, CancellationToken ct);
}
