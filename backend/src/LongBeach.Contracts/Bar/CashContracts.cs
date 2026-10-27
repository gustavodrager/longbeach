namespace LongBeach.Contracts.Bar;
public sealed record OpenCashInput(Guid RegisterId, Guid LocationId, string Terminal, decimal Opening, Guid? OperationId = null);
public sealed record CashMovementInput(decimal Amount, string Reason, Guid OperationId);
public sealed record CloseCashInput(decimal Counted, string? Reason, Guid? OperationId = null, decimal? Expected = null);

public sealed record CashHistoryRow(Guid Id, Guid OpenedBy, string Responsible, string Register, string Terminal, string State, decimal Opening, decimal Expected, DateTimeOffset CreatedAtUtc);
public sealed record CashHistoryPage(IReadOnlyList<CashHistoryRow> Items, int Total);
public sealed record CashLedgerRow(Guid Id, string Kind, decimal Amount, string Reason, DateTimeOffset CreatedAtUtc);
public sealed record CashClosingRow(Guid Id, decimal Expected, decimal Counted, decimal Difference, string? Reason, DateTimeOffset CreatedAtUtc);
public sealed record CashDetails(IReadOnlyList<CashLedgerRow> Movements, IReadOnlyList<CashClosingRow> Closings, bool PendingPayment, decimal Expected, IReadOnlyList<TerminalReceiptTotal>? TerminalReceipts = null);
public sealed record TerminalReceiptTotal(string TerminalType, decimal Amount, decimal Refunded);
