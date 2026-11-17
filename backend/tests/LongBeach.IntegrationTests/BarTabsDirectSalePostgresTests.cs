using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.IntegrationTests;

public sealed partial class BarTabsPostgresTests
{
    [PostgresFact]
    public async Task Direct_taps_deliver_prepared_products_in_regular_tab_and_replay_after_payment_closes_tab()
    {
        await using var f = await Fixture.Create(); f.Product.SetPreparation(true); await f.Db.SaveChangesAsync();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var first = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1)], true, true, 10);
        var second = first with { OperationId = Guid.NewGuid() };
        tab = await f.Tabs.Add(tab.Id, first, f.Actor, null, default);
        Assert.Equal("Fulfilled", Assert.Single(tab.Items).State);
        tab = await f.Tabs.Add(tab.Id, second, f.Actor, null, default);
        Assert.Equal(2, tab.Items.Count); Assert.Equal(20, tab.Total);
        Assert.All(tab.Items, item => Assert.Equal("Fulfilled", item.State));
        Assert.Equal(18, (await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == f.Product.Id)).Quantity);
        await f.Tabs.Pay(tab.Id, new(Guid.NewGuid(), "Cash", 20, f.Session.Id), f.Actor, null, default);
        Assert.Equal("Closed", (await f.Tabs.Get(tab.Id, false, default)).State);
        Assert.Equal("Closed", (await f.Tabs.Add(tab.Id, first, f.Actor, null, default)).State);
        Assert.True((await f.Db.Set<BarTabOperation>().SingleAsync(x => x.Id == first.OperationId)).ResponseJson.Length < 100);
        var final = await f.Tabs.Get(tab.Id, false, default);
        Assert.Equal(2, final.Items.Count); Assert.Single(final.History, x => x.Kind == "Closed");
        Assert.Equal(2, await f.Db.Set<StockMovement>().CountAsync(x => x.Kind == "TabDelivery" && final.Items.Select(i => i.Id).Contains(x.OriginId)));
    }

    [PostgresFact]
    public async Task Direct_sale_rejects_changed_price_without_item_or_stock_side_effects()
    {
        await using var f = await Fixture.Create(); var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var input = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1)], true, true, 9);
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Add(tab.Id, input, f.Actor, null, default));
        Assert.Empty((await f.Tabs.Get(tab.Id, false, default)).Items);
        Assert.Equal(20, (await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == f.Product.Id)).Quantity);
        Assert.Equal(0, (await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == f.Product.Id)).Reserved);
        tab = await f.Tabs.Add(tab.Id, input with { ExpectedUnitPrice = 10 }, f.Actor, null, default);
        Assert.Single(tab.Items); Assert.Equal(10, tab.Total);
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Add(tab.Id, input, f.Actor, null, default));
    }

    [PostgresFact]
    public async Task Self_service_cannot_claim_direct_delivery_and_a_tap_requires_exactly_one_unit()
    {
        await using var f = await Fixture.Create(); var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var access = await f.Tabs.IssueAccess(tab.Id, new(Guid.NewGuid()), f.Actor, default);
        var input = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1)], true, true, 10);
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Add(tab.Id, input, null, access.Token, default));
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Add(tab.Id, input with { Items = [new(f.Product.Id, 2)] }, f.Actor, null, default));
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Add(tab.Id, input with { Deliver = false }, f.Actor, null, default));
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Add(tab.Id, input with { ExpectedUnitPrice = null }, f.Actor, null, default));
        Assert.Empty((await f.Tabs.Get(tab.Id, false, default)).Items);
    }
    [PostgresFact]
    public async Task Legacy_note_bearing_cart_keeps_its_original_fingerprint_after_direct_sale_upgrade()
    {
        await using var f = await Fixture.Create(); var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var input = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1, "Sem gelo")], true);
        var legacy = new { action = "add", id = tab.Id, input = new { input.OperationId, input.Items, input.Deliver }, scope = f.Actor.ToString() };
        var expected = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(legacy, new JsonSerializerOptions(JsonSerializerDefaults.Web)))));
        tab = await f.Tabs.Add(tab.Id, input, f.Actor, null, default);
        Assert.Equal(expected, (await f.Db.Set<BarTabOperation>().SingleAsync(x => x.Id == input.OperationId)).Fingerprint);
        Assert.Single((await f.Tabs.Add(tab.Id, input, f.Actor, null, default)).Items);
        Assert.Equal("Sem gelo", Assert.Single(tab.Items).Notes);
    }

}
