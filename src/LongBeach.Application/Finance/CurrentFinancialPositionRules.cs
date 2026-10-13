using LongBeach.Contracts.Finance;

namespace LongBeach.Application.Finance;

public sealed record FinancialPositionEntry(string Direction, string Status, long AmountCents, DateOnly DueDate, long ConfirmedPaymentsCents = 0);

public static class CurrentFinancialPositionRules
{
    public static long AppliedPayments(FinancialPositionEntry entry) => entry.Direction == "Receber" ? Math.Clamp(entry.ConfirmedPaymentsCents, 0, entry.AmountCents) : 0;
    public static long Remaining(FinancialPositionEntry entry) => entry.Status == "Pendente" ? entry.AmountCents - AppliedPayments(entry) : 0;

    public static OutstandingAccounts Outstanding(IEnumerable<FinancialPositionEntry> entries, string direction, DateOnly today)
    {
        var pending = entries.Where(x => x.Direction == direction && x.Status == "Pendente")
            .Select(x => new { Entry = x, Paid = AppliedPayments(x), Remaining = Remaining(x) }).ToArray();
        var owing = pending.Where(x => x.Remaining > 0).ToArray();
        var overdue = owing.Where(x => x.Entry.DueDate < today).ToArray();
        return new(owing.Sum(x => x.Remaining), owing.Length, overdue.Sum(x => x.Remaining), overdue.Length, owing.Sum(x => x.Paid));
    }
}
