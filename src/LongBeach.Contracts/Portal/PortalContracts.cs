namespace LongBeach.Contracts.Portal;

public sealed record PortalLink(string Kind, Guid SourceId, string Name);
public sealed record PortalProfile(string Name, string Email, string Phone, bool Reminders, IReadOnlyList<PortalLink> Links);
public sealed record ProfileInput(string Name, string Phone, bool Reminders);
public sealed record LinkInput(Guid UserId, string Kind, Guid SourceId);
public sealed record PortalAppointment(string Key, Guid SourceId, string Kind, string Title, string Date, string StartTime, string EndTime, string Court, string Teacher, string Status, string Instructions, bool CanChange, bool CanRate, int? Rating);
public sealed record PortalChoice(Guid Id, string Name);
public sealed record PortalOptions(IReadOnlyList<PortalChoice> Courts, IReadOnlyList<PortalChoice> Teachers, string? HelpUrl);
public sealed record RequestInput(Guid OperationId, string Kind, string? AppointmentKey, string Date, string StartTime, string EndTime, Guid? CourtId, string Message);
public sealed record RequestDecision(int Version, string Action, string Reply, string? Date, string? StartTime, string? EndTime, Guid? CourtId, Guid? TeacherId, decimal? Amount);
public sealed record AcceptAlternativeInput(int Version);
public sealed record RatingInput(string AppointmentKey, int Score);
public sealed record PortalUpdate(string Status, string Reply, string Date, string StartTime, string EndTime, DateTimeOffset AtUtc);
public sealed record PortalRequest(Guid Id, Guid UserId, string CustomerName, string Kind, string? AppointmentKey, string Date, string StartTime, string EndTime, Guid? CourtId, string Message, string Status, string Reply, int Version, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc, Guid? ReservationId = null, Guid? TeacherId = null, decimal? Amount = null, IReadOnlyList<PortalUpdate>? History = null);
public sealed record PortalCandidates(IReadOnlyList<PortalChoice> Users, IReadOnlyList<PortalLink> Records);
