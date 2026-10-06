namespace LongBeach.Contracts.Finance;

public sealed record PaymentControlSummary(string Month, int Records, int PaidRecords, int PaidNames,
    long PaidAmountCents, int UnpaidRecords, int OtherRecords);
public sealed record RentalScheduleSummary(string Day, string Hours, int Records, int PaidRecords, int UnpaidRecords);
public sealed record RentalControlSummary(PaymentControlSummary Payments, int ScheduleRecords,
    int? WeeklyMinutes, int InvalidSchedules, IReadOnlyList<RentalScheduleSummary> Schedule);
public sealed record LessonControlSummary(string Month, int Records, int Lessons, int CancelledRecords,
    int OtherRecords, int? Minutes, int InvalidHours, int? Attendances, int MissingAttendance,
    decimal? AverageAttendance, DateOnly LastDate);
public sealed record ArenaHistorySummary(IReadOnlyList<string> Months, PaymentControlSummary? Students,
    RentalControlSummary? Rentals, LessonControlSummary? Lessons, DateTimeOffset QueriedAtUtc);
