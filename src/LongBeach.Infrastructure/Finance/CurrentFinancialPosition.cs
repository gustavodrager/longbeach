using System.Data;
using System.Globalization;
using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Billing;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Finance;

public sealed partial class FinancialHistoryService
{
    public async Task<CurrentFinancialPosition> CurrentPosition(CancellationToken ct)
    {
        await using var snapshot = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var readAt = time.GetUtcNow();
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(readAt, TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo")).DateTime);
        var records = await db.OperationalRecords.AsNoTracking().Where(x => x.Kind == "financeEntries").ToListAsync(ct);
        // Billing payments settle these same entries. They reduce the outstanding amount;
        // they are never added as a second source of income. Bar tabs have their own ledger.
        var payments = await (from payment in db.Set<BillingPayment>().AsNoTracking()
                              join account in db.Set<BillingAccount>().AsNoTracking() on payment.AccountId equals account.Id
                              join entry in db.OperationalRecords.AsNoTracking() on account.SourceId equals entry.Id
                              where account.Kind == "Quadra" && entry.Kind == "financeEntries"
                              select new { account.SourceId, payment.State, payment.Amount, payment.Refunded, ChangedAt = payment.UpdatedAtUtc ?? payment.CreatedAtUtc }).ToListAsync(ct);
        var paidByEntry = payments.Where(x => x.State is "Approved" or "Refunded").GroupBy(x => x.SourceId)
            .ToDictionary(x => x.Key, x => Cents(x.Sum(p => p.Amount - p.Refunded)));
        var entries = records.Select(record =>
        {
            using var json = JsonDocument.Parse(record.Payload);
            var row = json.RootElement;
            return new FinancialPositionEntry(row.GetProperty("direction").GetString()!, row.GetProperty("status").GetString()!,
                Cents(row.GetProperty("amount").GetDecimal()), DateOnly.ParseExact(row.GetProperty("dueDate").GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture),
                paidByEntry.GetValueOrDefault(record.Id));
        }).ToArray();
        var lastChange = records.Select(x => (DateTimeOffset?)(x.UpdatedAtUtc ?? x.CreatedAtUtc))
            .Concat(payments.Select(x => (DateTimeOffset?)x.ChangedAt)).Max();
        var details = entries.Zip(records).Where(x => CurrentFinancialPositionRules.Remaining(x.First) > 0)
            .Select(x => new OutstandingEntry(x.Second.Id, x.Second.Name, x.First.Direction, x.First.DueDate, x.First.AmountCents,
                CurrentFinancialPositionRules.AppliedPayments(x.First), CurrentFinancialPositionRules.Remaining(x.First)))
            .OrderBy(x => x.DueDate).ThenBy(x => x.Id).ToArray();
        var result = new CurrentFinancialPosition(today, readAt, lastChange, records.Count,
            CurrentFinancialPositionRules.Outstanding(entries, "Receber", today), CurrentFinancialPositionRules.Outstanding(entries, "Pagar", today),
            await C6CurrentBalance(ct), details);
        await snapshot.CommitAsync(ct);
        return result;
    }

    private static long Cents(decimal value) => checked((long)(value * 100m));
}
