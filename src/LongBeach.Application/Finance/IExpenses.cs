using LongBeach.Contracts.Finance;

namespace LongBeach.Application.Finance;

public interface IExpenses
{
    Task<ExpensePage> List(string? filter, string? state, string? search, int page, int pageSize, CancellationToken ct);
    Task<ExpensePaidSummary> PaidSummary(DateOnly from, DateOnly through, CancellationToken ct);
    Task<ExpenseDetail> Detail(Guid id, CancellationToken ct);
    Task<ExpenseDetail> Create(Guid id, ExpenseInput input, CancellationToken ct);
    Task<ExpenseDetail> Pay(Guid id, ExpensePaymentInput input, CancellationToken ct);
    Task<ExpenseDetail> Cancel(Guid id, ExpenseCancelInput input, CancellationToken ct);
    Task<ExpenseOptions> Options(CancellationToken ct);
    Task<ExpensePartner> CreatePartner(ExpensePartnerInput input, CancellationToken ct);
    Task<ExpensePurchaseOption> PurchaseOption(Guid id, CancellationToken ct);
}

public sealed class ExpenseRuleException(string message, bool conflict = false) : Exception(message)
{
    public bool Conflict { get; } = conflict;
}
