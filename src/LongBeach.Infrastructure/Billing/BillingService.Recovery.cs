using System.Security.Cryptography;
using System.Text.Json;
using LongBeach.Contracts.Billing;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
namespace LongBeach.Infrastructure.Billing;
public sealed partial class BillingService
{
    public async Task<AccountDto> Refund(Guid id,Guid paymentId,LongBeach.Contracts.Billing.RefundInput input,Guid actor,CancellationToken ct)
    {
        var a=await Access(id,null,ct);
        if(a.Kind=="Bar") {await tabs.Refund(a.SourceId,paymentId,new TabRefundInput(input.OperationId,input.Amount,input.Reason),actor,ct);return await Account(id,null,ct);}
        BillingPayment payment;BillingRefund refund;
        await using(var tx=await db.Database.BeginTransactionAsync(ct))
        {
            await ArenaLock(ct);payment=await db.Set<BillingPayment>().SingleOrDefaultAsync(x=>x.Id==paymentId&&x.AccountId==id,ct)??throw new BarRuleException("Pagamento não pertence à conta.");
            refund=await db.Set<BillingRefund>().SingleOrDefaultAsync(x=>x.OperationId==input.OperationId,ct)??null!;
            if(refund is not null) Require(refund.PaymentId==paymentId&&refund.Amount==input.Amount&&refund.Reason==input.Reason.Trim(),"Operação de outro estorno.");
            else
            {
                Require(payment.Method!="Subscription"||input.Amount==payment.Amount,"Assinaturas permitem apenas estorno total.");
                Require(input.OperationId!=Guid.Empty&&input.Amount>0&&input.Amount<=payment.Amount-payment.Refunded&&payment.State=="Approved","Confira o valor do estorno.");
                Require(!await db.Set<BillingRefund>().AnyAsync(x=>x.PaymentId==paymentId&&x.State=="Pending",ct),"Há um estorno aguardando confirmação.");
                refund=new BillingRefund(paymentId,input.OperationId,input.Amount,payment.Refunded,input.Reason,actor);db.Add(refund);await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct);
        }
        if(refund.State=="Confirmed")return await Account(id,null,ct);
        if(payment.Method=="Subscription")await recurring.Refund(payment.ChargeId!,refund.OperationId,refund.Amount,refund.Previous,ct);
        else
        {
            var remote=await gateway.RefundPartial(payment.ProviderId!,refund.OperationId,refund.Amount,refund.Previous,ct);Validate(payment,remote);
            Require(remote.Refunded==checked((long)((refund.Previous+refund.Amount)*100)),"Estorno ainda não confirmado.");
        }
        await using(var tx=await db.Database.BeginTransactionAsync(ct))
        {
            await ArenaLock(ct);await db.Entry(payment).ReloadAsync(ct);await db.Entry(refund).ReloadAsync(ct);
            if(refund.State!="Confirmed") {payment.Observe("PAID",refund.Previous+refund.Amount,time.GetUtcNow());refund.Confirm();await UpdateEntry(payment,ct);await db.SaveChangesAsync(ct);}
            await tx.CommitAsync(ct);
        }
        return await Account(id,null,ct);
    }
    public async Task<bool> Webhook(byte[] body,IEnumerable<string> signatures,CancellationToken ct)
    {
        if(!await gateway.VerifyWebhookAsync(body,signatures,ct))return false;
        using var json=JsonDocument.Parse(body);if(!json.RootElement.TryGetProperty("id",out var id))return false;var order=id.GetString();
        var payment=await db.Set<BillingPayment>().SingleOrDefaultAsync(x=>x.ProviderId==order&&x.Method!="Subscription",ct);
        if(payment is null&&json.RootElement.TryGetProperty("reference_id",out var reference)&&Guid.TryParse(reference.GetString(),out var referenceId))
            payment=await db.Set<BillingPayment>().SingleOrDefaultAsync(x=>x.Id==referenceId&&x.Method!="Subscription",ct);
        if(payment is null)return false;
        var remote=await gateway.Get(order!,ct);Validate(payment,remote);
        if(payment.ProviderId is null)
        {
            await using var tx=await db.Database.BeginTransactionAsync(ct);await ArenaLock(ct);await db.Entry(payment).ReloadAsync(ct);payment.Bind(remote.OrderId,remote.ChargeId,remote.PixText,remote.QrImageUrl);await RecordOrder(payment,remote.Reference,ct);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
        }
        await Observe(payment,remote,ct);return true;
    }
    public async Task Recover(CancellationToken ct)
    {
        var pending=await db.Set<BillingPayment>().Where(x=>x.State=="Pending"&&x.ProviderId!=null&&x.Method!="Subscription").Select(x=>new{x.Id,x.AccountId,x.ActorId}).ToListAsync(ct);
        foreach(var p in pending) {try{await Refresh(p.AccountId,p.Id,p.ActorId,false,ct);}catch(Exception ex)when(!ct.IsCancellationRequested){logger.LogWarning("Billing recovery deferred: {FailureType}",ex.GetType().Name);db.ChangeTracker.Clear();}}
        var refunds=await db.Set<BillingRefund>().Where(x=>x.State=="Pending").ToListAsync(ct);
        foreach(var r in refunds)
        {
            try{var p=await db.Set<BillingPayment>().SingleAsync(x=>x.Id==r.PaymentId,ct);await Refund(p.AccountId,p.Id,new(r.OperationId,r.Amount,r.Reason),r.ActorId,ct);}catch(Exception ex)when(!ct.IsCancellationRequested){logger.LogWarning("Billing recovery deferred: {FailureType}",ex.GetType().Name);db.ChangeTracker.Clear();}
        }
        var subscriptions=await db.Set<BillingSubscription>().Where(x=>x.ProviderId!=null).Select(x=>x.Id).ToListAsync(ct);
        foreach(var id in subscriptions) {try{await SyncSubscription(id,ct);}catch(Exception ex)when(!ct.IsCancellationRequested){logger.LogWarning("Billing recovery deferred: {FailureType}",ex.GetType().Name);db.ChangeTracker.Clear();}}
    }
}
