using LongBeach.Application.Bar;
using LongBeach.Domain.Payments;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
namespace LongBeach.Infrastructure.Payments;
// Runs inside the existing API. Concurrency tokens protect against webhook/operator/replica overlap.
public sealed class PagBankReconciliationWorker(IServiceScopeFactory scopes,IConfiguration config,TimeProvider time,ILogger<PagBankReconciliationWorker> logger):BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if(!config.GetValue("Payments:PagBank:Enabled",false))return;
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
            }
            catch(Exception ex) when(!stoppingToken.IsCancellationRequested){logger.LogWarning("PagBank reconciliation cycle deferred: {FailureType}",ex.GetType().Name);}
        }
    }
}
