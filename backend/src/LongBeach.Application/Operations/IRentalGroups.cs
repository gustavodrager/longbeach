using System.Text.Json;
using LongBeach.Contracts.Operations;
namespace LongBeach.Application.Operations;
public interface IRentalGroups
{
    Task<RentalMonthPreview> Preview(Guid groupId, string month, CancellationToken ct);
    Task<JsonElement> Generate(Guid groupId, RentalMonthInput input, CancellationToken ct);
    Task<IReadOnlyList<RentalBarSummary>> Bar(Guid groupId, string month, CancellationToken ct);
    Task UnlinkBar(Guid groupId, Guid tabId, int version, CancellationToken ct);
    Task LinkBar(Guid groupId, Guid tabId, RentalBarLinkInput input, CancellationToken ct);
}
public sealed class RentalRuleException(string message, bool conflict = false) : Exception(message)
{ public bool Conflict { get; } = conflict; }
