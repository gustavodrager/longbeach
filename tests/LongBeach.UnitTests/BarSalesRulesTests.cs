using LongBeach.Domain.Bar;
using LongBeach.Domain.Payments;
using LongBeach.Domain.Purchases;
namespace LongBeach.UnitTests;
public sealed class BarSalesRulesTests
{
    [Fact]
    public void Paid_sale_is_immutable_and_snapshots_price_and_cost()
    {
        var p=Product();var sale=new BarSale(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid());sale.Add(p,2);sale.Paid();
        p.Change("Novo nome","Novo",p.CategoryId,"un","cx",24,50,30,0,true,false,0,true);
        Assert.Equal(20,sale.Total);Assert.Equal(12,sale.Cost);Assert.Equal("Água",sale.Items.Single().Name);
        Assert.Throws<BarRuleException>(()=>sale.Add(p,1));Assert.Throws<BarRuleException>(()=>sale.Cancel("erro"));
    }
    [Fact]
    public void Refund_is_single_and_does_not_implicitly_return_stock()
    {var s=new BarSale(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid());s.Add(Product(),1);s.Paid();s.Refund("Solicitado pelo cliente");Assert.Equal("Refunded",s.State);Assert.Throws<BarRuleException>(()=>s.Refund("repetido"));}
    [Fact]
    public void Inactive_product_cannot_enter_sale()
    {var p=Product();p.Change(p.Name,p.ShortName,p.CategoryId,"un","cx",24,10,6,0,true,false,0,false);Assert.Throws<BarRuleException>(()=>new BarSale(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid()).Add(p,1));}
    [Fact]
    public void Partial_receiving_cannot_over_receive()
    {var p=new Purchase(Guid.NewGuid(),"NF-1",Guid.NewGuid());var i=new PurchaseItem(p.Id,Product(),2,144);p.Items.Add(i);i.Receive(1);p.Receive();Assert.Equal("PartiallyReceived",p.State);Assert.Throws<BarRuleException>(()=>i.Receive(2));i.Receive(1);p.Receive();Assert.Equal("Received",p.State);Assert.Throws<BarRuleException>(()=>p.Receive());}
    [Fact]
    public void Fees_are_separate_and_net_must_match_payment()
    {var p=new BarPayment(Guid.NewGuid(),100,"CardManual",Guid.NewGuid(),Guid.NewGuid());Assert.Throws<BarRuleException>(()=>new PaymentReconciliation(p,3,98,"NSU 1",Guid.NewGuid()));var r=new PaymentReconciliation(p,3,97,"NSU 1",Guid.NewGuid());Assert.Equal(3,r.Fee);Assert.Equal(97,r.Net);}
    [Fact]
    public void Freight_and_discount_allocation_preserves_invoice_cents_and_partial_receipts()
    {
        var purchase=new Purchase(Guid.NewGuid(),"NF-rounded",Guid.NewGuid());
        for(var n=0;n<5;n++)purchase.Items.Add(new PurchaseItem(purchase.Id,Product(),1,0.01m));
        purchase.Terms(0,0.02m,"Pending",null,null);
        Assert.Equal(0.03m,purchase.Total);Assert.Equal(purchase.Total,purchase.Items.Sum(x=>x.LandedTotal));Assert.All(purchase.Items,x=>Assert.True(x.LandedTotal>=0));
        var second=new Purchase(Guid.NewGuid(),"NF-partial",Guid.NewGuid());var item=new PurchaseItem(second.Id,Product(),3,1);second.Items.Add(item);second.Terms(0,1,"Pending",null,null);
        Assert.Equal(2m,item.Receive(1)+item.Receive(1)+item.Receive(1));
    }
    [Fact]
    public void Acquisition_unit_cost_and_sale_snapshot_keep_fractional_cents()
    {
        var product=Product();product.ReceiveCost(0,24,decimal.Round(100m/24m,6));var sale=new BarSale(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid());sale.Add(product,1);sale.Paid();
        Assert.Equal(4.166667m,sale.Cost);Assert.Equal(product.AverageCost,sale.Items.Single().UnitCost);
    }
    private static BarProduct Product()=>new("AGUA","Água","Água",Guid.NewGuid(),"un","cx",24,10,6,0,true,false,0);
}
