using System.Text.Json.Nodes;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Billing;
public static class BillingWriteGuard
{
    // Caller holds the same arena advisory lock used by payment initiation.
    public static async Task Check(LongBeachDbContext db,Guid id,JsonObject incoming,string? saved,CancellationToken ct)
    {
        if(saved is null)
        {
            var (sourceKind,sourceId)=await BillingService.BillingSource(db,incoming,ct);
            var subscription=await db.Set<BillingSubscription>().SingleOrDefaultAsync(x=>x.SourceKind==sourceKind&&x.SourceId==sourceId&&x.State!="CANCELED"&&x.State!="EXPIRED",ct);
            if(subscription is not null)
            {
                if(!DateOnly.TryParseExact(incoming["month"]+"-01","yyyy-MM-dd",out var month))throw new BarRuleException("Confira a competência da assinatura.");
                var due=new DateOnly(month.Year,month.Month,Math.Min(subscription.FirstDue.Day,DateTime.DaysInMonth(month.Year,month.Month)));
                if(incoming["status"]?.ToString()!="Pendente"||incoming["amount"]?.GetValue<decimal>()!=subscription.Amount||incoming["dueDate"]?.ToString()!=due.ToString("yyyy-MM-dd"))throw new BarRuleException("Preserve o valor e o vencimento autorizados na assinatura.");
            }
            return;
        }
        var old=JsonNode.Parse(saved)!.AsObject();
        if(new[]{"amount","dueDate","status","paidDate","sourceKind","sourceId","month","direction"}.All(k=>JsonNode.DeepEquals(old[k],incoming[k])))return;
        var account=await db.Set<BillingAccount>().SingleOrDefaultAsync(x=>x.Kind=="Quadra"&&x.SourceId==id,ct);
        if(account is not null&&await db.Set<BillingPayment>().AnyAsync(x=>x.AccountId==account.Id&&x.State!="Canceled",ct))throw new BarRuleException("Este lançamento tem pagamento integrado. Use consulta ou estorno para alterar o recebimento.");
        var (kind,source)=await BillingService.BillingSource(db,old,ct);
        if(await db.Set<BillingSubscription>().AnyAsync(x=>x.SourceKind==kind&&x.SourceId==source&&x.State!="CANCELED"&&x.State!="EXPIRED",ct))throw new BarRuleException("Há assinatura vinculada. Cancele e concilie antes de alterar a cobrança.");
    }
}
