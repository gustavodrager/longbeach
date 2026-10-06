using System.Text.Json;

namespace LongBeach.Contracts.Operations;

public sealed record GradeImportItem(string Kind, Guid Id, string Name, string SourceSheet, int SourceRow, JsonElement Body, string? Conflict);
public sealed record GradeImportPreview(Guid BatchId, string SourceName, bool Applied, string ConfirmationToken, GradeImportItem[] Items)
{
    public bool CanApply => !Applied && Items.Length > 0 && Items.All(item => item.Conflict is null);
}
public sealed record ApplyGradeImportInput(string ConfirmationToken);
