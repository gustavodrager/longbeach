using System.Data;
using LongBeach.Application.Overview;
using LongBeach.Contracts.Overview;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Payments;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Overview;

public sealed class OwnerOverviewService(LongBeachDbContext db, TimeProvider clock) : IOwnerOverview
{
    public async Task<OwnerOverviewResponse> Read(string? month, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var first = OwnerOverviewRules.Month(month, now);
        var (from, to) = OwnerOverviewRules.Period(first);
        await using var snapshot = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY", ct);

        string[] kinds = ["students", "classes", "enrollments", "rentalGroups", "rentalMonths", "reservations", "projects", "maintenance", "financeEntries"];
        var records = await db.OperationalRecords.AsNoTracking().Where(x => kinds.Contains(x.Kind))
            .Select(x => new OwnerOverviewRecord(x.Id, x.Kind, x.Payload)).ToArrayAsync(ct);
        // Billing payments settle the same operational charge, not a second revenue source.
        var settlements = await (from payment in db.Set<BillingPayment>().AsNoTracking()
                                 join account in db.Set<BillingAccount>().AsNoTracking() on payment.AccountId equals account.Id
                                 join entry in db.OperationalRecords.AsNoTracking() on account.SourceId equals entry.Id
                                 where account.Kind == "Quadra" && entry.Kind == "financeEntries"
                                 select new OwnerOverviewSettlement(entry.Id, payment.State, payment.Amount, payment.Refunded, payment.PaidAtUtc)).ToArrayAsync(ct);
        // Missing confirmation dates are read only to report incomplete records. Their
        // amounts never enter a month. The ledger's dates, not the tab opening date, apply.
        var items = await db.Set<BarTabItem>().AsNoTracking()
            .Where(x => (x.State == "Accepted" || x.State == "Fulfilled") &&
                (x.AcceptedAtUtc == null || x.AcceptedAtUtc >= from && x.AcceptedAtUtc < to))
            .Select(x => new OwnerOverviewBarItem(x.State, x.Total, x.AcceptedAtUtc)).ToArrayAsync(ct);
        var payments = await db.Set<BarTabPayment>().AsNoTracking()
            .Where(x => x.State == "Approved" && (x.ConfirmedAtUtc == null || x.ConfirmedAtUtc >= from && x.ConfirmedAtUtc < to))
            .Select(x => new OwnerOverviewBarPayment(x.State, x.Amount, x.ConfirmedAtUtc)).ToArrayAsync(ct);
        var refunds = await db.Set<BarTabRefund>().AsNoTracking()
            .Where(x => x.State == "Confirmed" && (x.ConfirmedAtUtc == null || x.ConfirmedAtUtc >= from && x.ConfirmedAtUtc < to))
            .Select(x => new OwnerOverviewBarRefund(x.State, x.Amount, x.ConfirmedAtUtc)).ToArrayAsync(ct);
        var legacyEvents = await db.Set<BarEvent>().AsNoTracking()
            .Where(x => (x.Name == "SalePaid" || x.Name == "SaleRefunded") && x.CreatedAtUtc >= from && x.CreatedAtUtc < to)
            .Select(x => new OwnerOverviewLegacyBarEvent(x.Name, x.Amount, x.CreatedAtUtc)).ToArrayAsync(ct);
        var result = OwnerOverviewRules.Summarize(new(records, settlements, items, payments, refunds, legacyEvents), month, now);
        await snapshot.CommitAsync(ct);
        return result;
    }
}
