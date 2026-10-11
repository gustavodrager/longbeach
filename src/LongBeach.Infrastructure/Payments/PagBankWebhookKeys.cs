using System.Collections.Concurrent;
namespace LongBeach.Infrastructure.Payments;
// Shared by short-lived adapters; caches public material only, separately by account/environment.
public sealed class PagBankWebhookKeys
{
    internal sealed class Entry
    {
        internal readonly SemaphoreSlim Gate = new(1, 1);
        internal string? Current;
        internal string? Previous;
        internal DateTimeOffset PreviousUntil;
        internal DateTimeOffset NextRefresh;
    }
    private readonly ConcurrentDictionary<string, Entry> entries = new();
    internal Entry For(string identity) => entries.GetOrAdd(identity, _ => new());
}
