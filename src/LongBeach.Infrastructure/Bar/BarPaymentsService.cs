using System.Security.Cryptography;
using System.Text.Json;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Payments;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Bar;
public sealed class BarPaymentsService(LongBeachDbContext db,IPaymentGateway gateway,TimeProvider time):IBarPayments
{
    public bool PixEnabled=>gateway.Enabled;
    public async Task<object> Payments(CancellationToken ct)=>await db.Set<BarPayment>().AsNoTracking().OrderByDescending(x=>x.CreatedAtUtc).Take(200).ToListAsync(ct);
    public async Task<object> Pix(Guid saleId,PixInput input,Guid actor,CancellationToken ct)
    {
        if(!gateway.Enabled)throw new BarRuleException("Pix PagBank ainda não habilitado.");
        if(input.OperationId==Guid.Empty)throw new BarRuleException("Chave de operação obrigatória.");
        BarRules.Text(input.Name,160,"Pagador");BarRules.Text(input.Email,320,"E-mail");BarRules.Text(input.TaxId,14,"Documento");
        BarPayment payment;
        await using(var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct))
        {
            var sale=await db.Set<BarSale>().Include(x=>x.Items).SingleOrDefaultAsync(x=>x.Id==saleId,ct)??throw new BarRuleException("Venda inexistente.");
            if(sale.ActorId!=actor)throw new BarRuleException("Venda de outro operador.");
            var existing=await db.Set<BarPayment>().SingleOrDefaultAsync(x=>x.OperationId==input.OperationId,ct);
            if(existing is not null){if(existing.SaleId!=saleId||existing.Method!="Pix")throw new BarRuleException("Chave de outro pagamento.");payment=existing;if(payment.ProviderId is not null)return payment;}
            else
            {
                var session=await db.Set<CashSession>().SingleAsync(x=>x.Id==sale.SessionId,ct);session.EnsureOpen();sale.AwaitPayment();
                payment=new BarPayment(saleId,sale.Total,"Pix",input.OperationId,actor);payment.Pending(time.GetUtcNow().AddMinutes(10));db.Add(payment);
                var stock=new BarStockService(db);
                foreach(var item in sale.Items){if(!await db.Set<BarProduct>().AnyAsync(x=>x.Id==item.ProductId&&x.Active,ct))throw new BarRuleException("Produto desativado desde a criação da venda.");if(!item.ControlsStock)continue;var balance=await stock.Balance(item.ProductId,sale.LocationId,ct);balance.Reserve(item.Quantity);db.Add(new StockReservation(saleId,item.ProductId,sale.LocationId,item.Quantity));}
                await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct);
        }
        var result=await gateway.CreatePix(payment.Id,payment.OperationId,payment.Amount,payment.ExpiresAt!.Value,new PixCustomer(input.Name,input.Email,input.TaxId),ct);
        Validate(payment,result);payment.Provider(result.OrderId,result.PixText,result.QrImageUrl);
        db.Add(new PaymentProviderTransaction(payment.Id,result.OrderId,result.ChargeId,result.State));await db.SaveChangesAsync(ct);
        return await Refresh(payment.Id,ct);
    }
    public async Task<object> OwnPayment(Guid saleId,Guid actor,CancellationToken ct)
    {
        if(!await db.Set<BarSale>().AnyAsync(x=>x.Id==saleId&&x.ActorId==actor,ct))throw new BarRuleException("Venda inexistente ou de outro operador.");
        return await db.Set<BarPayment>().AsNoTracking().SingleOrDefaultAsync(x=>x.SaleId==saleId,ct)??throw new BarRuleException("Pagamento ainda não iniciado.");
    }
    public async Task<object> OperatorRefresh(Guid saleId,Guid actor,CancellationToken ct)
    {
        var sale=await db.Set<BarSale>().SingleOrDefaultAsync(x=>x.Id==saleId&&x.ActorId==actor,ct)??throw new BarRuleException("Venda inexistente ou de outro operador.");
        var payment=await db.Set<BarPayment>().SingleAsync(x=>x.SaleId==saleId,ct);
        return await Refresh(payment.Id,ct);
    }
    public async Task<object> Refresh(Guid paymentId,CancellationToken ct)
    {
        var payment=await db.Set<BarPayment>().SingleOrDefaultAsync(x=>x.Id==paymentId,ct)??throw new BarRuleException("Pagamento inexistente.");
        if(payment.ProviderId is null)throw new BarRuleException("Criação da cobrança ainda precisa ser repetida com a mesma chave.");
        var result=await gateway.Get(payment.ProviderId,ct);Validate(payment,result);
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        await db.Entry(payment).ReloadAsync(ct);
        if(payment.State=="Pending" && (result.State=="PAID"||result.State=="CANCELED"||result.State=="DECLINED"))
        {
            var sale=await db.Set<BarSale>().Include(x=>x.Items).SingleAsync(x=>x.Id==payment.SaleId,ct);
            var reservations=await db.Set<StockReservation>().Where(x=>x.SaleId==sale.Id&&!x.Released).ToListAsync(ct);var stock=new BarStockService(db);
            foreach(var reservation in reservations)
            {
                var balance=await stock.Balance(reservation.ProductId,reservation.LocationId,ct);balance.Release(reservation.Quantity);reservation.Release();
                if(result.State=="PAID"){var item=sale.Items.Single(x=>x.ProductId==reservation.ProductId);db.Add(new StockMovement(balance,-item.Quantity,item.UnitCost,"Sale","Pix confirmado",sale.Id,sale.ActorId));}
            }
            if(result.State=="PAID"){payment.Approve();sale.Paid();db.Add(new BarEvent("SalePaid",sale.Id,sale.Total));}
            else {payment.Reject();sale.PaymentCanceled("Cobrança recusada ou cancelada pelo PagBank");}
            db.Add(new PaymentProviderTransaction(payment.Id,result.OrderId,result.ChargeId,result.State));await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);return payment;
    }
    public async Task<bool> Webhook(byte[] body,IEnumerable<string> signatures,CancellationToken ct)
    {
        if(!gateway.VerifyWebhook(body,signatures))return false;
        var hash=Convert.ToHexString(SHA256.HashData(body));if(await db.Set<PaymentWebhookInbox>().AnyAsync(x=>x.PayloadHash==hash,ct))return true;
        using var doc=JsonDocument.Parse(body);var orderId=doc.RootElement.GetProperty("id").GetString();
        var payment=await db.Set<BarPayment>().SingleOrDefaultAsync(x=>x.ProviderId==orderId,ct);
        if(payment is null)throw new BarRuleException("Pedido ainda não vinculado; reenviar notificação.");
        await Refresh(payment.Id,ct);db.Add(new PaymentWebhookInbox(hash,orderId!));await db.SaveChangesAsync(ct);return true;
    }
    public async Task<object> Reconcile(Guid paymentId,ReconcileInput input,Guid actor,CancellationToken ct)
    {
        var payment=await db.Set<BarPayment>().SingleOrDefaultAsync(x=>x.Id==paymentId,ct)??throw new BarRuleException("Pagamento inexistente.");
        if(payment.Method=="Pix" && payment.ProviderId is not null){var remote=await gateway.Get(payment.ProviderId,ct);Validate(payment,remote);if(remote.Refunded>0||remote.State!="PAID")throw new BarRuleException("Pagamento divergente no PagBank; revise o estorno antes de conciliar.");}
        var reconciliation=new PaymentReconciliation(payment,input.Fee,input.Net,input.Reason,actor);db.Add(reconciliation);
        if(input.Fee>0)db.Add(new BarEvent("PaymentFeeRegistered",paymentId,input.Fee));await db.SaveChangesAsync(ct);return reconciliation;
    }
    public async Task<object> Dashboard(DateTimeOffset? fromUtc,DateTimeOffset? toUtc,CancellationToken ct)
    {
        var zone=TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");
        var day=TimeZoneInfo.ConvertTime(time.GetUtcNow(),zone).Date;
        var from=fromUtc?.ToUniversalTime()??new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(day,DateTimeKind.Unspecified),zone));
        var to=toUtc?.ToUniversalTime()??from.AddDays(1);
        if(to<=from || to-from>TimeSpan.FromDays(366))throw new BarRuleException("Período inválido (até 366 dias).");
        var events=await db.Set<BarEvent>().AsNoTracking().Where(x=>x.CreatedAtUtc>=from&&x.CreatedAtUtc<to).ToListAsync(ct);
        var saleIds=events.Where(x=>x.Name=="SalePaid").Select(x=>x.OriginId).ToArray();
        var sales=await db.Set<BarSale>().AsNoTracking().Include(x=>x.Items).Where(x=>saleIds.Contains(x.Id)).ToListAsync(ct);
        var movements=await db.Set<StockMovement>().AsNoTracking().Where(x=>x.CreatedAtUtc>=from&&x.CreatedAtUtc<to).ToListAsync(ct);
        var payments=await db.Set<BarPayment>().AsNoTracking().Where(x=>saleIds.Contains(x.SaleId)).ToListAsync(ct);
        var returnIds=movements.Where(x=>x.Kind=="SaleReturn").Select(x=>x.OriginId).Distinct().ToArray();
        var courtesyReturns=await db.Set<BarPayment>().AsNoTracking().Where(x=>x.Method=="Courtesy"&&returnIds.Contains(x.SaleId)).Select(x=>x.SaleId).ToListAsync(ct);
        var revenue=events.Where(x=>x.Name=="SalePaid"||x.Name=="SaleRefunded").Sum(x=>x.Amount);
        var cost=sales.Sum(x=>x.Cost)-movements.Where(x=>x.Kind=="SaleReturn"&&!courtesyReturns.Contains(x.OriginId)).Sum(x=>decimal.Round(x.Quantity*x.UnitCost,6));
        var fees=events.Where(x=>x.Name=="PaymentFeeRegistered").Sum(x=>x.Amount);var profit=revenue-cost;
        var products=await db.Set<BarProduct>().AsNoTracking().Where(x=>x.Active&&x.ControlsStock).ToDictionaryAsync(x=>x.Id,ct);
        var balances=await db.Set<StockBalance>().AsNoTracking().ToListAsync(ct);
        var low=balances.Where(x=>products.ContainsKey(x.ProductId)&&x.Available<products[x.ProductId].MinimumStock).Select(x=>new{x.ProductId,x.LocationId,x.Available,products[x.ProductId].Name}).ToArray();
        return new{fromUtc=from,toUtc=to,sales=sales.Count,revenue,cost,grossProfit=profit,grossMargin=revenue==0?0:profit/revenue*100,
            courtesyCost=events.Where(x=>x.Name=="CourtesyApproved").Sum(x=>x.Amount)-movements.Where(x=>x.Kind=="SaleReturn"&&courtesyReturns.Contains(x.OriginId)).Sum(x=>decimal.Round(x.Quantity*x.UnitCost,6)),
            lossCost=movements.Where(x=>x.Kind=="Loss").Sum(x=>-decimal.Round(x.Quantity*x.UnitCost,6)),
            internalConsumptionCost=movements.Where(x=>x.Kind=="InternalConsumption").Sum(x=>-decimal.Round(x.Quantity*x.UnitCost,6)),
            paymentFees=fees,netAfterFees=profit-fees,ticket=sales.Count==0?0:sales.Sum(x=>x.Total)/sales.Count,
            openCashSessions=await db.Set<CashSession>().CountAsync(x=>x.State=="Open"||x.State=="Reopened",ct),lowStock=low,
            purchases=events.Where(x=>x.Name=="PurchaseReceived").Sum(x=>x.Amount),
            paymentsByMethod=payments.GroupBy(x=>x.Method).Select(g=>new{method=g.Key,amount=g.Sum(x=>x.Amount)}),
            bestSellers=sales.SelectMany(x=>x.Items).GroupBy(x=>new{x.ProductId,x.Name}).Select(g=>new{g.Key.ProductId,g.Key.Name,quantity=g.Sum(x=>x.Quantity)}).OrderByDescending(x=>x.quantity).Take(10)};
    }
    private static void Validate(BarPayment payment,GatewayPayment result)
    {if(result.Reference!=payment.Id.ToString()||result.Amount!=checked((long)(payment.Amount*100))||result.Currency!="BRL")throw new BarRuleException("Cobrança PagBank diverge da referência ou do valor registrado no Long Beach.");}
}
