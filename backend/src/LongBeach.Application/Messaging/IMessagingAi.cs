using LongBeach.Contracts.Messaging;

namespace LongBeach.Application.Messaging;

public sealed record MessagingAiDecision(string Action, string? FaqId = null, string? ActivityKey = null, string? Confirmation = null);
public interface IMessagingAi
{
    bool Configured { get; }
    Task<MessagingAiDecision> DecideAsync(string text, IReadOnlyList<FaqDto> faqs,
        IReadOnlyList<MessagingActivityDto> activities, CancellationToken ct);
}
