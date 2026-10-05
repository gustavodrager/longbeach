namespace LongBeach.Contracts.Bar;

public sealed record CategoryInput(string Name);
public sealed record ProductInput(string Code, string Name, string ShortName, Guid CategoryId,
    string SaleUnit, string PurchaseUnit, decimal ConversionFactor, decimal SalePrice, decimal AverageCost,
    decimal MinimumStock, bool ControlsStock, bool Favorite, int DisplayOrder, bool Active = true, int? Version = null, string? Barcode = null, string? ImageUrl = null, Guid? MainSupplierId = null, bool Prepared = false);
public sealed record CatalogProduct(Guid Id, string Code, string Name, string ShortName, Guid CategoryId,
    string SaleUnit, decimal SalePrice, bool ControlsStock, decimal MinimumStock, bool Favorite, int DisplayOrder,
    bool Active, int Version, string? Barcode = null, string? ImageUrl = null, bool Prepared = false);
public sealed record ManagedProduct(CatalogProduct Product, string PurchaseUnit, decimal ConversionFactor,
    decimal AverageCost, decimal LastCost, Guid? MainSupplierId = null);
