using LongBeach.Domain.Common;
using LongBeach.Domain.Bar;
namespace LongBeach.Domain.Payments;
public sealed class StockReservation : Entity
{
    private StockReservation(){}
    public StockReservation(Guid saleId,Guid productId,Guid locationId,decimal quantity):base(Guid.NewGuid()){SaleId=saleId;ProductId=productId;LocationId=locationId;Quantity=quantity;}
    public Guid SaleId{get;private set;} public Guid ProductId{get;private set;} public Guid LocationId{get;private set;} public decimal Quantity{get;private set;} public bool Released{get;private set;}
    public void Release(){if(Released)throw new BarRuleException("Reserva já liberada.");Released=true;}
}
public sealed class PaymentWebhookInbox : Entity
{
    private PaymentWebhookInbox(){}
    public PaymentWebhookInbox(string payloadHash,string orderId):base(Guid.NewGuid()){PayloadHash=payloadHash;OrderId=orderId;}
    public string PayloadHash{get;private set;}="";public string OrderId{get;private set;}="";
}
public sealed class PaymentProviderTransaction : Entity
{
    private PaymentProviderTransaction(){}
    public PaymentProviderTransaction(Guid paymentId,string orderId,string chargeId,string state):base(Guid.NewGuid()){PaymentId=paymentId;OrderId=orderId;ChargeId=chargeId;State=state;}
    public Guid PaymentId{get;private set;}public string OrderId{get;private set;}="";public string ChargeId{get;private set;}="";public string State{get;private set;}="";
}
public sealed class PaymentReconciliation : Entity
{
    private PaymentReconciliation(){}
    public PaymentReconciliation(BarPayment payment,decimal fee,decimal net,string reason,Guid actor):base(Guid.NewGuid())
    {if(payment.State!="Approved"||payment.Method=="Courtesy")throw new BarRuleException("Conciliação exige pagamento aprovado.");Fee=BarRules.Money(fee);Net=BarRules.Money(net);if(Fee+Net!=payment.Amount)throw new BarRuleException("Taxa mais líquido deve corresponder ao valor aprovado.");Reason=BarRules.Text(reason,500,"Referência/justificativa");PaymentId=payment.Id;ActorId=actor;}
    public Guid PaymentId{get;private set;}public decimal Fee{get;private set;}public decimal Net{get;private set;}public string Reason{get;private set;}="";public Guid ActorId{get;private set;}
}
