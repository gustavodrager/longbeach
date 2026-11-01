using LongBeach.Application.Messaging;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Messaging;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
namespace LongBeach.Infrastructure.Messaging;

public sealed class MessagingWorker(IServiceScopeFactory scopes,IConfiguration configuration,TimeProvider time,ILogger<MessagingWorker> logger):BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer=new PeriodicTimer(TimeSpan.FromSeconds(5));
        while(!stoppingToken.IsCancellationRequested)
        {
            if(configuration.GetValue("Messaging:Enabled",false))
            {
                try{await RunOnceAsync(stoppingToken);}catch(OperationCanceledException)when(stoppingToken.IsCancellationRequested){break;}
                catch(Exception){logger.LogWarning("WhatsApp processing will retry; message contents and credentials omitted.");}
            }
            try{if(!await timer.WaitForNextTickAsync(stoppingToken))break;}catch(OperationCanceledException)when(stoppingToken.IsCancellationRequested){break;}
        }
    }
    public async Task RunOnceAsync(CancellationToken ct)
    {
        await using var scope=scopes.CreateAsyncScope();var bridge=scope.ServiceProvider.GetRequiredService<IMessagingBridge>();
        var status=await bridge.StatusAsync(ct);if(!string.Equals(status.State,"Connected",StringComparison.OrdinalIgnoreCase))return;
        var automation=scope.ServiceProvider.GetRequiredService<IMessagingAutomation>();await automation.TickAsync(ct);
        var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var incoming=await db.Set<MessagingMessage>().AsNoTracking().Where(x=>x.Direction=="Inbound"&&!x.AutomationProcessed&&!x.IsHistory).OrderBy(x=>x.OccurredAtUtc).Take(10).Select(x=>new{x.Id,x.ConversationId}).ToListAsync(ct);
        foreach(var row in incoming)
        {
            await using var next=scopes.CreateAsyncScope();var a=next.ServiceProvider.GetRequiredService<IMessagingAutomation>();await a.OnIncomingAsync(row.ConversationId,row.Id,ct);
            var nextDb=next.ServiceProvider.GetRequiredService<LongBeachDbContext>();var m=await nextDb.Set<MessagingMessage>().SingleAsync(x=>x.Id==row.Id,ct);m.AutomationProcessed=true;await nextDb.SaveChangesAsync(ct);
        }
        // Sending left by a restarted process is always reconciled, never blindly submitted again.
        var uncertain=await db.Set<MessagingMessage>().AsNoTracking().Where(x=>x.State=="Uncertain"||x.State=="Sending"&&x.AttemptedAtUtc<time.GetUtcNow().AddMinutes(-1)).OrderBy(x=>x.AttemptedAtUtc).Take(10).Select(x=>new{x.Id,x.OperationId}).ToListAsync(ct);
        foreach(var row in uncertain)
        {
            if(row.OperationId is null)continue;var result=await bridge.FindAsync(row.OperationId.Value,ct);
            if(result is not null)await RecordResult(row.Id,result,ct);
            else
            {
                var missing=await db.Set<MessagingMessage>().AsNoTracking().Where(x=>x.Id==row.Id).Select(x=>x.ExternalId).SingleAsync(ct);
                await RecordResult(row.Id,new(missing,"Uncertain"),ct);
            }
        }
        var ready=await db.Set<MessagingMessage>().AsNoTracking().Where(x=>x.Direction=="Outbound"&&(x.State=="Queued"||x.State=="Scheduled"&&x.ScheduledAtUtc<=time.GetUtcNow())).OrderBy(x=>x.CreatedAtUtc).Take(10).Select(x=>x.Id).ToListAsync(ct);
        foreach(var id in ready)await DispatchAsync(id,ct);
    }
    private async Task DispatchAsync(Guid id,CancellationToken ct)
    {
        BridgeSendRequest? request=null;
        await using(var scope=scopes.CreateAsyncScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            await using var tx=await db.Database.BeginTransactionAsync(ct);await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({MessagingService.ArenaLockKey})",ct);
            var m=await db.Set<MessagingMessage>().SingleOrDefaultAsync(x=>x.Id==id,ct);
            if(m is null||m.State is not("Queued" or "Scheduled"))return;
            var c=await db.Set<MessagingConversation>().SingleAsync(x=>x.Id==m.ConversationId,ct);
            if(m.Origin=="Bot"&&c.Mode!="Bot"&&m.Purpose!="Handoff"){m.Suppress("A equipe assumiu o atendimento.");await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return;}
            if(!await scope.ServiceProvider.GetRequiredService<IMessagingAutomation>().PrepareOutgoingAsync(m.Id,ct))
            {if(m.State is "Queued" or "Scheduled")m.Suppress("O contexto mudou; envio suspenso para conferência.");await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return;}
            if(m.State is not("Queued" or "Scheduled"))return;
            BridgeMedia? media=null;
            if(m.AttachmentId is Guid attachmentId)
            {var a=await db.Set<MessagingAttachment>().AsNoTracking().SingleAsync(x=>x.Id==attachmentId,ct);media=new(Convert.ToBase64String(a.Data),a.ContentType,a.FileName,a.ContentType.StartsWith("image/")?"image":"document");}
            m.Transition("Sending");m.AttemptedAtUtc=time.GetUtcNow();await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
            request=new(m.OperationId!.Value,m.ExternalId,c.ExternalId,m.Text,media);
        }
        try
        {
            await using var scope=scopes.CreateAsyncScope();var result=await scope.ServiceProvider.GetRequiredService<IMessagingBridge>().SendAsync(request!,ct);await RecordResult(id,result,ct);
        }
        catch(Exception e)when(e is HttpRequestException or TaskCanceledException or MessagingRuleException)
        {await RecordResult(id,new(request!.MessageId,"Uncertain"),CancellationToken.None);if(ct.IsCancellationRequested)ct.ThrowIfCancellationRequested();}
    }
    private async Task RecordResult(Guid id,BridgeSendResult result,CancellationToken ct)
    {
        await using var scope=scopes.CreateAsyncScope();var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();await using var tx=await db.Database.BeginTransactionAsync(ct);await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({MessagingService.ArenaLockKey})",ct);
        var m=await db.Set<MessagingMessage>().SingleAsync(x=>x.Id==id,ct);
        if(result.MessageId!=m.ExternalId){m.Transition("Uncertain","A confirmação recebida não corresponde ao envio.");}
        else
        {
            var state=result.State is "Sent" or "Delivered" or "Read" or "Failed"?result.State:"Uncertain";
            m.Transition(state,state=="Failed"?"O WhatsApp recusou o envio. Confira o contato e a conexão.":state=="Uncertain"?"A confirmação ainda não chegou. O sistema está conferindo o mesmo envio.":null);
            if(MessagingRules.ReceiptRank(m.State)>0)(await db.Set<MessagingConversation>().SingleAsync(x=>x.Id==m.ConversationId,ct)).Observe(m.Text,m.OccurredAtUtc,false,false);
        }
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
    }
}
