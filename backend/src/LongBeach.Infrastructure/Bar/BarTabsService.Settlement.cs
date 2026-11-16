using LongBeach.Domain.Bar;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Bar;

public sealed partial class BarTabsService
{
    private async Task AutoClosePaidTab(BarTab tab, CancellationToken ct)
    {
        if (tab.State != "Open" || !await db.Set<BarTabPayment>().AnyAsync(x => x.TabId == tab.Id && x.State == "Approved", ct)) return;
        var totals = await Totals(tab.Id, ct);
        var unfinished = await db.Set<BarTabItem>().AnyAsync(x => x.TabId == tab.Id && (x.State == "Requested" || x.State == "Accepted"), ct)
            || await db.Set<BarTabRefund>().AnyAsync(x => x.TabId == tab.Id && x.State == "Pending", ct);
        if (totals.Due != 0 || totals.Pending != 0 || unfinished) return;
        tab.Close(totals.Due, totals.Pending, false, time.GetUtcNow());
        db.Add(new BarTabHistory(tab.Id, "Closed", null, reason: "Encerramento automático após pagamento e entrega."));
        await db.SaveChangesAsync(ct);
    }
}
