namespace LongBeach.Contracts.Overview;

// Money is in BRL cents. Current agreements and targets are a snapshot at AsOfDate;
// the selected Month applies only to Finance. Different financial bases are never added.
public sealed record OwnerOverviewResponse(
    string Month, DateOnly AsOfDate, DateTimeOffset QueriedAtUtc, string TimeZone,
    OwnerSchoolSnapshot School, OwnerRentalSnapshot Rentals, OwnerRecurringSummary Recurring,
    OwnerPhysicalTargets Targets, IReadOnlyList<OwnerWeekdayOverview> Weekdays,
    OwnerFinancialOverview Finance, IReadOnlyList<OwnerOverviewWarning> Warnings);

public sealed record OwnerSchoolSnapshot(int ActiveStudents, int ActiveEnrollments, int ActiveClasses,
    long KnownMonthlyCents, int PriceSampleCount, int MissingPriceCount);
public sealed record OwnerRentalSnapshot(int ActiveGroups, long KnownMonthlyCents,
    int PriceSampleCount, int MissingPriceCount);

public sealed record OwnerRecurringSummary(long KnownMonthlyCents, int MissingPriceCount,
    long? SchoolTargetMonthlyCents, long? RentalTargetMonthlyCents, long? TargetMonthlyCents,
    long? BarTargetMonthlyCents);
public sealed record OwnerPhysicalTargets(int ClassesPerWeekday, int PlacesPerClass,
    int RentalGroupsPerWeekday, int WeeklyClasses, int WeeklyPlaces, int WeeklyRentalGroups);

public sealed record OwnerWeekdayOverview(int WeekDay, int Classes, int EnrollmentPlaces, int RentalGroups,
    OwnerGoalEstimate SchoolGoal, OwnerGoalEstimate RentalGoal);
// PriceReference: weekday = this weekday's current agreements; segment = all current
// agreements in the same segment; missing = no known price. Explicit zero is known.
public sealed record OwnerGoalEstimate(long? EstimatedMonthlyCents, long? AverageMonthlyCents,
    int SampleCount, string PriceReference, bool UsesFallback);

public sealed record OwnerFinancialOverview(OwnerCompetenceFinance School,
    OwnerCompetenceFinance Rentals, OwnerCompetenceFinance OtherSchool, OwnerBarFinance Bar,
    OwnerLegacyBarFinance BarLegacy);
// Received is the current net settlement of the selected charge cohort, even if
// payment occurred in another month. School/Rentals use competence; OtherSchool
// uses due-date. It is not cash flow during the selected month.
public sealed record OwnerCompetenceFinance(long BilledCents, long ReceivedCents, long OutstandingCents,
    int ChargeCount, int PartiallyPaidCount, int ManualPaidCount, long OverdueCents, int OverdueChargeCount,
    string Basis = "competence");
// Consumption uses item acceptance dates; receipts and refunds use their own
// confirmation dates. Legacy sales and imported bank controls are separate sources.
public sealed record OwnerBarFinance(long ConsumedCents, long GrossReceivedCents, long RefundsCents,
    long NetReceivedCents, int ConsumedItemCount, int ReceivedPaymentCount, int ConfirmedRefundCount,
    string Basis = "confirmation-date", string Source = "bar-tabs");
// The old sale flow has its own immutable events and event dates. It remains a
// separate source: no combined Bar total is inferred from the two ledgers.
public sealed record OwnerLegacyBarFinance(long GrossReceivedCents, long RefundsCents,
    long NetReceivedCents, int ReceivedEventCount, int RefundEventCount,
    string Basis = "event-date", string Source = "legacy-bar-events");

public sealed record OwnerOverviewWarning(string Code, int Count, string Message);
