using LongBeach.Application.Bar;
using LongBeach.Domain.Payments;
using LongBeach.Domain.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
namespace LongBeach.Infrastructure.Payments;
// Runs inside the existing API. Concurrency tokens protect against webhook/operator/replica overlap.
public sealed class PagBankReconciliationWorker(IServiceScopeFactory scopes,TimeProvider time,ILogger<PagBankReconciliationWorker> logger):BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {

        using var timer=new PeriodicTimer(TimeSpan.FromMinutes(1),time);
        while(await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                Guid[] ids;
                await using(var scope=scopes.CreateAsyncScope())
                {
                    var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
                    ids=await db.Set<BarPayment>().AsNoTracking().Where(x=>x.State=="Pending"&&x.ProviderId!=null)
                        .OrderBy(x=>x.CreatedAtUtc).Select(x=>x.Id).ToArrayAsync(stoppingToken);
                }
                foreach(var id in ids)
                {
                    try{await using var scope=scopes.CreateAsyncScope();await scope.ServiceProvider.GetRequiredService<IBarPayments>().Refresh(id,stoppingToken);}
                    catch(Exception ex) when(!stoppingToken.IsCancellationRequested){logger.LogWarning("PagBank reconciliation deferred for payment {PaymentId}: {FailureType}",id,ex.GetType().Name);}
                }
                Guid[] tabIds; BarTabRefund[] refunds;
                await using(var scope=scopes.CreateAsyncScope())
                {
                    var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
                    tabIds=await db.Set<BarTabPayment>().AsNoTracking().Where(x=>x.State=="Pending"&&x.ProviderId!=null).OrderBy(x=>x.CreatedAtUtc).Select(x=>x.Id).ToArrayAsync(stoppingToken);
                    refunds=await db.Set<BarTabRefund>().AsNoTracking().Where(x=>x.State=="Pending").OrderBy(x=>x.CreatedAtUtc).ToArrayAsync(stoppingToken);
                }
                foreach(var id in tabIds)
                {
                    try{await using var scope=scopes.CreateAsyncScope();await scope.ServiceProvider.GetRequiredService<IBarTabs>().RefreshProviderPayment(id,stoppingToken);}
                    catch(Exception ex) when(!stoppingToken.IsCancellationRequested){logger.LogWarning("Tab Pix reconciliation deferred for {PaymentId}: {FailureType}",id,ex.GetType().Name);}
                }
                foreach(var refund in refunds)
                {
                    try{await using var scope=scopes.CreateAsyncScope();await scope.ServiceProvider.GetRequiredService<IBarTabs>().Refund(refund.TabId,refund.PaymentId,new TabRefundInput(refund.OperationId,refund.Amount,refund.Reason),refund.ActorId,stoppingToken);}
                    catch(Exception ex) when(!stoppingToken.IsCancellationRequested){logger.LogWarning("Tab refund reconciliation deferred for {RefundId}: {FailureType}",refund.Id,ex.GetType().Name);}
                }
            }
            catch(Exception ex) when(!stoppingToken.IsCancellationRequested){logger.LogWarning("PagBank reconciliation cycle deferred: {FailureType}",ex.GetType().Name);}
        }
    }
}
