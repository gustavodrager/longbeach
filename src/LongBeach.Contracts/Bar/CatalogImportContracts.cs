namespace LongBeach.Contracts.Bar;

public sealed record CatalogImportItem(int SourceRow, string ExternalId, string Code, string Name,
    string Category, decimal SalePrice, decimal SourceCost, string? Barcode, string Action,
    Guid? ProductId, int? Version, string? Conflict);
public sealed record CatalogImportPreview(Guid BatchId, string SourceName, string SourceSha256,
    bool Applied, string ConfirmationToken, IReadOnlyList<CatalogImportItem> Items)
{
    public bool CanApply => !Applied && Items.All(x => x.Action != "Conflict");
    public int Creates => Items.Count(x => x.Action == "Create");
    public int Matches => Items.Count(x => x.Action == "Matched");
}
public sealed record ApplyCatalogImportInput(string ConfirmationToken);
