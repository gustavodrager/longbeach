using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Application.Overview;

namespace LongBeach.UnitTests;

public sealed class OwnerOverviewRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 20, 12, 0, 0, TimeSpan.Zero);
    private static OwnerOverviewRecord Row(string kind, Guid id, object value) => new(id, kind, JsonSerializer.Serialize(value));
    private static OwnerOverviewRecord Student(Guid id) => Row("students", id, new { name = "Pessoa fictícia", monthlyAmount = 99999, paymentStatus = "Pago" });
    private static OwnerOverviewRecord Lesson(Guid id, int day) => Row("classes", id, new { status = "Ativa", weekDay = day, startDate = "2026-10-01" });
    private static OwnerOverviewRecord Enrollment(Guid id, Guid student, Guid lesson, decimal? amount) => Row("enrollments", id,
        new { studentId = student, classId = lesson, status = "Ativa", startDate = "2026-10-01", monthlyAmount = amount });
    private static OwnerOverviewRecord Rental(Guid id, int day, decimal? amount) => Row("rentalGroups", id,
        new { status = "Ativo", weekDay = day, startDate = "2026-10-01", monthlyAmount = amount, fifthPolicy = "Extra", extraAmount = 999 });
    private static OwnerOverviewData Data(params OwnerOverviewRecord[] rows) => new(rows, [], [], [], []);

    [Fact]
    public void Current_students_are_distinct_from_enrollments_and_weekday_goals_use_known_agreements_only()
    {
        var one = Guid.NewGuid(); var two = Guid.NewGuid();
        var monday = Guid.NewGuid(); var otherMonday = Guid.NewGuid(); var tuesday = Guid.NewGuid();
        var data = Data(Student(one), Student(two), Lesson(monday, 1), Lesson(otherMonday, 1), Lesson(tuesday, 2),
            Enrollment(Guid.NewGuid(), one, monday, 100), Enrollment(Guid.NewGuid(), one, tuesday, 200),
            Enrollment(Guid.NewGuid(), two, otherMonday, null), Rental(Guid.NewGuid(), 1, 600), Rental(Guid.NewGuid(), 3, 0), Rental(Guid.NewGuid(), 5, null));
        var result = OwnerOverviewRules.Summarize(data, "2026-10", Now);
        Assert.Equal("2026-10", result.Month); Assert.Equal(new DateOnly(2026, 11, 20), result.AsOfDate);
        Assert.Equal(2, result.School.ActiveStudents); Assert.Equal(3, result.School.ActiveEnrollments); Assert.Equal(3, result.School.ActiveClasses);
        Assert.Equal(30000, result.School.KnownMonthlyCents); Assert.Equal(2, result.School.PriceSampleCount); Assert.Equal(1, result.School.MissingPriceCount);
        Assert.Equal(3, result.Rentals.ActiveGroups); Assert.Equal(60000, result.Rentals.KnownMonthlyCents); Assert.Equal(1, result.Rentals.MissingPriceCount);
        Assert.Equal(90000, result.Recurring.KnownMonthlyCents); Assert.Equal(2, result.Recurring.MissingPriceCount);
        Assert.Equal(35, result.Targets.WeeklyClasses); Assert.Equal(210, result.Targets.WeeklyPlaces); Assert.Equal(14, result.Targets.WeeklyRentalGroups);
        var mon = Assert.Single(result.Weekdays, x => x.WeekDay == 1);
        Assert.Equal(2, mon.Classes); Assert.Equal(2, mon.EnrollmentPlaces); Assert.Equal(1, mon.RentalGroups);
        Assert.Equal("weekday", mon.SchoolGoal.PriceReference); Assert.False(mon.SchoolGoal.UsesFallback); Assert.Equal(300000, mon.SchoolGoal.EstimatedMonthlyCents);
        var sunday = Assert.Single(result.Weekdays, x => x.WeekDay == 0);
        Assert.Equal("segment", sunday.SchoolGoal.PriceReference); Assert.True(sunday.SchoolGoal.UsesFallback); Assert.Equal(2, sunday.SchoolGoal.SampleCount);
        Assert.Equal(15000, sunday.SchoolGoal.AverageMonthlyCents); Assert.Equal(450000, sunday.SchoolGoal.EstimatedMonthlyCents);
        var wed = Assert.Single(result.Weekdays, x => x.WeekDay == 3);
        Assert.Equal(0, wed.RentalGoal.EstimatedMonthlyCents); Assert.Equal(1, wed.RentalGoal.SampleCount); Assert.Equal("weekday", wed.RentalGoal.PriceReference);
        Assert.Equal(3150000, result.Recurring.SchoolTargetMonthlyCents); Assert.Equal(420000, result.Recurring.RentalTargetMonthlyCents);
        Assert.Equal(3570000, result.Recurring.TargetMonthlyCents); Assert.Null(result.Recurring.BarTargetMonthlyCents);
    }

    [Fact]
    public void Missing_prices_keep_targets_null_while_explicit_zero_is_a_valid_reference()
    {
        var student = Guid.NewGuid(); var lesson = Guid.NewGuid();
        var result = OwnerOverviewRules.Summarize(Data(Student(student), Lesson(lesson, 1), Enrollment(Guid.NewGuid(), student, lesson, null), Rental(Guid.NewGuid(), 1, 0)), null, Now);
        Assert.Equal("2026-11", result.Month); Assert.Equal(0, result.School.PriceSampleCount); Assert.Equal(1, result.School.MissingPriceCount);
        Assert.Null(result.Recurring.SchoolTargetMonthlyCents); Assert.Equal(0, result.Recurring.RentalTargetMonthlyCents); Assert.Null(result.Recurring.TargetMonthlyCents);
        Assert.All(result.Weekdays, row => { Assert.Null(row.SchoolGoal.EstimatedMonthlyCents); Assert.Equal("missing", row.SchoolGoal.PriceReference); });
        Assert.Contains(result.Warnings, row => row.Code == "school_prices_missing" && row.Count == 1);
        var empty = OwnerOverviewRules.Summarize(Data(), null, Now);
        Assert.Equal(0, empty.School.ActiveStudents); Assert.Equal(0, empty.Recurring.KnownMonthlyCents); Assert.Null(empty.Recurring.TargetMonthlyCents);
    }

    [Fact]
    public void Goal_rounding_uses_the_unrounded_observed_average_before_rounding_each_daily_estimate()
    {
        var a = Guid.NewGuid(); var b = Guid.NewGuid(); var lesson = Guid.NewGuid();
        var result = OwnerOverviewRules.Summarize(Data(Student(a), Student(b), Lesson(lesson, 1),
            Enrollment(Guid.NewGuid(), a, lesson, .01m), Enrollment(Guid.NewGuid(), b, lesson, .02m), Rental(Guid.NewGuid(), 1, 0)), null, Now);
        Assert.All(result.Weekdays, row => { Assert.Equal(2, row.SchoolGoal.AverageMonthlyCents); Assert.Equal(45, row.SchoolGoal.EstimatedMonthlyCents); });
        Assert.Equal(315, result.Recurring.TargetMonthlyCents);
    }

    [Fact]
    public void Future_closed_deleted_and_duplicate_enrollments_do_not_inflate_the_current_portfolio()
    {
        var student = Guid.NewGuid(); var lesson = Guid.NewGuid(); var deleted = Guid.NewGuid(); var future = Guid.NewGuid();
        var result = OwnerOverviewRules.Summarize(Data(Student(student), Lesson(lesson, 1),
            Row("classes", deleted, new { status = "Ativa", weekDay = 2, deletedAt = "2026-11-12T10:00:00Z" }),
            Row("classes", future, new { status = "Ativa", weekDay = 3, startDate = "2026-12-01" }),
            Enrollment(Guid.NewGuid(), student, lesson, 100), Enrollment(Guid.NewGuid(), student, lesson, 100),
            Enrollment(Guid.NewGuid(), student, deleted, 200), Enrollment(Guid.NewGuid(), student, future, 300),
            Row("enrollments", Guid.NewGuid(), new { status = "Ativa", studentId = student, classId = lesson, startDate = "2026-12-01", monthlyAmount = 500 }),
            Row("enrollments", Guid.NewGuid(), new { status = "Encerrada", studentId = student, classId = lesson, startDate = "2026-10-01", endDate = "2026-11-01", monthlyAmount = 500 }),
            Row("rentalGroups", Guid.NewGuid(), new { status = "Ativo", startDate = "2026-10-01", endDate = "2026-11-01", weekDay = 1, monthlyAmount = 500 }),
            Row("rentalGroups", Guid.NewGuid(), new { status = "Pausado", startDate = "2026-10-01", weekDay = 1, monthlyAmount = 500 })), null, Now);
        Assert.Equal(1, result.School.ActiveClasses); Assert.Equal(0, result.School.ActiveEnrollments); Assert.Equal(0, result.Rentals.ActiveGroups);
        Assert.Contains(result.Warnings, row => row.Code == "duplicate_enrollments" && row.Count == 2);
        Assert.Contains(result.Warnings, row => row.Code == "inactive_class_enrollments" && row.Count == 2);
    }

    [Fact]
    public void Competence_settlements_are_counted_once_keep_partial_payments_and_allow_payment_in_another_month()
    {
        var one = Guid.NewGuid(); var two = Guid.NewGuid(); var three = Guid.NewGuid(); var rentMonth = Guid.NewGuid();
        var chargeOne = Guid.NewGuid(); var chargeTwo = Guid.NewGuid(); var chargeThree = Guid.NewGuid(); var rentCharge = Guid.NewGuid();
        OwnerOverviewRecord Charge(Guid id, Guid source, string kind, decimal amount, string status, string month = "2026-10") => Row("financeEntries", id,
            new { sourceId = source, sourceKind = kind, direction = "Receber", origin = kind == "enrollments" ? "Escola" : "Locações", month, amount, status, paidDate = "2026-11-10" });
        var data = Data(Row("enrollments", one, new { status = "Encerrada" }), Row("enrollments", two, new { }), Row("enrollments", three, new { }),
            Row("rentalMonths", rentMonth, new { month = "2026-10", amount = 200 }),
            Charge(chargeOne, one, "enrollments", 100, "Pago"), Charge(chargeTwo, two, "enrollments", 50, "Pago"),
            Charge(chargeThree, three, "enrollments", 30, "Pendente"), Charge(rentCharge, rentMonth, "rentalMonths", 200, "Pendente"),
            Charge(Guid.NewGuid(), one, "enrollments", 999, "Cancelado"), Charge(Guid.NewGuid(), one, "enrollments", 999, "Pago", "2026-09")) with
        {
            Settlements = [new(chargeOne, "Approved", 100, 40, Now.AddDays(-2)), new(chargeThree, "Pending", 30, 0, null), new(rentCharge, "Approved", 200, 0, Now.AddDays(-1))]
        };
        var result = OwnerOverviewRules.Summarize(data, "2026-10", Now);
        Assert.Equal(18000, result.Finance.School.BilledCents); Assert.Equal(11000, result.Finance.School.ReceivedCents); Assert.Equal(7000, result.Finance.School.OutstandingCents);
        Assert.Equal(1, result.Finance.School.PartiallyPaidCount); Assert.Equal(1, result.Finance.School.ManualPaidCount); Assert.Equal(3, result.Finance.School.ChargeCount);
        Assert.Equal(20000, result.Finance.Rentals.ReceivedCents); Assert.Equal(0, result.Finance.Rentals.OutstandingCents);
        Assert.Equal("competence", result.Finance.School.Basis); Assert.Equal("competence", result.Finance.Rentals.Basis);
    }

    [Fact]
    public void Duplicate_unlinked_and_invalid_manual_charges_do_not_become_confirmed_receipts()
    {
        var source = Guid.NewGuid(); var manualSource = Guid.NewGuid();
        OwnerOverviewRecord Charge(Guid id, Guid linked, object paidDate) => Row("financeEntries", id,
            new { sourceKind = "enrollments", sourceId = linked, direction = "Receber", origin = "Escola", month = "2026-11", amount = 100, status = "Pago", paidDate });
        var result = OwnerOverviewRules.Summarize(Data(Row("enrollments", source, new { }), Row("enrollments", manualSource, new { }),
            Charge(Guid.NewGuid(), source, "2026-11-10"), Charge(Guid.NewGuid(), source, "2026-11-10"),
            Charge(Guid.NewGuid(), manualSource, "2026-12-01"), Charge(Guid.NewGuid(), Guid.NewGuid(), "2026-11-10")), null, Now);
        Assert.Equal(10000, result.Finance.School.BilledCents); Assert.Equal(0, result.Finance.School.ReceivedCents); Assert.Equal(10000, result.Finance.School.OutstandingCents);
        Assert.Contains(result.Warnings, x => x.Code == "duplicate_charges" && x.Count == 2);
        Assert.Contains(result.Warnings, x => x.Code == "invalid_charge_links"); Assert.Contains(result.Warnings, x => x.Code == "manual_paid_date_invalid");
    }

    [Fact]
    public void Overdue_is_only_the_unpaid_balance_before_today_and_requires_a_known_due_date()
    {
        var sources = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToArray(); var partial = Guid.NewGuid();
        OwnerOverviewRecord Charge(Guid id, Guid source, decimal amount, string? due, string status = "Pendente") => Row("financeEntries", id,
            new { sourceKind = "enrollments", sourceId = source, origin = "Escola", direction = "Receber", month = "2026-11", amount, status, dueDate = due, paidDate = "2026-11-10" });
        var data = Data(sources.Select(id => Row("enrollments", id, new { })).Concat([
            Charge(partial, sources[0], 100, "2026-11-19"), Charge(Guid.NewGuid(), sources[1], 20, "2026-11-20"),
            Charge(Guid.NewGuid(), sources[2], 30, "2026-11-21"), Charge(Guid.NewGuid(), sources[3], 40, "2026-11-01", "Pago"),
            Charge(Guid.NewGuid(), sources[4], 10, null)]).ToArray()) with
        { Settlements = [new(partial, "Approved", 40, 0, Now.AddDays(-1))] };
        var result = OwnerOverviewRules.Summarize(data, "2026-11", Now);
        Assert.Equal(12000, result.Finance.School.OutstandingCents); Assert.Equal(6000, result.Finance.School.OverdueCents); Assert.Equal(1, result.Finance.School.OverdueChargeCount);
        Assert.Contains(result.Warnings, x => x.Code == "charge_due_date_missing" && x.Count == 1);
    }

    [Fact]
    public void Other_school_uses_due_dates_and_valid_sources_without_collapsing_multiple_reservation_charges()
    {
        var single = Guid.NewGuid(); var trial = Guid.NewGuid(); var court = Guid.NewGuid(); var firstCharge = Guid.NewGuid();
        OwnerOverviewRecord Charge(Guid id, Guid? source, string origin, decimal amount, string status = "Pendente", string due = "2026-11-10") => Row("financeEntries", id,
            new { sourceKind = source.HasValue ? "reservations" : "", sourceId = source, origin, direction = "Receber", amount, status, dueDate = due, paidDate = "2026-11-15", month = "2026-10" });
        var data = Data(
            Row("reservations", single, new { activityKind = "SingleLesson", status = "Cancelada", amount = 9999, date = "2026-10-01" }),
            Row("reservations", trial, new { activityKind = "Trial", status = "Confirmada", amount = 9999 }),
            Row("reservations", court, new { activityKind = "CourtRental", amount = 9999 }),
            Charge(firstCharge, single, "Locações", 100), Charge(Guid.NewGuid(), single, "Locações", 50),
            Charge(Guid.NewGuid(), trial, "Locações", 30, "Pago"), Charge(Guid.NewGuid(), null, "Escola", 20, "Pago"),
            Charge(Guid.NewGuid(), null, "Escola", 999, "Pago", "2026-10-31"), Charge(Guid.NewGuid(), trial, "Escola", 999, "Cancelado"),
            Charge(Guid.NewGuid(), court, "Locações", 777), Charge(Guid.NewGuid(), Guid.NewGuid(), "Escola", 999),
            Charge(Guid.NewGuid(), null, "Escola", 999, due: "invalid"),
            Row("financeEntries", Guid.NewGuid(), new { direction = "Receber", origin = "Escola", sourceId = true, sourceKind = "reservations", amount = 999, status = "Pago", dueDate = "2026-11-10", paidDate = "2026-11-15" }),
            Row("financeEntries", Guid.NewGuid(), new { direction = "Receber", origin = "Bar", amount = 999, status = "Pago", dueDate = "2026-11-10", paidDate = "2026-11-15" })) with
        { Settlements = [new(firstCharge, "Approved", 80, 10, Now.AddDays(-1))] };
        var result = OwnerOverviewRules.Summarize(data, "2026-11", Now);
        var other = result.Finance.OtherSchool;
        Assert.Equal("due-date", other.Basis); Assert.Equal(20000, other.BilledCents); Assert.Equal(12000, other.ReceivedCents);
        Assert.Equal(8000, other.OutstandingCents); Assert.Equal(4, other.ChargeCount); Assert.Equal(1, other.PartiallyPaidCount); Assert.Equal(2, other.ManualPaidCount);
        Assert.Equal(8000, other.OverdueCents); Assert.Equal(2, other.OverdueChargeCount);
        Assert.Equal(0, result.Finance.School.BilledCents); Assert.Equal(0, result.Finance.Rentals.BilledCents); Assert.Equal(0, result.Finance.Bar.GrossReceivedCents);
        Assert.DoesNotContain(result.Warnings, x => x.Code == "duplicate_charges");
        Assert.Contains(result.Warnings, x => x.Code == "invalid_charge_links" && x.Count == 2);
        Assert.Contains(result.Warnings, x => x.Code == "school_due_date_missing");
        Assert.Contains(result.Warnings, x => x.Code == "unallocated_receipts" && x.Count == 2);
    }

    [Fact]
    public void Bar_uses_local_month_boundaries_and_each_refunds_own_date_without_bank_or_legacy_totals()
    {
        var start = new DateTimeOffset(2026, 11, 1, 3, 0, 0, TimeSpan.Zero); var end = new DateTimeOffset(2026, 12, 1, 3, 0, 0, TimeSpan.Zero);
        var data = Data() with
        {
            BarItems = [new("Accepted", 100, start.AddSeconds(-1)), new("Accepted", 50, start), new("Fulfilled", 20, end.AddSeconds(-1)), new("Accepted", 999, end), new("Rejected", 999, start)],
            BarPayments = [new("Approved", 100, start), new("Pending", 999, start), new("Approved", 999, null)],
            BarRefunds = [new("Confirmed", 25, start.AddDays(10)), new("Pending", 999, start), new("Confirmed", 999, end)],
            LegacyBarEvents = [new("SalePaid", 40, start), new("SaleRefunded", -10, start.AddDays(2))]
        };
        var result = OwnerOverviewRules.Summarize(data, "2026-11", end.AddDays(2));
        Assert.Equal(7000, result.Finance.Bar.ConsumedCents); Assert.Equal(10000, result.Finance.Bar.GrossReceivedCents);
        Assert.Equal(2500, result.Finance.Bar.RefundsCents); Assert.Equal(7500, result.Finance.Bar.NetReceivedCents);
        Assert.Equal(2, result.Finance.Bar.ConsumedItemCount); Assert.Equal(1, result.Finance.Bar.ReceivedPaymentCount);
        Assert.Equal("bar-tabs", result.Finance.Bar.Source); Assert.Equal("confirmation-date", result.Finance.Bar.Basis);
        Assert.Equal(4000, result.Finance.BarLegacy.GrossReceivedCents); Assert.Equal(1000, result.Finance.BarLegacy.RefundsCents);
        Assert.Equal(3000, result.Finance.BarLegacy.NetReceivedCents); Assert.Equal(1, result.Finance.BarLegacy.ReceivedEventCount); Assert.Equal(1, result.Finance.BarLegacy.RefundEventCount);
        Assert.Equal("event-date", result.Finance.BarLegacy.Basis); Assert.Equal("legacy-bar-events", result.Finance.BarLegacy.Source);
        Assert.Contains(result.Warnings, x => x.Code == "invalid_bar_dates");
        var refundsOnly = OwnerOverviewRules.Summarize(Data() with { BarRefunds = [new("Confirmed", 25, start)] }, "2026-11", Now);
        Assert.Equal(-2500, refundsOnly.Finance.Bar.NetReceivedCents);
    }

    [Fact]
    public void Legacy_bar_uses_immutable_signed_events_and_keeps_refunds_from_earlier_sales_separate()
    {
        var start = new DateTimeOffset(2026, 11, 1, 3, 0, 0, TimeSpan.Zero);
        var result = OwnerOverviewRules.Summarize(Data() with
        {
            LegacyBarEvents = [new("SalePaid", 100, start.AddTicks(-1)), new("SaleRefunded", -25, start),
                new("CourtesyApproved", 300, start), new("PurchaseReceived", 900, start),
                new("SaleRefunded", 99, start), new("SalePaid", -99, start), new("SalePaid", 99, Now.AddHours(1))]
        }, "2026-11", Now);
        Assert.Equal(0, result.Finance.BarLegacy.GrossReceivedCents); Assert.Equal(2500, result.Finance.BarLegacy.RefundsCents); Assert.Equal(-2500, result.Finance.BarLegacy.NetReceivedCents);
        Assert.Equal(0, result.Finance.Bar.NetReceivedCents); Assert.Equal(1, result.Finance.BarLegacy.RefundEventCount);
        Assert.Contains(result.Warnings, x => x.Code == "invalid_legacy_bar_amounts" && x.Count == 2); Assert.Contains(result.Warnings, x => x.Code == "invalid_legacy_bar_dates");
    }

    [Fact]
    public void Malformed_records_dates_and_prices_report_partiality_without_using_legacy_student_fees()
    {
        var student = Guid.NewGuid(); var lesson = Guid.NewGuid();
        var result = OwnerOverviewRules.Summarize(Data(Student(student), Lesson(lesson, 1),
            new(Guid.NewGuid(), "classes", "not json"), Row("classes", Guid.NewGuid(), new { status = "Ativa", weekDay = 9 }),
            Row("enrollments", Guid.NewGuid(), new { studentId = student, classId = lesson, status = "Ativa", startDate = "2026-11-01", monthlyAmount = "100" }),
            Row("enrollments", Guid.NewGuid(), new { studentId = student, classId = lesson, status = "Ativa", startDate = true, monthlyAmount = 100 }),
            Row("rentalGroups", Guid.NewGuid(), new { status = "Ativo", startDate = "2026-11-01", weekDay = 2, monthlyAmount = -10 })), null, Now);
        Assert.Equal(1, result.School.ActiveStudents); Assert.Equal(0, result.Recurring.KnownMonthlyCents); Assert.Equal(2, result.Recurring.MissingPriceCount);
        Assert.Null(result.Recurring.TargetMonthlyCents);
        Assert.Contains(result.Warnings, x => x.Code == "invalid_records"); Assert.Contains(result.Warnings, x => x.Code == "invalid_classes");
        Assert.Contains(result.Warnings, x => x.Code == "invalid_enrollment_dates"); Assert.Contains(result.Warnings, x => x.Code == "invalid_agreement_prices" && x.Count == 2);
    }

    [Theory]
    [InlineData("")][InlineData("2026-1")][InlineData("2026-13")][InlineData("9999-12")][InlineData("2026-11-01")][InlineData("not-a-month")]
    public void Invalid_month_is_rejected(string month) => Assert.Throws<FinancialRuleException>(() => OwnerOverviewRules.Summarize(Data(), month, Now));

    [Fact]
    public void Default_month_and_snapshot_use_the_arena_timezone()
    {
        var result = OwnerOverviewRules.Summarize(Data(), null, new(2026, 12, 1, 2, 30, 0, TimeSpan.Zero));
        Assert.Equal("2026-11", result.Month); Assert.Equal(new DateOnly(2026, 11, 30), result.AsOfDate); Assert.Equal("America/Sao_Paulo", result.TimeZone);
    }
}
