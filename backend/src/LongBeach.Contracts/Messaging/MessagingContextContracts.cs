namespace LongBeach.Contracts.Messaging;

public sealed record MessagingActivityDto(string Kind, Guid Id, Guid SubjectId, string SubjectName,
    string Label, DateOnly Date, string StartTime, string EndTime, string Court, string Confirmation, int Version, Guid? CourtId = null);
public sealed record MessagingBarAccountDto(Guid Id, string Label, decimal Balance, string DetailsUrl, decimal Pending = 0, decimal AvailableToPay = 0);
public sealed record MessagingContextDto(Guid? CustomerId, string? CustomerName, string[] Profiles,
    bool IdentityVerified, bool ConsentForReminders, IReadOnlyList<MessagingActivityDto> Activities,
    IReadOnlyList<MessagingBarAccountDto> BarAccounts, bool CanViewBar);
public sealed record SaveMessagingConfirmationInput(Guid OperationId, string Kind, Guid ActivityId,
    Guid SubjectId, DateOnly Date, string Status, int ExpectedVersion = 0);
public sealed record SendMessagingBarStatementInput(Guid OperationId, Guid AccountId);
