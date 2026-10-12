using LongBeach.Contracts.Billing;
namespace LongBeach.Application.Billing;
public interface IBilling
{
    Task<BillingConfig> Config(CancellationToken ct);
    Task<BillingCandidates> Candidates(CancellationToken ct);
    Task<AccountDto> Assign(AssignAccountInput input, Guid actor, CancellationToken ct);
    Task<IReadOnlyList<AccountDto>> Accounts(Guid? userId, CancellationToken ct);
    Task<AccountDto> Account(Guid id, Guid? userId, CancellationToken ct);
    Task<AccountDto> Pay(Guid id, PayAccountInput input, Guid actor, bool own, CancellationToken ct);
    Task<AccountDto> Refresh(Guid id, Guid paymentId, Guid actor, bool own, CancellationToken ct);
    Task<AccountDto> Refund(Guid id, Guid paymentId, RefundInput input, Guid actor, CancellationToken ct);
    Task<bool> Webhook(byte[] body, IEnumerable<string> signatures, CancellationToken ct);
    Task Recover(CancellationToken ct);
    Task<IReadOnlyList<SubscriptionDto>> Subscriptions(Guid userId, CancellationToken ct);
    Task<SubscriptionDto> Subscribe(Guid accountId, SubscribeInput input, Guid userId, CancellationToken ct);
    Task<SubscriptionDto> Cancel(Guid subscriptionId, CancelSubscriptionInput input, Guid userId, CancellationToken ct);
    Task<bool> SubscriptionWebhook(byte[] body, CancellationToken ct);
    Task<object> SettlementCandidates(CancellationToken ct);
    Task<object> Settle(Guid accountId, SettlementInput input, Guid actor, CancellationToken ct);
}
