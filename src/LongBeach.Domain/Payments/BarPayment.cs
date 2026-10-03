using LongBeach.Domain.Common;
using LongBeach.Domain.Bar;
namespace LongBeach.Domain.Payments;
public sealed class BarPayment : Entity
{
    private BarPayment() { }
    public BarPayment(Guid saleId, decimal amount, string method, Guid operationId, Guid actor, string? authorization = null, decimal? tendered = null) : base(Guid.NewGuid())
    { SaleId = saleId; Amount = BarRules.Money(amount); Tendered = BarRules.Money(tendered ?? amount); Method = method; OperationId = operationId; ActorId = actor; Authorization = authorization is null ? null : BarRules.Text(authorization, 100, "NSU/autorização"); }
    public Guid SaleId { get; private set; }
    public decimal Tendered { get; private set; }
    public decimal Amount { get; private set; }
    public string Method { get; private set; } = "";
    public Guid OperationId { get; private set; }
    public Guid ActorId { get; private set; }
    public string? Authorization { get; private set; }
    public string State { get; private set; } = "Approved";
    public string? ProviderId { get; private set; }
    public string? PixText { get; private set; }
    public string? QrImageUrl { get; private set; }
    public DateTimeOffset? ExpiresAt { get; private set; }
    public int Version { get; private set; }
    public void Pending(DateTimeOffset expires) { State = "Pending"; ExpiresAt = expires; Version++; }
    public void Provider(string id, string? text, string? image) { ProviderId = id; PixText = text; QrImageUrl = image; Version++; }
    public void Approve() { if (State != "Pending") throw new BarRuleException("Pagamento não está pendente."); State = "Approved"; Version++; }
    public void Reject() { if(State!="Pending")throw new BarRuleException("Pagamento não pendente.");State="Canceled";Version++; }
    public void Refund() { if (State != "Approved") throw new BarRuleException("Pagamento não está aprovado."); State = "Refunded"; Version++; }
}
public sealed class BarEvent : Entity
{
    private BarEvent() { }
    public BarEvent(string name, Guid originId, decimal amount) : base(Guid.NewGuid()) { Name = name; OriginId = originId; Amount = amount; }
    public string Name { get; private set; } = "";
    public Guid OriginId { get; private set; }
    public decimal Tendered { get; private set; }
    public decimal Amount { get; private set; }
}
