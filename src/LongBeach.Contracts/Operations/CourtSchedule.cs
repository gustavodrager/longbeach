namespace LongBeach.Contracts.Operations;
public sealed record CourtScheduleBlock(string Source, string StartTime, string EndTime, Guid? SourceId);
public sealed record CourtScheduleRow(Guid CourtId, string OpeningTime, string ClosingTime, int AvailableMinutes, int ReservedMinutes, int ClassMinutes, bool ClosedForMaintenance, bool HasConflict, IReadOnlyList<CourtScheduleBlock> Blocks);
public sealed record CourtScheduleResponse(string Date, DateTimeOffset UpdatedAtUtc, IReadOnlyList<CourtScheduleRow> Courts);
