using LongBeach.Domain.Common;

namespace LongBeach.Domain.Messaging;

public sealed class MessagingRuleException(string message, int statusCode = 400) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public static class MessagingRules
{
    public const int MaxAttachmentBytes = 10 * 1024 * 1024;
    public static string Text(string? value, int max, string label, bool allowEmpty = false)
    {
        var text = value?.Trim() ?? "";
        if ((!allowEmpty && text.Length == 0) || text.Length > max || text.Any(c => char.IsControl(c) && c is not '\n' and not '\r' and not '\t'))
            throw new MessagingRuleException($"{label}: confira o conteúdo (máximo {max} caracteres).");
        return text;
    }
    public static void Version(int actual, int expected)
    {
        if (actual != expected) throw new MessagingRuleException("Este atendimento mudou. Atualize antes de continuar.", 409);
    }
    public static string Phone(string value)
    {
        var phone = new string(value.Where(char.IsAsciiDigit).ToArray());
        if (phone.Length is 10 or 11) phone = "55" + phone;
        if (phone.Length is < 10 or > 15) throw new MessagingRuleException("Confira o telefone do cliente com DDD.");
        return phone;
    }
    public static int ReceiptRank(string state) => state switch { "Sent" => 1, "Delivered" => 2, "Read" => 3, _ => 0 };
    public static string AttachmentType(byte[] data, string contentType, bool inbound)
    {
        if (data.Length is 0 or > MaxAttachmentBytes) throw new MessagingRuleException("O anexo deve ter até 10 MB.");
        var type = contentType.Split(';')[0].Trim().ToLowerInvariant();
        bool valid = type switch
        {
            "image/png" => data.AsSpan().StartsWith(new byte[] {137,80,78,71,13,10,26,10}),
            "image/jpeg" => data.AsSpan().StartsWith(new byte[] {255,216,255}),
            "application/pdf" => data.AsSpan().StartsWith("%PDF-"u8),
            "audio/ogg" when inbound => data.AsSpan().StartsWith("OggS"u8),
            "audio/mpeg" when inbound => data.AsSpan().StartsWith("ID3"u8) || data.Length >= 2 && data[0] == 255 && (data[1] & 224) == 224,
            "audio/mp4" when inbound => data.Length >= 12 && data.AsSpan(4,4).SequenceEqual("ftyp"u8),
            _ => false
        };
        if (!valid) throw new MessagingRuleException(inbound ? "Tipo ou conteúdo do anexo recebido não suportado." : "Envie uma imagem PNG/JPEG ou um PDF válido, de até 10 MB.");
        return type;
    }
}

public sealed class MessagingConversation : Entity
{
    private MessagingConversation() { }
    public MessagingConversation(string externalId, string? phone, string name, Guid? customerId = null) : base(Guid.NewGuid())
    { ExternalId = externalId; Phone = phone; Name = name; CustomerId = customerId; }
    public string ExternalId { get; private set; } = "";
    public string? Phone { get; private set; }
    public string Name { get; private set; } = "";
    public Guid? CustomerId { get; private set; }
    public bool IdentityVerified { get; private set; }
    public bool ConsentForReminders { get; private set; }
    public string Status { get; private set; } = "NeedsTeam";
    public string Mode { get; private set; } = "Bot";
    public Guid? AssignedUserId { get; private set; }
    public int UnreadCount { get; private set; }
    public string? LastMessage { get; private set; }
    public DateTimeOffset? LastMessageAtUtc { get; private set; }
    public int Version { get; private set; } = 1;
    public void Link(Guid? customerId, bool verified, bool consent, string? name = null)
    {
        if (verified && customerId is null || consent && !verified) throw new MessagingRuleException("Vincule e confirme o cliente antes de permitir lembretes.");
        CustomerId = customerId; IdentityVerified = verified; ConsentForReminders = consent; if(name is not null)Name=MessagingRules.Text(name,240,"Nome");Version++;
    }
    public void Act(string action, Guid actor, bool supervisor = false)
    {
        if (action is "assume" or "resume-bot" or "complete" && Status == "InProgress" && AssignedUserId is not null && AssignedUserId != actor && !supervisor)
            throw new MessagingRuleException("Outro atendente assumiu esta conversa. Atualize o atendimento.",409);
        switch (action)
        {
            case "assume":
                Mode = "Team"; Status = "InProgress"; AssignedUserId = actor; break;
            case "resume-bot": Mode = "Bot"; AssignedUserId = null; Status = "NeedsTeam"; break;
            case "complete": Status = "Completed"; break;
            case "read": UnreadCount = 0; break;
            default: throw new MessagingRuleException("Ação de atendimento inválida.");
        }
        Version++;
    }
    public void Pause(Guid? actor = null)
    {
        Mode = "Team"; Status = actor is null ? "NeedsTeam" : "InProgress";
        if (actor is not null) AssignedUserId = actor;
        Version++;
    }
    public void Observe(string text, DateTimeOffset at, bool incoming, bool history)
    {
        at = at.ToUniversalTime();
        if (LastMessageAtUtc is null || at >= LastMessageAtUtc) { LastMessage = text.Length > 240 ? text[..240] : text; LastMessageAtUtc = at; }
        if (incoming && !history) { UnreadCount++; if (Status == "Completed") { Status = "NeedsTeam"; AssignedUserId = null; } }
        Version++;
    }
}

