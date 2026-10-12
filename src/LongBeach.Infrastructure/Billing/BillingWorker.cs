using LongBeach.Application.Billing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
namespace LongBeach.Infrastructure.Billing;
public sealed class BillingWorker(IServiceScopeFactory scopes,TimeProvider time,ILogger<BillingWorker> logger):BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer=new PeriodicTimer(TimeSpan.FromMinutes(1),time);
        while(await timer.WaitForNextTickAsync(ct))
            try{await using var scope=scopes.CreateAsyncScope();await scope.ServiceProvider.GetRequiredService<IBilling>().Recover(ct);}
            catch(Exception e)when(!ct.IsCancellationRequested){logger.LogWarning("Billing recovery deferred: {FailureType}",e.GetType().Name);}
    }
}
