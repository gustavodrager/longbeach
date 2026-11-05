using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Bar;

public sealed partial class BarTabsService
{
    public Task<TabResponse> Cancel(Guid id, TabCancelInput input, Guid actor, CancellationToken ct) =>
        Run(input.OperationId, Hash(new { action = "cancel", id, input, actor }), async () =>
        {
            var reason = BarRules.Text(input.Reason, 450, "Motivo do cancelamento");
            if (reason.Length < 3) throw new BarRuleException("Informe um motivo de cancelamento com pelo menos 3 caracteres.");
            if (actor == Guid.Empty) throw new BarRuleException("Responsável pelo cancelamento obrigatório.");
            var tab = await Lock(id, ct);
            if (tab.State != "Open") throw new BarRuleException("Esta comanda já foi encerrada ou cancelada.", 409);
            if (input.ExpectedVersion != tab.Version) throw new BarRuleException("A comanda mudou. Atualize antes de cancelar.", 409);
            var items = await db.Set<BarTabItem>().Where(x => x.TabId == id).OrderBy(x => x.Id).ToListAsync(ct);
            var payments = await db.Set<BarTabPayment>().AsNoTracking().Where(x => x.TabId == id).ToListAsync(ct);
            // Check all financial and delivery conditions before changing any
            // item, concession, reservation, token or history entry.
            if (payments.Any(x => x.State == "Pending"))
                throw new BarRuleException("Resolva os pagamentos pendentes antes de cancelar a comanda.", 409);
            if (await db.Set<BarTabRefund>().AnyAsync(x => x.TabId == id && x.State == "Pending", ct))
                throw new BarRuleException("Aguarde a confirmação dos estornos antes de cancelar a comanda.", 409);
            if (payments.Any(x => x.State == "Approved" && x.Amount > x.Refunded))
                throw new BarRuleException("Estorne os valores recebidos antes de cancelar a comanda.", 409);

            foreach (var item in items)
            {
                if (item.State == "Requested")
                {
                    item.Reject(reason);
                    db.Add(new BarTabHistory(id, "Rejected", actor, reason: item.Reason, itemId: item.Id));
                }
                else if (item.State is "Accepted" or "Fulfilled")
                {
                    var previous = item.State;
                    item.Reverse(reason, false);
                    // Delivered products remain physically consumed. Only an
                    // existing acceptance reservation is released here.
                    if (previous == "Accepted") await RecipeStock(tab, item, "release", actor, ct);
                    db.Add(new BarTabHistory(id, "Reversed", actor, -item.Total, item.Reason, item.Id));
                }
            }
            var concession = tab.Discount;
            tab.Cancel(reason, time.GetUtcNow());
            if (concession > 0) db.Add(new BarTabHistory(id, "ConcessionVoided", actor, -concession, reason));
            foreach (var access in await db.Set<BarTabAccess>().Where(x => x.TabId == id && !x.Revoked).ToListAsync(ct)) access.Revoke();
            db.Add(new BarTabHistory(id, "Cancelled", actor, reason: reason));
            await db.SaveChangesAsync(ct);
            return await Public(tab, false, false, ct, supervisor: true);
        }, ct);
}
