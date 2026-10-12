using LongBeach.Contracts.Bar;
using LongBeach.Domain.Purchases;
namespace LongBeach.Application.Bar;
public interface IBarPurchases
{
    Task<IReadOnlyList<Supplier>> Suppliers(CancellationToken ct);
    Task<Supplier> CreateSupplier(string name,CancellationToken ct);
    Task<IReadOnlyList<Purchase>> Purchases(CancellationToken ct);
    Task<Purchase> Create(PurchaseInput input,Guid actor,CancellationToken ct);
    Task<Purchase> CorrectPaymentReference(Guid id,PurchasePaymentReferenceInput input,CancellationToken ct);
    Task<Purchase> Cancel(Guid id,string reason,Guid actor,CancellationToken ct);
    Task<Purchase> Receive(Guid id,ReceiptInput input,Guid actor,CancellationToken ct);
}
