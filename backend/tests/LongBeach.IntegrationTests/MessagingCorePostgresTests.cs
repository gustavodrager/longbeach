using LongBeach.Application.Abstractions;
using LongBeach.Application.Messaging;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Messaging;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Messaging;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace LongBeach.IntegrationTests;

public sealed class MessagingCorePostgresTests
{
    private const string Chat="5511999990000@s.whatsapp.net";
    private static async Task<(MessagingService Service,Guid Actor,ConversationDto Conversation)> Seed(LongBeachDbContext db)
    {
        var actor=User.Create("Atendente sintético","messaging.staff@example.test","synthetic-only-hash");var customer=new Customer("Cliente sintético","11999990000",null,"test");db.AddRange(actor,customer);await db.SaveChangesAsync();
        var service=new MessagingService(db,TimeProvider.System);return(service,actor.Id,await service.CreateConversationAsync(new(Guid.NewGuid(),customer.Id),actor.Id,default));
    }
    [PostgresFact]
    public async Task Repeated_send_has_one_record_and_manual_send_pauses_before_dispatch()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var db=isolated.Context;var f=await Seed(db);
        Assert.False(f.Conversation.IdentityVerified);
        var input=new SendMessageInput(Guid.NewGuid(),"Olá, mensagem sintética");var first=await f.Service.SendAsync(f.Conversation.Id,input,f.Actor,default);var second=await f.Service.SendAsync(f.Conversation.Id,input,f.Actor,default);
        Assert.Equal(first.Id,second.Id);Assert.Equal(1,await db.Set<MessagingMessage>().CountAsync());Assert.Equal("Queued",first.State);
        var c=await f.Service.ConversationAsync(f.Conversation.Id,default);Assert.Equal("Team",c.Mode);Assert.Equal(f.Actor,c.AssignedUserId);
        var error=await Assert.ThrowsAsync<MessagingRuleException>(()=>f.Service.SendAsync(c.Id,input with{Text="Outra mensagem"},f.Actor,default));Assert.Equal(409,error.StatusCode);
        Assert.Equal(first.Id,(await f.Service.OperationAsync(input.OperationId,default)).Id);
    }
    [PostgresFact]
    public async Task Inbound_dedup_aliases_history_and_phone_reply_have_correct_effects()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var f=await Seed(isolated.Context);var incoming=new BridgeEvent("evt-1","message",Chat,"incoming-1",SenderPhone:"5511999990000",Aliases:[Chat,"123456@lid"],Text:"Vou à aula",OccurredAtUtc:DateTimeOffset.UtcNow);
        await f.Service.IngestAsync(incoming,default);await f.Service.IngestAsync(incoming,default);
        Assert.Equal(1,(await f.Service.ConversationAsync(f.Conversation.Id,default)).UnreadCount);Assert.Equal(1,await isolated.Context.Set<MessagingMessage>().CountAsync());
        await f.Service.IngestAsync(incoming with{EventId="evt-2",ChatId="123456@lid",MessageId="historical",IsHistory=true},default);
        Assert.Equal(1,(await f.Service.ConversationAsync(f.Conversation.Id,default)).UnreadCount);
        await f.Service.IngestAsync(incoming with{EventId="evt-3",MessageId="phone-reply",FromMe=true,Text="Atendimento humano"},default);
        Assert.Equal("Team",(await f.Service.ConversationAsync(f.Conversation.Id,default)).Mode);
        var history=await isolated.Context.Set<MessagingMessage>().SingleAsync(x=>x.ExternalId=="historical");Assert.True(history.AutomationProcessed);
        await f.Service.IngestAsync(incoming with{EventId="evt-group",ChatId="123@g.us",MessageId="group"},default);
        await f.Service.IngestAsync(incoming with{EventId="evt-status",ChatId="status@broadcast",MessageId="status"},default);
        Assert.Equal(1,await isolated.Context.Set<MessagingConversation>().CountAsync());Assert.Equal(3,await isolated.Context.Set<MessagingMessage>().CountAsync());
    }
    [PostgresFact]
    public async Task Receipt_order_does_not_regress_and_receipt_cannot_cross_conversations()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var db=isolated.Context;var f=await Seed(db);var send=await f.Service.SendAsync(f.Conversation.Id,new(Guid.NewGuid(),"Teste"),f.Actor,default);var m=await db.Set<MessagingMessage>().SingleAsync(x=>x.Id==send.Id);
        await f.Service.IngestAsync(new("receipt-read","receipt",Chat,MessageIds:[m.ExternalId],State:"Read"),default);
        await f.Service.IngestAsync(new("receipt-delivered","receipt",Chat,MessageIds:[m.ExternalId],State:"Delivered"),default);Assert.Equal("Read",(await f.Service.OperationAsync(m.OperationId!.Value,default)).State);
        var other=new MessagingConversation("5511888880000@s.whatsapp.net","5511888880000","Outro cliente");var collision=new MessagingMessage(other.Id,"Outbound","Phone","Outra conversa",DateTimeOffset.UtcNow,"Sent",m.ExternalId);db.AddRange(other,new MessagingAlias(other.Id,other.ExternalId),collision);await db.SaveChangesAsync();
        await f.Service.IngestAsync(new("receipt-again","receipt",Chat,MessageIds:[m.ExternalId],State:"Read"),default);Assert.Equal("Sent",collision.State);
    }
    [PostgresFact]
    public async Task Cursor_pagination_keeps_history_stable_during_new_messages()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var f=await Seed(isolated.Context);var at=DateTimeOffset.UtcNow.AddHours(-1);
        for(var i=0;i<6;i++)await f.Service.IngestAsync(new($"evt-{i}","message",Chat,$"in-{i}",OccurredAtUtc:at.AddSeconds(i),Text:$"Mensagem {i}"),default);
        var first=await f.Service.MessagesAsync(f.Conversation.Id,null,3,default);Assert.True(first.HasMore);Assert.Equal(new[]{"Mensagem 3","Mensagem 4","Mensagem 5"},first.Items.Select(x=>x.Text));
        await f.Service.IngestAsync(new("evt-new","message",Chat,"new",Text:"Nova mensagem"),default);
        var second=await f.Service.MessagesAsync(f.Conversation.Id,first.Before,3,default);Assert.False(second.HasMore);Assert.Equal(new[]{"Mensagem 0","Mensagem 1","Mensagem 2"},second.Items.Select(x=>x.Text));Assert.Empty(first.Items.Select(x=>x.Id).Intersect(second.Items.Select(x=>x.Id)));
    }
    [PostgresFact]
    public async Task Settings_conflicts_cancel_and_attachment_audit_preserve_boundaries()
    {
        await using var isolated=await IsolatedBarDatabase.Create(new AuditSaveChangesInterceptor(new NullAuditContext(),TimeProvider.System));var db=isolated.Context;var f=await Seed(db);
        var settings=await f.Service.SaveSettingsAsync(new(0,false,true,false,"18:00"),default);Assert.Equal(1,settings.Version);await Assert.ThrowsAsync<MessagingRuleException>(()=>f.Service.SaveSettingsAsync(new(0,true,true,true,"18:00"),default));
        var attachment=await f.Service.UploadAsync("%PDF-synthetic-sensitive-content"u8.ToArray(),"synthetic.pdf","application/pdf",f.Actor,default);
        var sent=await f.Service.SendAsync(f.Conversation.Id,new(Guid.NewGuid(),"sensitive-message-content",attachment.Id,ScheduledAtUtc:DateTimeOffset.UtcNow.AddHours(1)),f.Actor,default);var cancelled=await f.Service.CancelAsync(sent.Id,new(Guid.NewGuid()),f.Actor,default);Assert.Equal("Cancelled",cancelled.State);
        var logs=await db.AuditLogs.Where(x=>x.Resource.StartsWith("Messaging")).Select(x=>x.MetadataJson).ToListAsync();var audit=string.Join("\n",logs);Assert.DoesNotContain("sensitive-message-content",audit);Assert.DoesNotContain("synthetic-sensitive",audit);Assert.DoesNotContain("5511999990000",audit);
        Assert.Equal("%PDF-synthetic-sensitive-content",System.Text.Encoding.UTF8.GetString((await f.Service.DownloadAsync(attachment.Id,default)).Data));
    }
    [PostgresFact]
    public async Task Worker_reconciles_uncertain_without_duplicate_submission_and_persists_inbound_work()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var f=await Seed(isolated.Context);var input=new SendMessageInput(Guid.NewGuid(),"Envio sintético");var queued=await f.Service.SendAsync(f.Conversation.Id,input,f.Actor,default);
        await f.Service.IngestAsync(new("worker-in","message",Chat,"worker-customer",Text:"Dúvida"),default);
        var bridge=new FakeBridge();var automation=new FakeAutomation();var services=new ServiceCollection();services.AddSingleton<TimeProvider>(TimeProvider.System);services.AddDbContext<LongBeachDbContext>(o=>o.UseNpgsql(isolated.Context.Database.GetConnectionString()));services.AddScoped<IMessaging,MessagingService>();services.AddSingleton<IMessagingBridge>(bridge);services.AddSingleton<IMessagingAutomation>(automation);await using var provider=services.BuildServiceProvider();
        var worker=new MessagingWorker(provider.GetRequiredService<IServiceScopeFactory>(),new ConfigurationBuilder().Build(),TimeProvider.System,NullLogger<MessagingWorker>.Instance);
        await worker.RunOnceAsync(default);await worker.RunOnceAsync(default);
        Assert.Equal(1,bridge.SendCount);Assert.Equal(1,automation.IncomingCount);
        isolated.Context.ChangeTracker.Clear();Assert.Equal("Sent",(await f.Service.OperationAsync(input.OperationId,default)).State);Assert.True((await isolated.Context.Set<MessagingMessage>().SingleAsync(x=>x.ExternalId=="worker-customer")).AutomationProcessed);
    }
    [PostgresFact]
    public async Task Concurrent_operators_cannot_both_assume_and_concurrent_replay_is_one_send()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var f=await Seed(isolated.Context);var actor2=User.Create("Outro atendente sintético","second.staff@example.test","synthetic-only-hash");isolated.Context.Add(actor2);await isolated.Context.SaveChangesAsync();
        var connection=isolated.Context.Database.GetConnectionString();
        async Task<bool> Assume(Guid actor)
        {await using var db=new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(connection).Options,TimeProvider.System);try{await new MessagingService(db,TimeProvider.System).ActionAsync(f.Conversation.Id,"assume",new(Guid.NewGuid(),f.Conversation.Version),actor,default);return true;}catch(MessagingRuleException e)when(e.StatusCode==409){return false;}}
        var outcomes=await Task.WhenAll(Assume(f.Actor),Assume(actor2.Id));Assert.Single(outcomes,x=>x);
        isolated.Context.ChangeTracker.Clear();var current=await f.Service.ConversationAsync(f.Conversation.Id,default);var input=new SendMessageInput(Guid.NewGuid(),"Mesmo envio concorrente");
        async Task<MessageDto> Send()
        {await using var db=new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(connection).Options,TimeProvider.System);return await new MessagingService(db,TimeProvider.System).SendAsync(current.Id,input,current.AssignedUserId!.Value,default);}
        var messages=await Task.WhenAll(Send(),Send());Assert.Equal(messages[0].Id,messages[1].Id);Assert.Equal(1,await isolated.Context.Set<MessagingMessage>().CountAsync());
    }
    [PostgresFact]
    public async Task Rollback_refuses_to_destroy_existing_communication_history()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var f=await Seed(isolated.Context);await f.Service.IngestAsync(new("preserved-event","message",Chat,"preserved-message",Text:"Histórico preservado"),default);
        const string previous = "20261029210216_DigitalMenu";
        var error=await Assert.ThrowsAsync<Npgsql.PostgresException>(()=>isolated.Context.GetService<IMigrator>().MigrateAsync(previous));Assert.Equal("P0001",error.SqlState);
        Assert.Equal(1,await isolated.Context.Set<MessagingMessage>().CountAsync());
    }
    [PostgresFact]
    public async Task New_attendant_can_reuse_sent_attachment_only_in_the_same_conversation()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var db=isolated.Context;var f=await Seed(db);var actor2=User.Create("Colega sintético","colleague.staff@example.test","synthetic-only-hash");db.Add(actor2);await db.SaveChangesAsync();
        var attachment=await f.Service.UploadAsync("%PDF-sensitive-synthetic-invoice"u8.ToArray(),"conta-sintetica.pdf","application/pdf",f.Actor,default);
        var first=await f.Service.SendAsync(f.Conversation.Id,new(Guid.NewGuid(),"Conta",attachment.Id),f.Actor,default);(await db.Set<MessagingMessage>().SingleAsync(x=>x.Id==first.Id)).Transition("Failed");await db.SaveChangesAsync();
        var current=await f.Service.ConversationAsync(f.Conversation.Id,default);current=await f.Service.ActionAsync(current.Id,"complete",new(Guid.NewGuid(),current.Version),f.Actor,default);await f.Service.ActionAsync(current.Id,"assume",new(Guid.NewGuid(),current.Version),actor2.Id,default);
        var retry=await f.Service.SendAsync(current.Id,new(Guid.NewGuid(),"Conta revisada",attachment.Id),actor2.Id,default);Assert.Equal(attachment.Id,retry.Attachment!.Id);
        var otherCustomer=new Customer("Outro contato sintético","11999990001",null,"synthetic");db.Add(otherCustomer);await db.SaveChangesAsync();var other=await f.Service.CreateConversationAsync(new(Guid.NewGuid(),otherCustomer.Id),actor2.Id,default);
        Assert.Equal(404,(await Assert.ThrowsAsync<MessagingRuleException>(()=>f.Service.SendAsync(other.Id,new(Guid.NewGuid(),"Não autorizado",attachment.Id),actor2.Id,default))).StatusCode);
        var loose=await f.Service.UploadAsync("%PDF-unbound"u8.ToArray(),"solto.pdf","application/pdf",f.Actor,default);
        Assert.Equal(404,(await Assert.ThrowsAsync<MessagingRuleException>(()=>f.Service.SendAsync(current.Id,new(Guid.NewGuid(),"Não autorizado",loose.Id),actor2.Id,default))).StatusCode);
    }
    [PostgresFact]
    public async Task Receipt_resolves_new_lid_by_consistent_alias_without_crossing_conversations()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var db=isolated.Context;var f=await Seed(db);var sent=await f.Service.SendAsync(f.Conversation.Id,new(Guid.NewGuid(),"Confirmação sintética"),f.Actor,default);var m=await db.Set<MessagingMessage>().SingleAsync(x=>x.Id==sent.Id);
        const string lid="new-contact@lid";
        await f.Service.IngestAsync(new("receipt-new-lid","receipt",lid,Aliases:[Chat,lid],MessageIds:[m.ExternalId],State:"Delivered"),default);Assert.Equal("Delivered",(await f.Service.OperationAsync(m.OperationId!.Value,default)).State);
        Assert.Equal(f.Conversation.Id,(await db.Set<MessagingAlias>().SingleAsync(x=>x.ExternalId==lid)).ConversationId);
        var other=new MessagingConversation("5511888880000@s.whatsapp.net","5511888880000","Outro contato");var collision=new MessagingMessage(other.Id,"Outbound","Phone","Mesmo ID em outra conversa",DateTimeOffset.UtcNow,"Sent",m.ExternalId);db.AddRange(other,new MessagingAlias(other.Id,other.ExternalId),collision);await db.SaveChangesAsync();
        await f.Service.IngestAsync(new("receipt-conflicting","receipt",lid,Aliases:[Chat,other.ExternalId],MessageIds:[m.ExternalId],State:"Read"),default);
        Assert.Equal("Delivered",(await f.Service.OperationAsync(m.OperationId!.Value,default)).State);Assert.Equal("Sent",collision.State);
        await f.Service.IngestAsync(new("receipt-lid-only","receipt",lid,MessageIds:[m.ExternalId],State:"Read"),default);Assert.Equal("Read",(await f.Service.OperationAsync(m.OperationId!.Value,default)).State);Assert.Equal("Sent",collision.State);
        await f.Service.IngestAsync(new("receipt-before-phone","receipt","future@lid",Aliases:[Chat,"future@lid"],MessageIds:["future-phone-message"],State:"Read"),default);
        var envelope=await db.Set<MessagingBridgeEvent>().SingleAsync(x=>x.EventId=="receipt-before-phone");Assert.Contains(Chat,envelope.Payload);Assert.Contains("future@lid",envelope.Payload);Assert.False(envelope.Processed);
        await f.Service.IngestAsync(new("future-phone-event","message",Chat,"future-phone-message",FromMe:true,Text:"Enviado pelo telefone"),default);Assert.Equal("Read",(await db.Set<MessagingMessage>().SingleAsync(x=>x.ExternalId=="future-phone-message")).State);
    }
    [PostgresFact]
    public async Task Changing_verified_identity_pauses_and_cancels_queued_automated_content()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var db=isolated.Context;var f=await Seed(db);
        var queued=await f.Service.QueueAutomationAsync(f.Conversation.Id,"Agenda privada sintética","Manual",null,null,null,null,Guid.NewGuid(),default);
        var changed=await f.Service.LinkAsync(f.Conversation.Id,new(Guid.NewGuid(),f.Conversation.Version,f.Conversation.CustomerId,true,true),f.Actor,default);
        Assert.Equal("Team",changed.Mode);Assert.Equal("Cancelled",(await f.Service.OperationAsync(queued.OperationId!.Value,default)).State);
        var resumed=await f.Service.ActionAsync(changed.Id,"resume-bot",new(Guid.NewGuid(),changed.Version),f.Actor,default);
        var reply=await f.Service.QueueAutomationAsync(changed.Id,"Resposta sem lembrete","Manual",null,null,null,null,Guid.NewGuid(),default);
        var consentOnly=await f.Service.LinkAsync(changed.Id,new(Guid.NewGuid(),resumed.Version,changed.CustomerId,true,false),f.Actor,default);
        Assert.Equal("Bot",consentOnly.Mode);Assert.Equal("Queued",(await f.Service.OperationAsync(reply.OperationId!.Value,default)).State);
    }
    [PostgresFact]
    public async Task Only_current_assignee_or_database_verified_manager_can_release_or_complete()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var db=isolated.Context;var f=await Seed(db);var colleague=User.Create("Colega sintético","ownership.colleague@example.test","synthetic-hash");var manager=User.Create("Gestor sintético","ownership.manager@example.test","synthetic-hash");var managerRole=await db.Roles.SingleOrDefaultAsync(x=>x.Name=="Manager");if(managerRole is null){managerRole=new Role("Manager");db.Add(managerRole);}manager.SetRole(managerRole);db.AddRange(colleague,manager);await db.SaveChangesAsync();
        var owned=await f.Service.ActionAsync(f.Conversation.Id,"assume",new(Guid.NewGuid(),f.Conversation.Version),f.Actor,default);
        foreach(var action in new[]{"assume","resume-bot","complete"})Assert.Equal(409,(await Assert.ThrowsAsync<MessagingRuleException>(()=>f.Service.ActionAsync(owned.Id,action,new(Guid.NewGuid(),owned.Version),colleague.Id,default))).StatusCode);
        Assert.Equal(409,(await Assert.ThrowsAsync<MessagingRuleException>(()=>f.Service.SendAsync(owned.Id,new(Guid.NewGuid(),"Gestor ainda não assumiu"),manager.Id,default))).StatusCode);
        var takeover=await f.Service.ActionAsync(owned.Id,"assume",new(Guid.NewGuid(),owned.Version),manager.Id,default);Assert.Equal(manager.Id,takeover.AssignedUserId);
        var released=await f.Service.ActionAsync(takeover.Id,"resume-bot",new(Guid.NewGuid(),takeover.Version),manager.Id,default);Assert.Equal("Bot",released.Mode);
        var again=await f.Service.ActionAsync(released.Id,"assume",new(Guid.NewGuid(),released.Version),f.Actor,default);var complete=await f.Service.ActionAsync(again.Id,"complete",new(Guid.NewGuid(),again.Version),manager.Id,default);Assert.Equal("Completed",complete.Status);
    }
    [PostgresFact]
    public async Task Relinking_changes_displayed_and_searchable_name_and_unlink_clears_previous_identity()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var db=isolated.Context;var f=await Seed(db);var corrected=new Customer("Identidade corrigida — sintética","11999990001",null,"synthetic");db.Add(corrected);await db.SaveChangesAsync();
        var changed=await f.Service.LinkAsync(f.Conversation.Id,new(Guid.NewGuid(),f.Conversation.Version,corrected.Id,false,false),f.Actor,default);
        Assert.Equal(corrected.Name,changed.Name);Assert.Equal(corrected.Name,(await db.Set<MessagingConversation>().AsNoTracking().SingleAsync(x=>x.Id==changed.Id)).Name);
        Assert.Equal(changed.Id,Assert.Single((await f.Service.ConversationsAsync("Identidade corrigida",null,null,1,20,default)).Items).Id);
        Assert.Empty((await f.Service.ConversationsAsync(f.Conversation.Name,null,null,1,20,default)).Items);
        // The stop-consent domain operation keeps the chosen display name.
        var entity=await db.Set<MessagingConversation>().SingleAsync(x=>x.Id==changed.Id);entity.Link(entity.CustomerId,entity.IdentityVerified,false);await db.SaveChangesAsync();
        Assert.Equal(corrected.Name,entity.Name);
        var unlinked=await f.Service.LinkAsync(changed.Id,new(Guid.NewGuid(),entity.Version,null,false,false),f.Actor,default);
        Assert.Null(unlinked.CustomerId);Assert.Equal("Não identificado",unlinked.Name);Assert.Equal("Não identificado",(await db.Set<MessagingConversation>().AsNoTracking().SingleAsync(x=>x.Id==unlinked.Id)).Name);
        Assert.Empty((await f.Service.ConversationsAsync("Identidade corrigida",null,null,1,20,default)).Items);
    }
    private sealed class FakeBridge:IMessagingBridge
    {
        public int SendCount;private string? messageId;
        public Task<BridgeStatusDto> StatusAsync(CancellationToken ct)=>Task.FromResult(new BridgeStatusDto("Connected"));
        public Task<BridgeStatusDto> PairAsync(CancellationToken ct)=>StatusAsync(ct);public Task<BridgeStatusDto> ReconnectAsync(CancellationToken ct)=>StatusAsync(ct);
        public Task<BridgeSendResult> SendAsync(BridgeSendRequest input,CancellationToken ct){SendCount++;messageId=input.MessageId;return Task.FromResult(new BridgeSendResult(input.MessageId,"Uncertain"));}
        public Task<BridgeSendResult?> FindAsync(Guid operationId,CancellationToken ct)=>Task.FromResult<BridgeSendResult?>(new(messageId!,"Sent"));
    }
    private sealed class FakeAutomation:IMessagingAutomation
    {public int IncomingCount;public Task TickAsync(CancellationToken ct)=>Task.CompletedTask;public Task OnIncomingAsync(Guid conversationId,Guid messageId,CancellationToken ct){IncomingCount++;return Task.CompletedTask;}public Task<bool> PrepareOutgoingAsync(Guid id,CancellationToken ct)=>Task.FromResult(true);}
}
