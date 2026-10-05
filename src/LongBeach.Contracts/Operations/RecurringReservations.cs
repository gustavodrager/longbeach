namespace LongBeach.Contracts.Operations;

public sealed record RecurringReservationInput(
    Guid OperationId, string GroupTitle, Guid CourtId, string StartDate,
    string StartTime, string EndTime, int Weeks,
    string? CustomerName = null, string? Phone = null, decimal Amount = 0, string? Notes = null);

public sealed record ArenaReservationResponse(
    Guid Id, int Version, string Name, Guid CourtId, string Date, string StartTime, string EndTime,
    string CustomerName, string Phone, decimal Amount, string Status, string Notes, bool CostsVisible,
    Guid? GroupId = null, string? GroupTitle = null, int? OccurrenceIndex = null);

public sealed record RecurringReservationResponse(
    Guid GroupId, string GroupTitle, IReadOnlyList<ArenaReservationResponse> Reservations);
