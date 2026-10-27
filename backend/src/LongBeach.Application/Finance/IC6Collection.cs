namespace LongBeach.Application.Finance;

public interface IC6Collection
{
    Task Reprocess(DateOnly from, DateOnly through, string reason, Guid actor, CancellationToken ct);
}