public sealed class MessagingMessage : Entity
{
    private MessagingMessage() { }
    public MessagingMessage(Guid conversationId, string direction, string origin, string text, DateTimeOffset at,
        string state, string externalId, Guid? operationId = null) : base(Guid.NewGuid())
    { ConversationId = conversationId; Direction = direction; Origin = origin; Text = text; OccurredAtUtc = at.ToUniversalTime(); State = state; ExternalId = externalId; OperationId = operationId; }
    public Guid ConversationId { get; private set; }
    public string Direction { get; private set; } = "";
    public string Origin { get; private set; } = "";
    public string Text { get; set; } = "";
    public DateTimeOffset OccurredAtUtc { get; private set; }
    public string State { get; private set; } = "";
    public string ExternalId { get; private set; } = "";
    public Guid? OperationId { get; private set; }
    public string? Fingerprint { get; set; }
    public Guid? AuthorUserId { get; set; }
    public string? AuthorName { get; set; }
    public Guid? AttachmentId { get; set; }
    public string Purpose { get; set; } = "Manual";
    public string? ContextKind { get; set; }
    public Guid? ContextId { get; set; }
    public DateOnly? ContextDate { get; set; }
    public DateTimeOffset? ScheduledAtUtc { get; set; }
    public string? FailureReason { get; private set; }
    public bool IsHistory { get; set; }
    public bool AutomationProcessed { get; set; }
    public int Version { get; private set; } = 1;
    public DateTimeOffset? AttemptedAtUtc { get; set; }
    public void Transition(string state, string? reason = null)
    {
        if (state is not ("Received" or "Scheduled" or "Queued" or "Sending" or "Sent" or "Delivered" or "Read" or "Failed" or "Uncertain" or "Cancelled")) throw new MessagingRuleException("Estado de mensagem inválido.");
        if (State == "Cancelled" || MessagingRules.ReceiptRank(State) > 0 && MessagingRules.ReceiptRank(state) < MessagingRules.ReceiptRank(State)) return;
        if (State == state && FailureReason == reason) return;
        State = state; FailureReason = reason; Version++;
    }
    public void Suppress(string reason) => Transition("Cancelled", reason);
}

public sealed class MessagingAttachment : Entity
{
    private MessagingAttachment() { }
    public MessagingAttachment(byte[] data, string fileName, string contentType, Guid? uploadedBy) : base(Guid.NewGuid())
    { Data = data; FileName = fileName; ContentType = contentType; UploadedBy = uploadedBy; }
    public byte[] Data { get; private set; } = [];
    public string FileName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public Guid? UploadedBy { get; private set; }
}
public sealed class MessagingAlias : Entity
{
    private MessagingAlias() { }
    public MessagingAlias(Guid conversationId, string externalId) : base(Guid.NewGuid()) { ConversationId = conversationId; ExternalId = externalId; }
    public Guid ConversationId { get; private set; }
    public string ExternalId { get; private set; } = "";
}
public sealed class MessagingBridgeEvent : Entity
{
    private MessagingBridgeEvent() { }
    public MessagingBridgeEvent(string eventId, string type, string payload) : base(Guid.NewGuid()) { EventId = eventId; Type = type; Payload = payload; }
    public string EventId { get; private set; } = "";
    public string Type { get; private set; } = "";
    public string Payload { get; private set; } = "{}";
    public bool Processed { get; set; }
}
public sealed class MessagingOperation : Entity
{
    private MessagingOperation() { }
    public MessagingOperation(Guid id, string fingerprint, Guid resourceId) : base(id) { Fingerprint = fingerprint; ResourceId = resourceId; }
    public string Fingerprint { get; private set; } = "";
    public Guid ResourceId { get; private set; }
}
public sealed class MessagingSettings : Entity
{
    public static readonly Guid SingletonId = Guid.Parse("00000000-0000-0000-0000-000000000031");
    public MessagingSettings() : base(SingletonId) { }
    public bool BotEnabled { get; set; }
    public bool ClassRemindersEnabled { get; set; }
    public bool RentalRemindersEnabled { get; set; }
    public string ReminderTime { get; set; } = "18:00";
    public int Version { get; set; } = 1;
}
public sealed class MessagingFaq : Entity
{
    public MessagingFaq() : base(Guid.NewGuid()) { }
    public string Question { get; set; } = "";
    public string Answer { get; set; } = "";
    public bool Approved { get; set; }
    public int Version { get; set; } = 1;
}
