using LongBeach.Contracts.Bar;
namespace LongBeach.Application.Bar;
public interface IBarPayments
{
    bool PixEnabled {get;}
    Task<object> Payments(CancellationToken ct);
    Task<object> Pix(Guid saleId,PixInput input,Guid actor,CancellationToken ct);
    Task<object> OwnPayment(Guid saleId,Guid actor,CancellationToken ct);
    Task<object> OperatorRefresh(Guid saleId,Guid actor,CancellationToken ct);
    Task<object> Refresh(Guid paymentId,CancellationToken ct);
    Task<bool> Webhook(byte[] body,IEnumerable<string> signatures,CancellationToken ct);
    Task<object> Reconcile(Guid paymentId,ReconcileInput input,Guid actor,CancellationToken ct);
    Task<object> Dashboard(DateTimeOffset? fromUtc,DateTimeOffset? toUtc,CancellationToken ct);
}
