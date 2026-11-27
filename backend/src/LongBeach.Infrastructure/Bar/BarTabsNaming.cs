using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;

namespace LongBeach.Infrastructure.Bar;

public sealed partial class BarTabsService
{
    public Task<TabResponse> Rename(Guid id, TabNameInput input, Guid actor, CancellationToken ct) =>
        Run(input.OperationId, Hash(new { action = "rename", id, input, actor }), async () =>
        {
            var tab = await Lock(id, ct);
            tab.EnsureOpen();
            if (tab.Version != input.ExpectedVersion)
                throw new BarRuleException("A comanda mudou. Atualize antes de alterar o nome.", 409);

            var version = tab.Version;
            tab.Rename(input.Name);
            if (tab.Version != version)
                db.Add(new BarTabHistory(id, "NameChanged", actor));

            await db.SaveChangesAsync(ct);
            return await Public(tab, false, false, ct);
        }, ct);
}
