namespace LongBeach.Contracts.Billing;
public sealed record AssignAccountInput(string Kind, Guid SourceId, Guid UserId, Guid? StudentId = null);
public sealed record PayAccountInput(Guid OperationId, string Method, string Name, string Email, string TaxId, string? EncryptedCard = null, decimal? Amount = null);
public sealed record SubscribeInput(Guid OperationId, string Name, string Email, string TaxId, string Phone, string EncryptedCard, bool Consent, decimal ExpectedAmount, DateOnly ExpectedFirstDue, string SecurityCode);
public sealed record CancelSubscriptionInput(Guid OperationId);
public sealed record RefundInput(Guid OperationId, decimal Amount, string Reason);
public sealed record AccountPaymentDto(Guid Id, Guid OperationId, string Method, decimal Amount, string State, decimal Refunded, string? PixText, string? QrImageUrl, DateTimeOffset? ExpiresAtUtc, DateTimeOffset? PaidAtUtc, bool CanResume, decimal RefundPending = 0);
public sealed record AccountDto(Guid Id, string Kind, Guid SourceId, string Title, DateOnly? DueDate, decimal Total, decimal Paid, decimal Pending, decimal Payable, string State, IReadOnlyList<AccountPaymentDto> Payments, bool RecurringEligible, Guid UserId, string? Competence, Guid? SubscriptionId, IReadOnlyList<AccountItemDto>? Items = null, decimal Discount = 0);
public sealed record SubscriptionDto(Guid Id, Guid OperationId, Guid AccountId, decimal Amount, DateOnly FirstDue, string State, bool CanResume);
public sealed record BillingConfig(bool PixEnabled, bool CardEnabled, bool SubscriptionsEnabled, string? CardPublicKey, string? SubscriptionPublicKey);
public sealed record AccountCandidate(string Kind, Guid Id, string Name);
public sealed record BillingPerson(Guid Id, string Name);
public sealed record BillingCandidates(IReadOnlyList<AccountCandidate> Accounts, IReadOnlyList<BillingPerson> Users, IReadOnlyList<BillingPerson> Students);
public sealed record SettlementInput(Guid PaymentId, Guid DocumentId, string ExternalId, string Reason);

public sealed record AccountItemDto(Guid Id, string Name, decimal Quantity, decimal UnitPrice, decimal Total, string State);
