namespace LongBeach.Contracts.Fiscal;

public sealed record InvoiceUpload(string FileName, string ContentBase64);
public sealed record InvoiceLine(int Number, string Code, string Description, string Unit, decimal Quantity,
    decimal UnitPrice, decimal Total, decimal Discount, decimal Freight, string? Barcode);
public sealed record InvoiceData(string AccessKey, string Number, string Series, string SupplierTaxId,
    string SupplierName, string RecipientTaxId, DateTimeOffset IssuedAt, int Environment,
    decimal ProductsTotal, decimal Freight, decimal Discount, decimal Total,
    IReadOnlyList<InvoiceLine> Items, IReadOnlyList<string> Warnings, bool CanCreatePurchase);
public sealed record InvoiceRow(Guid Id, string AccessKey, string Number, string SupplierName,
    DateTimeOffset IssuedAt, decimal Total, Guid? PurchaseId, DateTimeOffset ImportedAt, string Purpose);
public sealed record InvoicePage(IReadOnlyList<InvoiceRow> Items, int Page, int Total);
public sealed record InvoiceDetail(Guid Id, string FileName, InvoiceData Data, Guid? PurchaseId, string Purpose, int ReviewVersion);
public sealed record InvoiceClassificationInput(string Purpose, int ReviewVersion);
public sealed record InvoiceImportResult(InvoiceDetail Invoice, bool AlreadyImported);
public sealed record InvoiceProductMapping(int LineNumber, Guid ProductId, int ProductVersion, decimal PurchaseQuantity);
public sealed record InvoicePurchaseInput(Guid SupplierId, IReadOnlyList<InvoiceProductMapping> Items, bool Confirmed, int ReviewVersion = 0);

public sealed record InvoiceSupplierOption(Guid Id, string Name, string? TaxId);
public sealed record InvoiceProductOption(Guid Id, string Name, string PurchaseUnit, string StockUnit, decimal ConversionFactor, int Version);
public sealed record InvoiceChoices(IReadOnlyList<InvoiceSupplierOption> Suppliers, IReadOnlyList<InvoiceProductOption> Products);
