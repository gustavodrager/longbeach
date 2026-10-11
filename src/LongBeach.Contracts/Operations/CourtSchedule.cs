namespace LongBeach.Contracts.Operations;
public sealed record CourtScheduleBlock(string Source, string StartTime, string EndTime, Guid? SourceId);
public sealed record CourtFreeInterval(string StartTime, string EndTime);
public sealed record CourtScheduleRow(Guid CourtId, string OpeningTime, string ClosingTime, int? AvailableMinutes, int ReservedMinutes, int ClassMinutes, bool ClosedForMaintenance, bool HasConflict, IReadOnlyList<CourtScheduleBlock> Blocks, bool ClosedForDay = false, int OperatingMinutes = 0, bool SchedulePending = false, int OccupiedMinutes = 0, IReadOnlyList<CourtFreeInterval>? FreeIntervals = null);
public sealed record CourtScheduleResponse(string Date, DateTimeOffset UpdatedAtUtc, IReadOnlyList<CourtScheduleRow> Courts);
public sealed record CourtScheduleRangeResponse(string From, string To, DateTimeOffset UpdatedAtUtc, IReadOnlyList<CourtScheduleResponse> Days);
