namespace LongBeach.Application.Finance;

public interface IPagBankEdiCollection
{
    Task Reprocess(DateOnly from, DateOnly through, string reason, Guid actor, CancellationToken ct);
}
