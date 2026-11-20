using System.Text.Json;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Operations;
using LongBeach.Domain.Payments;
using LongBeach.Infrastructure.Overview;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.IntegrationTests;

public sealed class OwnerOverviewPostgresTests
{
    [PostgresFact]
    public async Task Snapshot_reads_current_agreements_and_competence_settlement_once_without_changing_rows()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context; var clock = new FixedClock();
        var studentId = Guid.NewGuid(); var classId = Guid.NewGuid(); var enrollmentId = Guid.NewGuid(); var rentalId = Guid.NewGuid(); var monthId = Guid.NewGuid();
        var student = Row(studentId, "students", new { name = "Aluno sintético", monthlyAmount = 99999 });
        var lesson = Row(classId, "classes", new { status = "Ativa", weekDay = 1, startDate = "2026-10-01" });
        var enrollment = Row(enrollmentId, "enrollments", new { status = "Ativa", studentId, classId, startDate = "2026-10-01", monthlyAmount = 100 });
        var rental = Row(rentalId, "rentalGroups", new { status = "Ativo", startDate = "2026-10-01", weekDay = 2, monthlyAmount = 500 });
        var month = Row(monthId, "rentalMonths", new { rentalGroupId = rentalId, month = "2026-10", amount = 550 });
        var schoolCharge = Row(Guid.NewGuid(), "financeEntries", new { direction = "Receber", origin = "Escola", sourceKind = "enrollments", sourceId = enrollmentId, month = "2026-10", amount = 100, status = "Pago", paidDate = "2026-11-10", dueDate = "2026-10-10" });
        var rentalCharge = Row(Guid.NewGuid(), "financeEntries", new { direction = "Receber", origin = "Locações", sourceKind = "rentalMonths", sourceId = monthId, month = "2026-10", amount = 550, status = "Pago", paidDate = "2026-11-10", dueDate = "2026-10-10" });
        var trialId = Guid.NewGuid(); var trial = Row(trialId, "reservations", new { activityKind = "Trial", status = "Cancelada", amount = 99999 });
        var trialCharge = Row(Guid.NewGuid(), "financeEntries", new { direction = "Receber", origin = "Locações", sourceKind = "reservations", sourceId = trialId, amount = 40, status = "Pendente", dueDate = "2026-10-12" });
        var secondTrialCharge = Row(Guid.NewGuid(), "financeEntries", new { direction = "Receber", origin = "Locações", sourceKind = "reservations", sourceId = trialId, amount = 15, status = "Pago", dueDate = "2026-10-12", paidDate = "2026-11-10" });
        var user = User.Create("Responsável sintético", "owner-overview@example.invalid", "synthetic-hash");
        var account = new BillingAccount("Quadra", schoolCharge.Id, user.Id, studentId, user.Id);
        var payment = new BillingPayment(account.Id, Guid.NewGuid(), 100, "CreditCard", user.Id, clock.GetUtcNow().AddHours(1));
        payment.Observe("PAID", 25, clock.GetUtcNow().AddDays(-1));
        var trialAccount = new BillingAccount("Quadra", trialCharge.Id, user.Id, null, user.Id);
        var trialPayment = new BillingPayment(trialAccount.Id, Guid.NewGuid(), 20, "Pix", user.Id, clock.GetUtcNow().AddHours(1));
        trialPayment.Observe("PAID", 5, clock.GetUtcNow().AddDays(-1));
        // A Bar account must never be added to the settlement of a court charge.
        var unrelatedBarAccount = new BillingAccount("Bar", schoolCharge.Id, user.Id, null, user.Id);
        var unrelatedPayment = new BillingPayment(unrelatedBarAccount.Id, Guid.NewGuid(), 100, "Pix", user.Id, clock.GetUtcNow().AddHours(1));
        unrelatedPayment.Observe("PAID", 0, clock.GetUtcNow().AddDays(-1));
        db.AddRange(student, lesson, enrollment, rental, month, schoolCharge, rentalCharge, trial, trialCharge, secondTrialCharge,
            user, account, payment, trialAccount, trialPayment, unrelatedBarAccount, unrelatedPayment);
        await db.SaveChangesAsync();
        var before = await db.OperationalRecords.AsNoTracking().OrderBy(x => x.Id).Select(x => x.Payload).ToArrayAsync();
        var service = new OwnerOverviewService(db, clock);
        var result = await service.Read("2026-10", default);
        Assert.Equal(1, result.School.ActiveStudents); Assert.Equal(10000, result.School.KnownMonthlyCents); Assert.Equal(50000, result.Rentals.KnownMonthlyCents);
        Assert.Equal(10000, result.Finance.School.BilledCents); Assert.Equal(7500, result.Finance.School.ReceivedCents); Assert.Equal(2500, result.Finance.School.OutstandingCents);
        Assert.Equal(2500, result.Finance.School.OverdueCents); Assert.Equal(1, result.Finance.School.OverdueChargeCount);
        Assert.Equal(55000, result.Finance.Rentals.BilledCents); Assert.Equal(55000, result.Finance.Rentals.ReceivedCents);
        Assert.Equal(5500, result.Finance.OtherSchool.BilledCents); Assert.Equal(3000, result.Finance.OtherSchool.ReceivedCents); Assert.Equal(2500, result.Finance.OtherSchool.OverdueCents);
        Assert.Equal(2, result.Finance.OtherSchool.ChargeCount); Assert.Equal("due-date", result.Finance.OtherSchool.Basis);
        Assert.Equal(new DateOnly(2026, 11, 20), result.AsOfDate); Assert.Equal(0, result.Finance.Bar.NetReceivedCents);
        Assert.Equal(before, await db.OperationalRecords.AsNoTracking().OrderBy(x => x.Id).Select(x => x.Payload).ToArrayAsync());
        Assert.False(db.ChangeTracker.HasChanges()); Assert.Null(db.Database.CurrentTransaction); Assert.False(db.Database.HasPendingModelChanges());
    }

    [PostgresFact]
    public async Task Bar_receipts_and_refunds_follow_confirmation_dates_independently_of_the_original_tab()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context; var clock = new FixedClock();
        var user = User.Create("Operador sintético", "overview-bar@example.invalid", "synthetic-hash");
        var location = new StockLocation("Local sintético"); var tab = new BarTab(location.Id, user.Id, "Comanda sintética", "Tab");
        var register = new CashRegister("Caixa sintético"); var session = new CashSession(register.Id, location.Id, user.Id, "Dispositivo sintético", 0);
        var paid = new BarTabPayment(tab.Id, Guid.NewGuid(), "synthetic-payment", 100, "Cash", user.Id, session.Id, null, null);
        paid.ConfirmManual(new(2026, 10, 20, 12, 0, 0, TimeSpan.Zero)); paid.Refund(25);
        var refund = new BarTabRefund(tab.Id, paid.Id, Guid.NewGuid(), "synthetic-refund", 25, "Estorno sintético", user.Id);
        refund.Confirm(new(2026, 11, 10, 12, 0, 0, TimeSpan.Zero));
        var novemberPaid = new BarTabPayment(tab.Id, Guid.NewGuid(), "synthetic-november", 40, "Cash", user.Id, session.Id, null, null);
        novemberPaid.ConfirmManual(new(2026, 11, 1, 3, 0, 0, TimeSpan.Zero));
        var saleId = Guid.NewGuid(); var legacyPaid = new BarEvent("SalePaid", saleId, 60); var legacyRefund = new BarEvent("SaleRefunded", saleId, -60);
        legacyPaid.MarkCreated(new(2026, 10, 20, 12, 0, 0, TimeSpan.Zero)); legacyRefund.MarkCreated(new(2026, 11, 10, 12, 0, 0, TimeSpan.Zero));
        db.AddRange(user, location, tab, register, session, paid, refund, novemberPaid, legacyPaid, legacyRefund); await db.SaveChangesAsync();
        var service = new OwnerOverviewService(db, clock);
        var october = await service.Read("2026-10", default); var november = await service.Read("2026-11", default);
        Assert.Equal(10000, october.Finance.Bar.GrossReceivedCents); Assert.Equal(0, october.Finance.Bar.RefundsCents);
        Assert.Equal(4000, november.Finance.Bar.GrossReceivedCents); Assert.Equal(2500, november.Finance.Bar.RefundsCents); Assert.Equal(1500, november.Finance.Bar.NetReceivedCents);
        Assert.Equal(6000, october.Finance.BarLegacy.GrossReceivedCents); Assert.Equal(0, october.Finance.BarLegacy.RefundsCents);
        Assert.Equal(0, november.Finance.BarLegacy.GrossReceivedCents); Assert.Equal(6000, november.Finance.BarLegacy.RefundsCents); Assert.Equal(-6000, november.Finance.BarLegacy.NetReceivedCents);
        Assert.Equal(2, await db.Set<BarTabPayment>().CountAsync()); Assert.Equal(1, await db.Set<BarTabRefund>().CountAsync()); Assert.False(db.ChangeTracker.HasChanges());
    }

    private static OperationalRecord Row(Guid id, string kind, object payload) => new(id, kind, "Registro sintético", JsonSerializer.Serialize(payload));
    private sealed class FixedClock : TimeProvider { public override DateTimeOffset GetUtcNow() => new(2026, 11, 20, 12, 0, 0, TimeSpan.Zero); }
}
