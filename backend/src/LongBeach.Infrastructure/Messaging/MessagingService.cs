using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Messaging;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Messaging;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Messaging;

public sealed partial class MessagingService(LongBeachDbContext db, TimeProvider time) : IMessaging
{
    public const long ArenaLockKey = 0x4c424d5347L;
    private static string Hash(object value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value))));
    private async Task<T> Locked<T>(Func<Task<T>> work, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is not null) return await work();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({ArenaLockKey})",ct);
        var result = await work(); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return result;
    }
    private async Task<MessagingConversation> Required(Guid id, CancellationToken ct) =>
        await db.Set<MessagingConversation>().SingleOrDefaultAsync(x=>x.Id==id,ct) ?? throw new MessagingRuleException("Conversa não encontrada.",404);
    private async Task<bool> Supervisor(Guid actor,CancellationToken ct)
    {
        var roles=await db.Users.AsNoTracking().Where(x=>x.Id==actor&&x.IsActive&&!x.RequiresFirstAccess).SelectMany(x=>x.UserRoles).Select(x=>x.Role.Name).ToArrayAsync(ct);
        return roles.Length==1&&roles[0]==LongBeach.Domain.Identity.SystemRoles.Manager;
    }
    private async Task<MessagingOperation?> Prior(Guid operationId, string hash, CancellationToken ct)
    {
        if (operationId==Guid.Empty) throw new MessagingRuleException("Informe o identificador da operação.");
        var previous=await db.Set<MessagingOperation>().SingleOrDefaultAsync(x=>x.Id==operationId,ct);
        if(previous is not null && previous.Fingerprint!=hash) throw new MessagingRuleException("Esta operação já foi usada para outro envio. Confira a solicitação original.",409);
        return previous;
    }
    private static AttachmentDto Attachment(Guid id,string name,string contentType,long length) => new(id,name,contentType,length,$"/api/v1/messaging/attachments/{id}");
    private async Task<ConversationDto> Dto(MessagingConversation c, CancellationToken ct)
    {
        var user = c.AssignedUserId is null ? null : await db.Users.AsNoTracking().Where(u=>u.Id==c.AssignedUserId).Select(u=>u.Name).SingleOrDefaultAsync(ct);
        return new(c.Id,c.ExternalId,c.Phone,c.Name,c.CustomerId,c.IdentityVerified,c.ConsentForReminders,c.Status,c.Mode,c.AssignedUserId,user,c.UnreadCount,c.LastMessage,c.LastMessageAtUtc,c.Version);
    }
    private async Task<MessageDto> Dto(MessagingMessage m, CancellationToken ct)
    {
        AttachmentDto? a=null;
        if(m.AttachmentId is Guid id) { var item=await db.Set<MessagingAttachment>().AsNoTracking().Where(x=>x.Id==id).Select(x=>new{x.Id,x.FileName,x.ContentType,Length=x.Data.Length}).SingleOrDefaultAsync(ct); if(item is not null)a=Attachment(item.Id,item.FileName,item.ContentType,item.Length); }
        var c=await db.Set<MessagingConversation>().AsNoTracking().Where(x=>x.Id==m.ConversationId).Select(x=>new{x.Name,x.Phone}).SingleAsync(ct);
        return MessageDto(m,a,c.Name,c.Phone);
    }
    private static MessageDto MessageDto(MessagingMessage m,AttachmentDto? attachment,string? name,string? phone)=>new(m.Id,m.ConversationId,m.Direction,m.Origin,m.Text,m.OccurredAtUtc,m.State,m.AuthorName,attachment,m.OperationId,m.Purpose,m.ScheduledAtUtc,m.FailureReason,m.ContextKind,m.ContextId,m.ContextDate,name,phone);
    private async Task<IReadOnlyList<MessageDto>> Dtos(IReadOnlyList<MessagingMessage> messages,CancellationToken ct)
    {
        var attachmentIds=messages.Where(x=>x.AttachmentId!=null).Select(x=>x.AttachmentId!.Value).Distinct().ToArray();
        var files=await db.Set<MessagingAttachment>().AsNoTracking().Where(x=>attachmentIds.Contains(x.Id)).Select(x=>new{x.Id,x.FileName,x.ContentType,Length=x.Data.Length}).ToListAsync(ct);
        var attachments=files.ToDictionary(x=>x.Id,x=>Attachment(x.Id,x.FileName,x.ContentType,x.Length));
        var conversationIds=messages.Select(x=>x.ConversationId).Distinct().ToArray();var conversations=await db.Set<MessagingConversation>().AsNoTracking().Where(x=>conversationIds.Contains(x.Id)).Select(x=>new{x.Id,x.Name,x.Phone}).ToDictionaryAsync(x=>x.Id,ct);
        return messages.Select(m=>MessageDto(m,m.AttachmentId is Guid attachment?attachments.GetValueOrDefault(attachment):null,conversations[m.ConversationId].Name,conversations[m.ConversationId].Phone)).ToArray();
    }
    public async Task<MessagingPage<ConversationDto>> ConversationsAsync(string? search,string? status,string? mode,int page,int pageSize,CancellationToken ct)
    {
        page=Math.Clamp(page,1,100000);pageSize=Math.Clamp(pageSize,1,100);
        var q=db.Set<MessagingConversation>().AsNoTracking();
        if(!string.IsNullOrWhiteSpace(search)){var term=search.Trim().ToLowerInvariant();q=q.Where(x=>x.Name.ToLower().Contains(term)||x.Phone!=null&&x.Phone.Contains(term));}
        if(!string.IsNullOrWhiteSpace(status))q=q.Where(x=>x.Status==status);
        if(!string.IsNullOrWhiteSpace(mode))q=q.Where(x=>x.Mode==mode);
        var total=await q.CountAsync(ct);var rows=await q.OrderByDescending(x=>x.LastMessageAtUtc).ThenBy(x=>x.Id).Skip((page-1)*pageSize).Take(pageSize).ToListAsync(ct);
        var items=new List<ConversationDto>();foreach(var row in rows)items.Add(await Dto(row,ct));return new(items,page,pageSize,total);
    }
    public async Task<ConversationDto> ConversationAsync(Guid id,CancellationToken ct)=>await Dto(await Required(id,ct),ct);
    public Task<ConversationDto> CreateConversationAsync(CreateConversationInput input,Guid actor,CancellationToken ct)=>Locked(async()=>
    {
        var hash=Hash(new{action="create",input,actor});var prior=await Prior(input.OperationId,hash,ct);if(prior is not null)return await ConversationAsync(prior.ResourceId,ct);
        var customer=await db.Set<Customer>().AsNoTracking().SingleOrDefaultAsync(x=>x.Id==input.CustomerId&&x.MergedIntoId==null&&x.Status=="Ativo",ct)??throw new MessagingRuleException("Selecione um cliente ativo cadastrado.");
        if(customer.Incomplete||!Customer.ValidPhone(customer.Phone))throw new MessagingRuleException("Complete o telefone do cliente antes de abrir a conversa.");
        var phone=MessagingRules.Phone(customer.Phone);var external=phone+"@s.whatsapp.net";
        var c=await db.Set<MessagingConversation>().SingleOrDefaultAsync(x=>x.ExternalId==external||x.Phone==phone,ct);
        if(c is null){c=new(external,phone,customer.Name,customer.Id);db.Add(c);db.Add(new MessagingAlias(c.Id,external));}
        db.Add(new MessagingOperation(input.OperationId,hash,c.Id));await db.SaveChangesAsync(ct);return await Dto(c,ct);
    },ct);
    public Task<ConversationDto> ActionAsync(Guid id,string action,ConversationActionInput input,Guid actor,CancellationToken ct)=>Locked(async()=>
    {
        var hash=Hash(new{id,action,input,actor});var prior=await Prior(input.OperationId,hash,ct);var c=await Required(id,ct);if(prior is not null)return await Dto(c,ct);
        MessagingRules.Version(c.Version,input.ExpectedVersion);c.Act(action,actor,await Supervisor(actor,ct));db.Add(new MessagingOperation(input.OperationId,hash,id));return await Dto(c,ct);
    },ct);
    public Task<ConversationDto> LinkAsync(Guid id,ContactLinkInput input,Guid actor,CancellationToken ct)=>Locked(async()=>
    {
        var hash=Hash(new{action="link",id,input,actor});var prior=await Prior(input.OperationId,hash,ct);var c=await Required(id,ct);if(prior is not null)return await Dto(c,ct);
        MessagingRules.Version(c.Version,input.ExpectedVersion);
        Customer? customer=null;if(input.CustomerId is Guid customerId){customer=await db.Set<Customer>().AsNoTracking().SingleOrDefaultAsync(x=>x.Id==customerId&&x.MergedIntoId==null&&x.Status=="Ativo",ct)??throw new MessagingRuleException("Selecione um cliente ativo.");}
        var identityChanged=c.CustomerId!=input.CustomerId||c.IdentityVerified!=input.IdentityVerified;
        c.Link(input.CustomerId,input.IdentityVerified,input.ConsentForReminders,customer?.Name??"Não identificado");
        if(identityChanged)
        {
            c.Pause();
            foreach(var pending in await db.Set<MessagingMessage>().Where(x=>x.ConversationId==id&&x.Direction=="Outbound"&&x.Origin=="Bot"&&(x.State=="Queued"||x.State=="Scheduled")).ToListAsync(ct))
                pending.Suppress("O vínculo ou a confirmação de identidade mudou. A equipe precisa conferir este atendimento.");
        }
        db.Add(new MessagingOperation(input.OperationId,hash,id));return await Dto(c,ct);
    },ct);
    public async Task<MessagePage> MessagesAsync(Guid id,string? before,int limit,CancellationToken ct)
    {
        await Required(id,ct);limit=Math.Clamp(limit,1,100);var q=db.Set<MessagingMessage>().AsNoTracking().Where(x=>x.ConversationId==id);
        if(!string.IsNullOrWhiteSpace(before))
        {
            try{var parts=Encoding.UTF8.GetString(Convert.FromBase64String(before)).Split('|');var at=new DateTimeOffset(long.Parse(parts[0],CultureInfo.InvariantCulture),TimeSpan.Zero);var key=Guid.Parse(parts[1]);q=q.Where(x=>x.OccurredAtUtc<at||x.OccurredAtUtc==at&&x.Id.CompareTo(key)<0);}
            catch(Exception e)when(e is FormatException or ArgumentException or IndexOutOfRangeException or OverflowException){throw new MessagingRuleException("Página do histórico inválida.");}
        }
        var rows=await q.OrderByDescending(x=>x.OccurredAtUtc).ThenByDescending(x=>x.Id).Take(limit+1).ToListAsync(ct);var more=rows.Count>limit;rows=rows.Take(limit).ToList();var last=rows.LastOrDefault();
        var cursor=more&&last is not null?Convert.ToBase64String(Encoding.UTF8.GetBytes($"{last.OccurredAtUtc.UtcTicks}|{last.Id}")):null;
        return new(await Dtos(rows.AsEnumerable().Reverse().ToArray(),ct),cursor,more);
    }
    public Task<MessageDto> SendAsync(Guid id,SendMessageInput input,Guid actor,CancellationToken ct)=>Queue(id,input,actor,false,ct);
    public Task<MessageDto> QueueAutomationAsync(Guid conversationId,string text,string purpose,string? contextKind,Guid? contextId,DateOnly? contextDate,DateTimeOffset? scheduledAtUtc,Guid operationId,CancellationToken ct)=>Queue(conversationId,new(operationId,text,null,purpose,contextKind,contextId,contextDate,scheduledAtUtc),null,true,ct);
    private Task<MessageDto> Queue(Guid id,SendMessageInput input,Guid? actor,bool automation,CancellationToken ct)=>Locked(async()=>
    {
        if(input.OperationId==Guid.Empty)throw new MessagingRuleException("Informe o identificador do envio.");
        var fingerprint=automation?Hash(new{id,input.OperationId,input.Purpose,input.ContextKind,input.ContextId,input.ContextDate,automation}):Hash(new{id,input,actor,automation});
        var previous=await db.Set<MessagingMessage>().SingleOrDefaultAsync(x=>x.OperationId==input.OperationId,ct);
        if(previous is not null){if(previous.Fingerprint!=fingerprint)throw new MessagingRuleException("Este identificador já pertence a outro envio.",409);return await Dto(previous,ct);}
        var c=await Required(id,ct);var text=MessagingRules.Text(input.Text,16000,"Mensagem",input.AttachmentId is not null);
        if(input.Purpose is not("Manual" or "ClassReminder" or "RentalReminder" or "BarStatement")&&!(automation&&input.Purpose is "Handoff" or "ConfirmationRequest"))throw new MessagingRuleException("Finalidade da mensagem inválida.");
        if(input.ContextKind?.Length>40)throw new MessagingRuleException("Contexto inválido.");
        if(input.ScheduledAtUtc is not null&&(input.ScheduledAtUtc<=time.GetUtcNow()||input.ScheduledAtUtc>time.GetUtcNow().AddYears(1)))throw new MessagingRuleException("Escolha uma data futura, de até um ano.");
        if(input.AttachmentId is Guid attachment)
        {
            var inConversation=await db.Set<MessagingMessage>().AnyAsync(x=>x.ConversationId==id&&x.Direction=="Outbound"&&x.AttachmentId==attachment,ct);
            if(!await db.Set<MessagingAttachment>().AnyAsync(x=>x.Id==attachment&&(x.UploadedBy==actor||automation||inConversation),ct))throw new MessagingRuleException("O anexo não está disponível para este envio.",404);
        }
        if(automation && c.Mode!="Bot"&&input.Purpose!="Handoff")throw new MessagingRuleException("A equipe está atendendo esta conversa.",409);
        if(!automation)
        {
            if(c.AssignedUserId is not null&&c.AssignedUserId!=actor&&c.Status=="InProgress")throw new MessagingRuleException("Outro atendente assumiu esta conversa.",409);
            c.Pause(actor);
        }
        var message=new MessagingMessage(id,"Outbound",automation?"Bot":"Staff",text,time.GetUtcNow(),input.ScheduledAtUtc is null?"Queued":"Scheduled",Guid.NewGuid().ToString("N"),input.OperationId)
        {Fingerprint=fingerprint,AuthorUserId=actor,AttachmentId=input.AttachmentId,Purpose=input.Purpose,ContextKind=input.ContextKind,ContextId=input.ContextId,ContextDate=input.ContextDate,ScheduledAtUtc=input.ScheduledAtUtc?.ToUniversalTime(),AutomationProcessed=true};
        if(actor is Guid user)message.AuthorName=await db.Users.Where(x=>x.Id==user).Select(x=>x.Name).SingleOrDefaultAsync(ct);
        db.Add(message);await db.SaveChangesAsync(ct);return await Dto(message,ct);
    },ct);
    public async Task<MessageDto> OperationAsync(Guid operationId,CancellationToken ct)=>await Dto(await db.Set<MessagingMessage>().AsNoTracking().SingleOrDefaultAsync(x=>x.OperationId==operationId,ct)??throw new MessagingRuleException("O envio ainda não foi registrado. Confira a mesma solicitação.",404),ct);
    public Task<MessageDto> CancelAsync(Guid id,CancelMessageInput input,Guid actor,CancellationToken ct)=>Locked(async()=>
    {
        var hash=Hash(new{action="cancel",id,input,actor});var prior=await Prior(input.OperationId,hash,ct);var m=await db.Set<MessagingMessage>().SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new MessagingRuleException("Envio não encontrado.",404);
        if(prior is null){if(m.State is not("Queued" or "Scheduled"))throw new MessagingRuleException("O envio já começou. Confira o resultado antes de agir.",409);m.Suppress("Cancelado pela equipe.");db.Add(new MessagingOperation(input.OperationId,hash,id));}return await Dto(m,ct);
    },ct);
    public async Task<MessagingPage<MessageDto>> SendsAsync(string? state,int page,int pageSize,CancellationToken ct)
    {
        page=Math.Clamp(page,1,100000);pageSize=Math.Clamp(pageSize,1,100);var q=db.Set<MessagingMessage>().AsNoTracking().Where(x=>x.Direction=="Outbound");if(!string.IsNullOrWhiteSpace(state))q=q.Where(x=>x.State==state);
        var total=await q.CountAsync(ct);var rows=await q.OrderByDescending(x=>x.ScheduledAtUtc??x.OccurredAtUtc).ThenBy(x=>x.Id).Skip((page-1)*pageSize).Take(pageSize).ToListAsync(ct);return new(await Dtos(rows,ct),page,pageSize,total);
    }
    public async Task<AttachmentDto> UploadAsync(byte[] data,string fileName,string contentType,Guid actor,CancellationToken ct)
    {
        var type=MessagingRules.AttachmentType(data,contentType,false);var name=MessagingRules.Text(Path.GetFileName(fileName),240,"Nome do arquivo");var a=new MessagingAttachment(data,name,type,actor);db.Add(a);await db.SaveChangesAsync(ct);return Attachment(a.Id,a.FileName,a.ContentType,a.Data.Length);
    }
    public async Task<AttachmentDownload> DownloadAsync(Guid id,CancellationToken ct)
    {var a=await db.Set<MessagingAttachment>().AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new MessagingRuleException("Anexo não encontrado.",404);return new(a.Data,a.ContentType,a.FileName);}
    public async Task<MessagingSettingsDto> SettingsAsync(CancellationToken ct)
    {var s=await db.Set<MessagingSettings>().AsNoTracking().SingleOrDefaultAsync(x=>x.Id==MessagingSettings.SingletonId,ct);return s is null?new(false,false,false,"18:00",0):new(s.BotEnabled,s.ClassRemindersEnabled,s.RentalRemindersEnabled,s.ReminderTime,s.Version);}
    public Task<MessagingSettingsDto> SaveSettingsAsync(SaveMessagingSettingsInput input,CancellationToken ct)=>Locked(async()=>
    {
        if(!TimeOnly.TryParseExact(input.ReminderTime,"HH:mm",CultureInfo.InvariantCulture,DateTimeStyles.None,out _))throw new MessagingRuleException("Informe o horário no formato HH:mm.");
        var s=await db.Set<MessagingSettings>().SingleOrDefaultAsync(x=>x.Id==MessagingSettings.SingletonId,ct);MessagingRules.Version(s?.Version??0,input.ExpectedVersion);
        if(s is null){s=new();db.Add(s);}else s.Version++;
        s.BotEnabled=input.BotEnabled;s.ClassRemindersEnabled=input.ClassRemindersEnabled;s.RentalRemindersEnabled=input.RentalRemindersEnabled;s.ReminderTime=input.ReminderTime;return new MessagingSettingsDto(s.BotEnabled,s.ClassRemindersEnabled,s.RentalRemindersEnabled,s.ReminderTime,s.Version);
    },ct);
    public async Task<IReadOnlyList<FaqDto>> FaqsAsync(CancellationToken ct)=>await db.Set<MessagingFaq>().AsNoTracking().OrderBy(x=>x.Question).Select(x=>new FaqDto(x.Id,x.Question,x.Answer,x.Approved,x.Version)).ToListAsync(ct);
    public Task<FaqDto> SaveFaqAsync(Guid? id,SaveFaqInput input,CancellationToken ct)=>Locked(async()=>
    {
        var f=id is null?new MessagingFaq():await db.Set<MessagingFaq>().SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new MessagingRuleException("Resposta não encontrada.",404);
        MessagingRules.Version(id is null?0:f.Version,input.ExpectedVersion);if(id is null)db.Add(f);else f.Version++;
        f.Question=MessagingRules.Text(input.Question,500,"Pergunta");f.Answer=MessagingRules.Text(input.Answer,4000,"Resposta");f.Approved=input.Approved;return new FaqDto(f.Id,f.Question,f.Answer,f.Approved,f.Version);
    },ct);
    public async Task DeleteFaqAsync(Guid id,int expectedVersion,CancellationToken ct)=>await Locked(async()=>{var f=await db.Set<MessagingFaq>().SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new MessagingRuleException("Resposta não encontrada.",404);MessagingRules.Version(f.Version,expectedVersion);db.Remove(f);return true;},ct);
}
