using System.Text.Json;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Messaging;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Messaging;

public sealed partial class MessagingService
{
    public async Task IngestAsync(BridgeEvent input,CancellationToken ct)=>await Locked(async()=>
    {
        var eventId=MessagingRules.Text(input.EventId,240,"Evento");
        if(await db.Set<MessagingBridgeEvent>().AnyAsync(x=>x.EventId==eventId,ct))return true;
        if(input.Type is not("message" or "receipt" or "connection"))throw new MessagingRuleException("Tipo de evento inválido.");
        // Media is stored once, privately, never duplicated in the durable event envelope.
        var envelope=new MessagingBridgeEvent(eventId,input.Type,input.Type=="receipt"?JsonSerializer.Serialize(input with {Media=null,Text=null,SenderPhone=null,Aliases=ReceiptAliases(input)}):"{}");db.Add(envelope);
        if(input.Type=="connection"){envelope.Processed=true;return true;}
        // The arena inbox is strictly one-to-one. Groups, status and broadcast feeds are not imported.
        if(input.ChatId is null||!(input.ChatId.EndsWith("@s.whatsapp.net",StringComparison.Ordinal)||input.ChatId.EndsWith("@lid",StringComparison.Ordinal)))
        {envelope.Processed=true;return true;}
        if(input.Type=="receipt")
        {
            var ids=(input.MessageIds??(input.MessageId is null?[]:[input.MessageId])).Distinct().Take(1000).ToArray();
            var receiptConversation=await ResolveReceiptConversation(input,ct);
            var messages=receiptConversation is null?[]:await db.Set<MessagingMessage>().Where(x=>x.ConversationId==receiptConversation&&ids.Contains(x.ExternalId)&&x.Direction=="Outbound").ToListAsync(ct);
            foreach(var receiptMessage in messages)ApplyReceipt(receiptMessage,input.State);
            envelope.Processed=messages.Count==ids.Length;return true;
        }
        var chat=MessagingRules.Text(input.ChatId,200,"Conversa");var external=MessagingRules.Text(input.MessageId,200,"Mensagem");
        var aliases=(input.Aliases??[]).Append(chat).Where(x=>!string.IsNullOrWhiteSpace(x)&&x.Length<=200).Distinct().Take(10).ToArray();
        var alias=await db.Set<MessagingAlias>().Where(x=>aliases.Contains(x.ExternalId)).OrderByDescending(x=>x.ExternalId==chat).FirstOrDefaultAsync(ct);
        var c=alias is not null?await Required(alias.ConversationId,ct):await db.Set<MessagingConversation>().SingleOrDefaultAsync(x=>x.ExternalId==chat,ct);
        string? phone=null;
        try {if(!string.IsNullOrWhiteSpace(input.SenderPhone))phone=MessagingRules.Phone(input.SenderPhone);else if(chat.EndsWith("@s.whatsapp.net",StringComparison.Ordinal))phone=MessagingRules.Phone(chat.Split('@')[0]);}catch(MessagingRuleException){/* LID-only and group contacts stay unlinked. */}
        if(c is null&&phone is not null)c=await db.Set<MessagingConversation>().FirstOrDefaultAsync(x=>x.Phone==phone,ct);
        if(c is null){c=new MessagingConversation(chat,phone,phone??"Contato do WhatsApp");db.Add(c);await db.SaveChangesAsync(ct);}
        foreach(var candidate in aliases)
            if(!await db.Set<MessagingAlias>().AnyAsync(x=>x.ExternalId==candidate,ct))db.Add(new MessagingAlias(c.Id,candidate));
        var previous=await db.Set<MessagingMessage>().SingleOrDefaultAsync(x=>x.ConversationId==c.Id&&x.ExternalId==external,ct);
        if(previous is not null)
        {
            if(input.FromMe&&previous.Direction=="Outbound") {previous.Transition("Sent");c.Observe(previous.Text,input.OccurredAtUtc??time.GetUtcNow(),false,input.IsHistory);}
            envelope.Processed=true;return true;
        }
        var text=MessagingRules.Text(input.Text,16000,"Mensagem",true);
        var message=new MessagingMessage(c.Id,input.FromMe?"Outbound":"Inbound",input.FromMe?"Phone":"Customer",text,input.OccurredAtUtc??time.GetUtcNow(),input.FromMe?"Sent":"Received",external)
        {IsHistory=input.IsHistory,AutomationProcessed=input.FromMe||input.IsHistory||chat.EndsWith("@g.us",StringComparison.Ordinal),AuthorName=input.FromMe?"WhatsApp da arena":null};
        if(input.Media is not null)
        {
            try
            {
                if(input.Media.DataBase64 is null||input.Media.DataBase64.Length>14_000_000)throw new MessagingRuleException("Anexo indisponível.");
                var data=Convert.FromBase64String(input.Media.DataBase64);var mime=MessagingRules.AttachmentType(data,input.Media.ContentType,true);
                var fileName=MessagingRules.Text(Path.GetFileName(input.Media.FileName??"anexo"),240,"Nome do anexo");var attachment=new MessagingAttachment(data,fileName,mime,null);db.Add(attachment);message.AttachmentId=attachment.Id;
            }
            catch(Exception e)when(e is MessagingRuleException or FormatException){message.Text=(text.Length>15500?text[..15500]:text)+"\n[Anexo não disponível: abra no WhatsApp da arena.]";message.AutomationProcessed=true;c.Pause();}
        }
        if(!input.IsHistory&&(input.FromMe||chat.EndsWith("@g.us",StringComparison.Ordinal)))c.Pause();
        c.Observe(string.IsNullOrEmpty(message.Text)&&message.AttachmentId is not null?"Anexo":message.Text,message.OccurredAtUtc,!input.FromMe,input.IsHistory);
        db.Add(message);
        // A receipt can precede the phone's message event. Keep it until its message exists.
        if(input.FromMe)
        {
            foreach(var pending in await db.Set<MessagingBridgeEvent>().Where(x=>x.Type=="receipt"&&!x.Processed).OrderBy(x=>x.CreatedAtUtc).Take(500).ToListAsync(ct))
            {
                var receipt=JsonSerializer.Deserialize<BridgeEvent>(pending.Payload);if(receipt is null)continue;
                var ids=receipt.MessageIds??(receipt.MessageId is null?[]:[receipt.MessageId]);
                if(ids.Contains(external)&&await ResolveReceiptConversation(receipt,ct)==c.Id){ApplyReceipt(message,receipt.State);if(ids.Length==1)pending.Processed=true;}
            }
        }
        envelope.Processed=true;return true;
    },ct);
    private static string[] ReceiptAliases(BridgeEvent input)=>(input.Aliases??[]).Prepend(input.ChatId??"")
        .Where(x=>!string.IsNullOrWhiteSpace(x)&&x.Length<=200&&(x.EndsWith("@s.whatsapp.net",StringComparison.Ordinal)||x.EndsWith("@lid",StringComparison.Ordinal))).Distinct().Take(10).ToArray();
    private async Task<Guid?> ResolveReceiptConversation(BridgeEvent input,CancellationToken ct)
    {
        var aliases=ReceiptAliases(input);
        var ids=await db.Set<MessagingAlias>().Where(x=>aliases.Contains(x.ExternalId)).Select(x=>x.ConversationId).ToListAsync(ct);
        ids.AddRange(await db.Set<MessagingConversation>().Where(x=>aliases.Contains(x.ExternalId)).Select(x=>x.Id).ToListAsync(ct));
        ids.AddRange(db.Set<MessagingAlias>().Local.Where(x=>aliases.Contains(x.ExternalId)).Select(x=>x.ConversationId));
        var candidates=ids.Distinct().ToArray();
        // Conflicting transport aliases never combine conversations or acknowledge another person's message.
        if(candidates.Length!=1)return null;
        foreach(var alias in aliases)
            if(!db.Set<MessagingAlias>().Local.Any(x=>x.ExternalId==alias)&&!await db.Set<MessagingAlias>().AnyAsync(x=>x.ExternalId==alias,ct))db.Add(new MessagingAlias(candidates[0],alias));
        return candidates[0];
    }
    private static void ApplyReceipt(MessagingMessage message,string? state)
    {
        if(state is "Sent" or "Delivered" or "Read")message.Transition(state);
        else if(state=="Failed"&&MessagingRules.ReceiptRank(message.State)==0)message.Transition("Failed","O WhatsApp não confirmou a entrega. Confira o atendimento antes de enviar novamente.");
    }
}
