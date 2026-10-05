namespace LongBeach.Contracts.Bar;
public sealed record OpenCashInput(Guid RegisterId, Guid LocationId, string Terminal, decimal Opening, Guid? OperationId = null);
public sealed record CashMovementInput(decimal Amount, string Reason, Guid OperationId);
public sealed record CloseCashInput(decimal Counted, string? Reason, Guid? OperationId = null);
