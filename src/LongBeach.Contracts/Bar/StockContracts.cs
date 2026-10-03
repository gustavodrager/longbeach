namespace LongBeach.Contracts.Bar;
public sealed record LocationInput(string Name);
public sealed record TransferInput(Guid ProductId, Guid FromLocationId, Guid ToLocationId, decimal Quantity, string Reason, Guid OperationId);
public sealed record StockOutputInput(Guid ProductId, Guid LocationId, decimal Quantity, string Reason, Guid OperationId);
public sealed record CountInput(Guid LocationId, bool Initial);
public sealed record CountItemInput(Guid ProductId, decimal Quantity);
public sealed record ApprovalInput(string Reason);
