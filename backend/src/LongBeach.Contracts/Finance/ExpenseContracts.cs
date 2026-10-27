namespace LongBeach.Contracts.Finance;

public sealed record ExpenseInput(string Description, decimal Amount, DateOnly ExpenseDate,
    string Kind = "Expense", string Category = "General", string Beneficiary = "", DateOnly? DueDate = null,
    string PaidBy = "Pending", Guid? PartnerId = null, Guid? TeamMemberId = null,
    string? TeamBasis = null, string? ReferenceMonth = null, DateOnly? WorkDate = null, string? Shift = null,
    string? Reference = null, DateOnly? PaidDate = null, string PaymentMethod = "Manual", string? AccountReference = null,
    string Origin = "Arena", string? Notes = null, string? DocumentReference = null, Guid? PurchaseId = null,
    string? AllocationScope = null, string? BusinessUnitId = null);
public sealed record ExpensePaymentInput(Guid OperationId, decimal Amount, DateOnly PaidDate, int Version,
    string PaymentMethod = "Manual", string? AccountReference = null);
public sealed record ExpenseCancelInput(Guid OperationId, int Version, string Reason);
public sealed record ExpensePartnerInput(Guid Id, string Name);
public sealed record ExpensePartner(Guid Id, string Name);
public sealed record ExpenseTeamOption(Guid Id, string Name, decimal? PayAmount, string PayBasis, string PaymentFrequency, string PaymentDay);
public sealed record ExpenseOptions(ExpensePartner[] Partners, ExpenseTeamOption[] Team, bool AttachmentSupport);
public sealed record ExpensePurchaseOption(Guid Id, string Description, decimal Amount, DateOnly ExpenseDate, Guid? ExpenseId);
public sealed record ExpenseRow(Guid Id, string Description, string Kind, string Category, string Beneficiary,
    DateOnly? DueDate, DateOnly ExpenseDate, decimal Amount, decimal PaidAmount, decimal RemainingAmount,
    string Status, string PaidBy, Guid? PartnerId, string? PartnerName, Guid? TeamMemberId, string? Reference,
    string Origin, bool Managed, Guid? PurchaseId, int Version, string? TeamBasis = null, string? ReferenceMonth = null,
    DateOnly? WorkDate = null, string? Shift = null, string? AllocationScope = null, string? BusinessUnitId = null);
public sealed record ExpensePayment(Guid OperationId, decimal Amount, DateOnly PaidDate, string PaymentMethod,
    string? AccountReference, DateTimeOffset CreatedAtUtc);
public sealed record ExpenseDetail(ExpenseRow Expense, ExpensePayment[] Payments, string? Notes, string? DocumentReference, string? CancellationReason = null);
public sealed record ExpenseSummary(decimal OutstandingAmount, decimal OverdueAmount, decimal PartnerAmount, int OutstandingCount);
public sealed record ExpensePaidSummary(decimal Amount, int Records);
public sealed record ExpensePage(ExpenseRow[] Items, ExpenseSummary Summary, int Page, int PageSize, int Total, DateOnly Today);
