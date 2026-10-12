using LongBeach.Contracts.Billing;
namespace LongBeach.Application.Billing;
public sealed record RecurringState(string Id,string Reference,string State,long Amount,string Currency);
public sealed record RecurringInvoice(string Id,int Occurrence,string State,long Amount,string Currency,string? PaymentId,string? PaymentState, bool SafeToRelease = false);
public interface IRecurringGateway
{
    bool Enabled { get; }
    Task<string?> PublicKey(CancellationToken ct);
    Task<string> CreatePlan(Guid reference,decimal amount,int trialDays,CancellationToken ct);
    Task<RecurringState> Create(Guid reference,Guid operation,string plan,SubscribeInput input,CancellationToken ct);
    Task<RecurringState> Get(string id,CancellationToken ct);
    Task<RecurringState> Cancel(string id,Guid operation,CancellationToken ct);
    Task<IReadOnlyList<RecurringInvoice>> Invoices(string id,CancellationToken ct);
    Task Refund(string paymentId,Guid operation,decimal amount,decimal previous,CancellationToken ct);
}
