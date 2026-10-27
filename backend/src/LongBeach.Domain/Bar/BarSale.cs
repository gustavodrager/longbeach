using LongBeach.Domain.Common;
namespace LongBeach.Domain.Bar;
public sealed class BarSale : Entity
{
    private BarSale() { }
    public BarSale(Guid sessionId, Guid locationId, Guid actor) : base(Guid.NewGuid()) { SessionId = sessionId; LocationId = locationId; ActorId = actor; }
    public Guid SessionId { get; private set; }
    public Guid LocationId { get; private set; }
    public Guid ActorId { get; private set; }
    public string State { get; private set; } = "Draft";
    public string? Reason { get; private set; }
    public decimal Total { get; private set; }
    public decimal DiscountAmount { get; private set; }
    public decimal Cost { get; private set; }
    public int Version { get; private set; }
    public ICollection<BarSaleItem> Items { get; private set; } = new List<BarSaleItem>();
    public void Add(BarProduct product, decimal quantity)
    {
        if (State != "Draft") throw new BarRuleException("Venda paga ou aguardando pagamento é imutável.");
        if (!product.Active) throw new BarRuleException("Produto inativo."); BarRules.Quantity(quantity);
        if (Items.Any(x => x.ProductId == product.Id)) throw new BarRuleException("Agrupe a quantidade de cada produto em um único item.");
        var item = new BarSaleItem(Id, product, quantity); Items.Add(item); Total = BarRules.Money(Total+item.Total);var nextCost=Cost+decimal.Round(item.UnitCost*quantity,6);if(nextCost>999999999999m)throw new BarRuleException("Custo total fora do limite.");Cost=nextCost; Version++;
    }
    public void Discount(decimal amount)
    {if(State!="Draft"||DiscountAmount!=0)throw new BarRuleException("Desconto só pode ser aplicado uma vez no rascunho.");BarRules.Money(amount);if(amount<=0||amount>=Total)throw new BarRuleException("Desconto deve ser menor que o total; para isenção integral use cortesia.");DiscountAmount=amount;Total-=amount;Version++;}
    public void AwaitPayment() { if (State != "Draft" || Items.Count == 0 || Total <= 0) throw new BarRuleException("Venda inválida."); State = "AwaitingPayment"; Version++; }
    public void Paid(bool courtesy = false, string? reason = null)
    {
        if (State != "Draft" && State != "AwaitingPayment") throw new BarRuleException("Venda já finalizada.");
        if (Items.Count == 0 || (!courtesy && Total <= 0)) throw new BarRuleException("Venda sem itens ou valor.");
        if (courtesy) { Reason = BarRules.Text(reason, 500, "Motivo da cortesia"); Total = 0; }
        State = "Paid"; Version++;
    }
    public void Cancel(string reason) { if (State != "Draft") throw new BarRuleException("Venda com pagamento exige estorno ou cancelamento da cobrança."); Reason = BarRules.Text(reason, 500, "Motivo"); State = "Canceled"; Version++; }
    public void PaymentCanceled(string reason) { if(State!="AwaitingPayment")throw new BarRuleException("Venda não aguarda pagamento.");Reason=reason;State="Canceled";Version++; }
    public void Refund(string reason) { if (State != "Paid") throw new BarRuleException("Somente venda paga pode ser estornada uma vez."); Reason = BarRules.Text(reason, 500, "Motivo"); State = "Refunded"; Version++; }
}
public sealed class BarSaleItem : Entity
{
    private BarSaleItem() { }
    public BarSaleItem(Guid saleId, BarProduct product, decimal quantity) : base(Guid.NewGuid())
    { SaleId = saleId; ProductId = product.Id; Name = product.Name; Quantity = quantity; UnitPrice = product.SalePrice; UnitCost = product.AverageCost; ControlsStock = product.ControlsStock; Total = decimal.Round(UnitPrice * quantity, 2); }
    public Guid SaleId { get; private set; }
    public Guid ProductId { get; private set; }
    public string Name { get; private set; } = "";
    public decimal Quantity { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal UnitCost { get; private set; }
    public decimal Total { get; private set; }
    public bool ControlsStock { get; private set; }
}

public sealed class BarSaleDiscount : Entity
{
    private BarSaleDiscount(){}
    public BarSaleDiscount(BarSale sale,decimal amount,string reason,Guid actor):base(Guid.NewGuid()){Reason=BarRules.Text(reason,500,"Motivo do desconto");sale.Discount(amount);SaleId=sale.Id;Amount=amount;ActorId=actor;}
    public Guid SaleId{get;private set;}public decimal Amount{get;private set;}public string Reason{get;private set;}="";public Guid ActorId{get;private set;}
}
