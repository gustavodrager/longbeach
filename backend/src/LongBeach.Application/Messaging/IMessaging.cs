using LongBeach.Contracts.Messaging;
namespace LongBeach.Application.Messaging;

public interface IMessaging
{
    Task<MessagingPage<ConversationDto>> ConversationsAsync(string? search, string? status, string? mode, int page, int pageSize, CancellationToken ct);
    Task<ConversationDto> ConversationAsync(Guid id, CancellationToken ct);
    Task<ConversationDto> CreateConversationAsync(CreateConversationInput input, Guid actor, CancellationToken ct);
    Task<ConversationDto> ActionAsync(Guid id, string action, ConversationActionInput input, Guid actor, CancellationToken ct);
    Task<ConversationDto> LinkAsync(Guid id, ContactLinkInput input, Guid actor, CancellationToken ct);
    Task<MessagePage> MessagesAsync(Guid id, string? before, int limit, CancellationToken ct);
    Task<MessageDto> SendAsync(Guid id, SendMessageInput input, Guid actor, CancellationToken ct);
    Task<MessageDto> QueueAutomationAsync(Guid conversationId, string text, string purpose, string? contextKind, Guid? contextId, DateOnly? contextDate, DateTimeOffset? scheduledAtUtc, Guid operationId, CancellationToken ct);
    Task<MessageDto> OperationAsync(Guid operationId, CancellationToken ct);
    Task<MessageDto> CancelAsync(Guid id, CancelMessageInput input, Guid actor, CancellationToken ct);
    Task<MessagingPage<MessageDto>> SendsAsync(string? state, int page, int pageSize, CancellationToken ct);
    Task<AttachmentDto> UploadAsync(byte[] data, string fileName, string contentType, Guid actor, CancellationToken ct);
    Task<AttachmentDownload> DownloadAsync(Guid id, CancellationToken ct);
    Task<MessagingSettingsDto> SettingsAsync(CancellationToken ct);
    Task<MessagingSettingsDto> SaveSettingsAsync(SaveMessagingSettingsInput input, CancellationToken ct);
    Task<IReadOnlyList<FaqDto>> FaqsAsync(CancellationToken ct);
    Task<FaqDto> SaveFaqAsync(Guid? id, SaveFaqInput input, CancellationToken ct);
    Task DeleteFaqAsync(Guid id, int expectedVersion, CancellationToken ct);
    Task IngestAsync(BridgeEvent input, CancellationToken ct);
}

public interface IMessagingAutomation
{
    Task TickAsync(CancellationToken ct);
    Task OnIncomingAsync(Guid conversationId, Guid messageId, CancellationToken ct);
    /// <summary>Re-check eligibility and refresh dynamic content. False means the message must not be sent.</summary>
    Task<bool> PrepareOutgoingAsync(Guid messageId, CancellationToken ct);
}

public interface IMessagingBridge
{
    Task<BridgeStatusDto> StatusAsync(CancellationToken ct);
    Task<BridgeStatusDto> PairAsync(CancellationToken ct);
    Task<BridgeStatusDto> ReconnectAsync(CancellationToken ct);
    Task<BridgeSendResult> SendAsync(BridgeSendRequest input, CancellationToken ct);
    Task<BridgeSendResult?> FindAsync(Guid operationId, CancellationToken ct);
}
