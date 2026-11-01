using LongBeach.Contracts.Messaging;

namespace LongBeach.Application.Messaging;

public interface IMessagingContext
{
    Task<MessagingContextDto> GetAsync(Guid conversationId, bool canViewBar, CancellationToken ct);
    Task<MessagingActivityDto> ConfirmAsync(Guid conversationId, SaveMessagingConfirmationInput input, CancellationToken ct);
    Task<MessageDto> SendBarStatementAsync(Guid conversationId, SendMessagingBarStatementInput input, Guid actor, CancellationToken ct);
}
