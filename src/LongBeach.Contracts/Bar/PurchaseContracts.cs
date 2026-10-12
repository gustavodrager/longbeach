namespace LongBeach.Contracts.Bar;
public sealed record PurchaseItemInput(Guid ProductId, decimal Quantity, decimal PurchaseCost, decimal? Total=null);
public sealed record PurchasePaymentReferenceInput(string PaymentMethod, string? AccountReference, int Version);
public sealed record PurchaseInput(Guid SupplierId, string Document, IReadOnlyList<PurchaseItemInput> Items,decimal Freight=0,decimal Discount=0,string PaymentMethod="Pending",string? AccountReference=null,DateTimeOffset? PurchasedAtUtc=null);
public sealed record ReceiptItemInput(Guid ProductId, decimal Quantity);
public sealed record ReceiptInput(Guid LocationId, Guid OperationId, IReadOnlyList<ReceiptItemInput> Items);
