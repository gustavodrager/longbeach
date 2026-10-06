namespace LongBeach.Contracts.Finance;

public sealed record BankBalanceSnapshot(long? AmountCents, DateOnly? Date, string? SourceName, string? SourceCell, string? Metric, string? Issue);
public sealed record MonthlyControlBalance(string? Month, long? AmountCents, long? IncomeCents, long? ExpenseCents, int Records, string[] Sources, string? Issue,
    string Basis = "historico", bool Estimated = false, long EstimatedExpenseCents = 0);
public sealed record DashboardBalances(BankBalanceSnapshot PagBank, MonthlyControlBalance General);
