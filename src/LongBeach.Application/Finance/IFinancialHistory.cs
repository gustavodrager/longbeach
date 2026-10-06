using LongBeach.Contracts.Finance;
namespace LongBeach.Application.Finance;

public interface IFinancialHistory
{
    Task<HistoryPreview> Preview(Guid batchId, CancellationToken ct);
    Task<HistoryPreview> Apply(Guid batchId, string confirmationToken, CancellationToken ct);
    Task<HistoryReport> Report(string? month, string? series, string? metric, int page, CancellationToken ct);
    Task<ArenaHistorySummary> ArenaSummary(string? month, CancellationToken ct);
    Task<IReadOnlyList<IntegrationStatus>> Integrations(CancellationToken ct);
    Task<ProviderReport> ProviderRecords(string? date, int page, CancellationToken ct);
}

public sealed class FinancialRuleException(string message) : Exception(message);
