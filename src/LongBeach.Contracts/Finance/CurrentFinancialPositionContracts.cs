namespace LongBeach.Contracts.Finance;

public sealed record OutstandingAccounts(long AmountCents, int Records, long OverdueCents, int OverdueRecords, long ConfirmedPaymentsCents);
public sealed record CurrentBankBalance(long? AmountCents, DateTimeOffset? AsOfUtc, string Status, string Issue,
    string? Source = null, string? Environment = null, DateOnly? SourceDate = null);
public sealed record OutstandingEntry(Guid Id, string Name, string Direction, DateOnly DueDate, long OriginalCents, long ConfirmedPaymentsCents, long OutstandingCents);
public sealed record CurrentFinancialPosition(DateOnly Date, DateTimeOffset ReadAtUtc, DateTimeOffset? LastRecordChangeAtUtc,
    int RegisteredEntries, OutstandingAccounts Receivable, OutstandingAccounts Payable, CurrentBankBalance CurrentBank, OutstandingEntry[] Entries);
