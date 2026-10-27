using LongBeach.Contracts.Bar;
namespace LongBeach.Application.Bar;
public interface IBarSales
{
    Task<object> Create(SaleInput input, Guid actor, CancellationToken ct);
    Task<object> List(Guid actor, bool all, bool costs, CancellationToken ct);
    Task<object> Pay(Guid saleId, ManualPaymentInput input, string method, Guid actor, CancellationToken ct);
    Task<object> Discount(Guid saleId,DiscountInput input,Guid actor,CancellationToken ct);
    Task<object> Courtesy(Guid saleId, string reason, Guid actor, CancellationToken ct);
    Task Cancel(Guid saleId, string reason, Guid actor, CancellationToken ct);
    Task Refund(Guid saleId, RefundInput input, Guid actor, CancellationToken ct);
}
