namespace LongBeach.Contracts.Finance;

public sealed record BankBalanceSnapshot(long? AmountCents, DateOnly? Date, string? SourceName, string? SourceCell, string? Metric, string? Issue);
public sealed record MonthlyControlBalance(string? Month, long? AmountCents, long? IncomeCents, long? ExpenseCents, int Records, string[] Sources, string? Issue,
    string Basis = "historico", bool Estimated = false, long EstimatedExpenseCents = 0, MonthlyExpenseBreakdown? ExpensesByType = null);
public sealed record MonthlyExpenseBreakdown(long FixedCents, long VariableCents, long InstallmentCents, long AdjustmentCents, long OtherCents);
public sealed record DashboardBalances(BankBalanceSnapshot PagBank, MonthlyControlBalance General);
