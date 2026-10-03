using LongBeach.Domain.Common;
using LongBeach.Domain.Bar;
namespace LongBeach.Domain.Purchases;
public sealed class Supplier : Entity
{
    private Supplier() { }
    public Supplier(string name) : base(Guid.NewGuid()) => Name = BarRules.Text(name,160,"Fornecedor");
    public string Name {get; private set;} = "";
}
public sealed class Purchase : Entity
{
    private Purchase() { }
    public Purchase(Guid supplierId, string document, Guid actor) : base(Guid.NewGuid()) { SupplierId = supplierId; Document = BarRules.Text(document,100,"Documento/referência"); ActorId = actor; }
    public Guid SupplierId {get; private set;}
    public string Document {get; private set;} = "";
    public Guid ActorId {get; private set;}
    public string State {get; private set;} = "Ordered";
    public decimal Freight {get;private set;}
    public decimal Discount {get;private set;}
    public decimal Total {get;private set;}
    public string PaymentMethod {get;private set;} = "Pending";
    public string? AccountReference {get;private set;}
    public DateTimeOffset? PurchasedAtUtc {get;private set;}
    public string? CancellationReason {get;private set;}
    public Guid? CanceledBy {get;private set;}
    public void Terms(decimal freight,decimal discount,string paymentMethod,string? accountReference,DateTimeOffset? purchasedAt)
    {
        Freight=BarRules.Money(freight);Discount=BarRules.Money(discount);PaymentMethod=BarRules.Text(paymentMethod,40,"Forma de pagamento");
        AccountReference=string.IsNullOrWhiteSpace(accountReference)?null:BarRules.Text(accountReference,100,"Conta/referência");PurchasedAtUtc=purchasedAt?.ToUniversalTime();
        var gross=decimal.Round(Items.Sum(x=>x.Quantity*x.PurchaseCost),2);if(discount>gross)throw new BarRuleException("Desconto excede o total bruto.");
        Total=BarRules.Money(gross+freight-discount);var adjustment=freight-discount;decimal allocated=0;decimal cumulativeWeight=0;var items=Items.ToArray();
        for(var n=0;n<items.Length;n++)
        {var item=items[n];var weight=gross==0?item.Quantity:decimal.Round(item.Quantity*item.PurchaseCost,2);var denominator=gross==0?items.Sum(x=>x.Quantity):gross;
            var share=n==items.Length-1?adjustment-allocated:decimal.Round(adjustment*(cumulativeWeight+weight)/denominator,2)-allocated;cumulativeWeight+=weight;allocated+=share;item.Landed(decimal.Round(item.Quantity*item.PurchaseCost,2)+share);}
    }
    public void Cancel(string reason,Guid actor){if(State=="Received"||State=="Canceled")throw new BarRuleException("Compra finalizada não pode ser cancelada.");CancellationReason=BarRules.Text(reason,500,"Motivo");CanceledBy=actor;State="Canceled";Version++;}
    public int Version {get; private set;}
    public ICollection<PurchaseItem> Items {get; private set;} = new List<PurchaseItem>();
    public void Receive() { if(State == "Received" || State == "Canceled") throw new BarRuleException("Compra finalizada."); State = Items.All(x=>x.Received == x.Quantity) ? "Received" : "PartiallyReceived"; Version++; }
}
public sealed class PurchaseItem : Entity
{
    private PurchaseItem() { }
    public PurchaseItem(Guid purchaseId, BarProduct p, decimal quantity, decimal cost) : base(Guid.NewGuid())
    { PurchaseId = purchaseId; ProductId = p.Id; Quantity = BarRules.Quantity(quantity); PurchaseCost = BarRules.Money(cost); Conversion = p.ConversionFactor; PurchaseUnit = p.PurchaseUnit; }
    public Guid PurchaseId {get; private set;}
    public Guid ProductId {get; private set;}
    public decimal Quantity {get; private set;}
    public decimal Received {get; private set;}
    public decimal PurchaseCost {get; private set;}
    public decimal LandedTotal {get;private set;}
    public decimal CostReceived {get;private set;}
    internal void Landed(decimal total)=>LandedTotal=BarRules.Money(total);
    public decimal Conversion {get; private set;}
    public string PurchaseUnit {get; private set;} = "";
    public decimal Receive(decimal quantity) { BarRules.Quantity(quantity); if(Received + quantity > Quantity) throw new BarRuleException("Recebimento excede a quantidade comprada."); Received += quantity;var accumulated=decimal.Round(LandedTotal*Received/Quantity,2);var delta=accumulated-CostReceived;CostReceived=accumulated;return delta; }
}
public sealed class PurchaseReceipt : Entity
{
    private PurchaseReceipt() { }
    public PurchaseReceipt(Guid purchaseId, Guid locationId, Guid operationId, Guid actor) : base(Guid.NewGuid()) { PurchaseId=purchaseId; LocationId=locationId; OperationId=operationId; ActorId=actor; }
    public Guid PurchaseId {get; private set;}
    public Guid LocationId {get; private set;}
    public Guid OperationId {get; private set;}
    public Guid ActorId {get; private set;}
}
