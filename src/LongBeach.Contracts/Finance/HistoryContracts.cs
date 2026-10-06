namespace LongBeach.Contracts.Finance;

public sealed record FinancialObservation(string Entity, string Currency, string SourceCell, string Series,
    string Metric, string Label, string State, DateOnly PeriodStart, DateOnly PeriodEnd, string Grain,
    long AmountCents, string Notes);
public sealed record HistoryItem(Guid Id, Guid BatchId, string SourceName, string SourceSha256, FinancialObservation Data);
public sealed record HistoryTotal(string Series, string Metric, string State, string Period, string Grain, long AmountCents, int Records);
public sealed record HistoryPreview(Guid BatchId, string SourceName, bool Applied, string ConfirmationToken,
    int Creates, int Matches, IReadOnlyList<HistoryTotal> Totals);
public sealed record HistoryReport(string Month, IReadOnlyList<string> Months, IReadOnlyList<HistoryTotal> Totals,
    IReadOnlyList<HistoryItem> Items, int Total, int Page, DateTimeOffset UpdatedAtUtc);
public sealed record IntegrationStatus(string Provider, string State, string Detail, DateTimeOffset? LastSuccessUtc,
    string? FailureCode, DateOnly? CompleteThrough);
public sealed record ProviderRecord(string Movement, DateOnly Date, int SourcePage, string SourceSha256, System.Text.Json.JsonElement Data);
public sealed record ProviderReport(string? Date, IReadOnlyList<string> Dates, IReadOnlyList<ProviderRecord> Items, int Total, int Page);
