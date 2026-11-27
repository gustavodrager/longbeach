using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Bar;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.IntegrationTests;

public sealed partial class BarTabsPostgresTests
{
    [PostgresFact]
    public async Task Purchase_received_over_negative_stock_allows_direct_sale_and_idempotent_replay()
    {
        await using var f = await Fixture.Create();
        var earlierTab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        await f.Tabs.Add(earlierTab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 25)], true), f.Actor, null, default);
        Assert.Equal(-5m, (await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == f.Product.Id)).Quantity);

        var purchases = new BarPurchasesService(f.Db);
        var supplier = await purchases.CreateSupplier("Fornecedor sintético de custo", default);
        var purchase = await purchases.Create(new(supplier.Id, "Reposição sintética",
            [new(f.Product.Id, 10, 0.50m)]), f.Actor, default);
        await purchases.Receive(purchase.Id, new(f.Location.Id, Guid.NewGuid(), [new(f.Product.Id, 10)]), f.Actor, default);
        f.Db.ChangeTracker.Clear();

        // The old formula persisted cost -1 here, then CK_bar_tab_items rejected this sale.
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var tap = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1)], true, true, 10m);
        var first = await f.Tabs.Add(tab.Id, tap, f.Actor, null, default);
        var replay = await f.Tabs.Add(tab.Id, tap, f.Actor, null, default);
        var item = Assert.Single(replay.Items);
        Assert.Equal(Assert.Single(first.Items).Id, item.Id);
        Assert.Equal("Fulfilled", item.State);
        Assert.Equal(1m, item.Quantity);
        Assert.Equal(10m, replay.Total);

        f.Db.ChangeTracker.Clear();
        var product = await f.Db.Set<BarProduct>().SingleAsync(x => x.Id == f.Product.Id);
        Assert.Equal(0.50m, product.AverageCost);
        Assert.Equal(0.50m, product.LastCost);
        Assert.Equal(0.50m, (await f.Db.Set<BarTabItem>().SingleAsync(x => x.TabId == tab.Id)).UnitCost);
        var balance = await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == f.Product.Id);
        Assert.Equal(4m, balance.Quantity);
        Assert.Equal(0m, balance.Reserved);
        var movement = Assert.Single(await f.Db.Set<StockMovement>()
            .Where(x => x.OriginId == item.Id && x.Kind == "TabDelivery").ToListAsync());
        Assert.Equal(-1m, movement.Quantity);
        Assert.Equal(0.50m, movement.UnitCost);
        Assert.Equal(1, await f.Db.Set<BarTabOperation>().CountAsync(x => x.Id == tap.OperationId));
    }
}
