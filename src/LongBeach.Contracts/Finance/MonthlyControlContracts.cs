namespace LongBeach.Contracts.Finance;

public sealed record MonthlyControlLine(string Id, string Label, string Direction, string Category,
    string CostCenter, long AmountCents, string Basis, string Source, string? SourceMonth);
public sealed record MonthlyControlInput(int Version, MonthlyControlLine[] Lines, string Notes);
public sealed record MonthlyControlDocument(string Month, int Version, MonthlyControlLine[] Lines,
    string Notes, DateTimeOffset UpdatedAtUtc);
public sealed record MonthlyControlReport(string Month, string[] Months, MonthlyControlDocument? Control);
public sealed record MonthlyControlTotals(long IncomeCents, long ExpenseCents, long ResultCents,
    long EstimatedIncomeCents, long EstimatedExpenseCents, int EstimatedRecords);
