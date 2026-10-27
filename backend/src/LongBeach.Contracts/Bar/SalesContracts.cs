namespace LongBeach.Contracts.Bar;
public sealed record SaleItemInput(Guid ProductId, decimal Quantity);
public sealed record SaleInput(Guid SessionId, IReadOnlyList<SaleItemInput> Items);
public sealed record ManualPaymentInput(Guid OperationId, decimal Tendered, string? Authorization);
public sealed record RefundInput(string Reason, bool ReturnStock, IReadOnlyList<ReceiptItemInput>? ReturnedItems = null);

public sealed record DiscountInput(decimal Amount,string Reason);
