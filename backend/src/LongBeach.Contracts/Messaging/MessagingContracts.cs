namespace LongBeach.Contracts.Messaging;

public sealed record MessagingPage<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);
public sealed record AttachmentDto(Guid Id, string FileName, string ContentType, long Length, string Url);
public sealed record ConversationDto(Guid Id, string ExternalId, string? Phone, string Name, Guid? CustomerId,
    bool IdentityVerified, bool ConsentForReminders, string Status, string Mode, Guid? AssignedUserId,
    string? AssignedUserName, int UnreadCount, string? LastMessage, DateTimeOffset? LastMessageAtUtc, int Version);
public sealed record MessageDto(Guid Id, Guid ConversationId, string Direction, string Origin, string Text,
    DateTimeOffset OccurredAtUtc, string State, string? AuthorName, AttachmentDto? Attachment, Guid? OperationId,
    string Purpose, DateTimeOffset? ScheduledAtUtc, string? FailureReason, string? ContextKind, Guid? ContextId, DateOnly? ContextDate,
    string? ConversationName = null, string? RecipientPhone = null);
public sealed record MessagePage(IReadOnlyList<MessageDto> Items, string? Before, bool HasMore);
public sealed record CreateConversationInput(Guid OperationId, Guid CustomerId);
public sealed record ConversationActionInput(Guid OperationId, int ExpectedVersion);
public sealed record ContactLinkInput(Guid OperationId, int ExpectedVersion, Guid? CustomerId, bool IdentityVerified, bool ConsentForReminders);
public sealed record SendMessageInput(Guid OperationId, string Text, Guid? AttachmentId = null, string Purpose = "Manual",
    string? ContextKind = null, Guid? ContextId = null, DateOnly? ContextDate = null, DateTimeOffset? ScheduledAtUtc = null);
public sealed record CancelMessageInput(Guid OperationId);
public sealed record MessagingSettingsDto(bool BotEnabled, bool ClassRemindersEnabled, bool RentalRemindersEnabled, string ReminderTime, int Version);
public sealed record SaveMessagingSettingsInput(int ExpectedVersion, bool BotEnabled, bool ClassRemindersEnabled, bool RentalRemindersEnabled, string ReminderTime);
public sealed record FaqDto(Guid Id, string Question, string Answer, bool Approved, int Version);
public sealed record SaveFaqInput(string Question, string Answer, bool Approved, int ExpectedVersion = 0);
public sealed record DeleteFaqInput(int ExpectedVersion);
public sealed record BridgeStatusDto(string State, string? AccountId = null, string? Detail = null, string? QrCode = null, DateTimeOffset? UpdatedAtUtc = null);
public sealed record BridgeMedia(string? DataBase64, string ContentType, string? FileName, string? Kind = null);
public sealed record BridgeEvent(string EventId, string Type, string? ChatId = null, string? MessageId = null,
    string? SenderId = null, string? SenderPhone = null, string[]? Aliases = null, bool FromMe = false, bool IsHistory = false,
    DateTimeOffset? OccurredAtUtc = null, string? Text = null, BridgeMedia? Media = null, string? State = null, string[]? MessageIds = null);
public sealed record BridgeSendRequest(Guid OperationId, string MessageId, string ChatId, string Text, BridgeMedia? Media = null);
public sealed record BridgeSendResult(string MessageId, string State, string? Error = null);
public sealed record AttachmentDownload(byte[] Data, string ContentType, string FileName);
