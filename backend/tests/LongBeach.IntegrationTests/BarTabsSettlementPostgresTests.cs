using LongBeach.Contracts.Bar;
using LongBeach.Domain.Inventory;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.IntegrationTests;

public sealed partial class BarTabsPostgresTests
{
    [PostgresTheory]
    [InlineData("Cash", null)]
    [InlineData("TerminalManual", "Debit")]
    [InlineData("TerminalManual", "Credit")]
    [InlineData("TerminalManual", "Pix")]
    public async Task Full_manual_receipt_closes_delivered_tab_and_replays_without_duplicate_stock_or_history(string method, string? terminalType)
    {
        await using var f = await Fixture.Create();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        tab = await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 2)], true), f.Actor, null, default);
        var input = new TabPaymentInput(Guid.NewGuid(), method, 20, SessionId: method == "Cash" ? f.Session.Id : null, TerminalType: terminalType, TerminalApproved: true);
        var payment = await f.Tabs.Pay(tab.Id, input, f.Actor, null, default);
        Assert.Equal(payment.Id, (await f.Tabs.Pay(tab.Id, input, f.Actor, null, default)).Id);
        var result = await f.Tabs.Get(tab.Id, false, default);
        Assert.Equal("Closed", result.State); Assert.Equal(0, result.Due);
        Assert.Single(result.History, x => x.Kind == "Closed");
        Assert.Single(result.History, x => x.Kind == "PaymentApproved");
        Assert.Equal(18, (await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == f.Product.Id)).Quantity);
        Assert.Equal(1, await f.Db.Set<StockMovement>().CountAsync(x => x.OriginId == tab.Items.Single().Id && x.Kind == "TabDelivery"));
        Assert.Equal("Open", f.Session.State);
    }

    [PostgresTheory]
    [InlineData("Cash")]
    [InlineData("TerminalManual")]
    public async Task Prepared_paid_tab_waits_for_every_delivery_and_closes_on_last_one(string method)
    {
        await using var f = await Fixture.Create(); f.Product.SetPreparation(true); await f.Db.SaveChangesAsync();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        tab = await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1)]), f.Actor, null, default);
        tab = await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1)]), f.Actor, null, default);
        await f.Tabs.Pay(tab.Id, new(Guid.NewGuid(), method, 20, SessionId: method == "Cash" ? f.Session.Id : null, TerminalType: method == "TerminalManual" ? "Debit" : null, TerminalApproved: true), f.Actor, null, default);
        var paid = await f.Tabs.Get(tab.Id, false, default);
        Assert.Equal("Open", paid.State); Assert.Equal(20, paid.Paid); Assert.Equal(0, paid.Due);
        Assert.Equal(20, (await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == f.Product.Id)).Quantity);
        var first = await f.Tabs.ItemAction(tab.Id, tab.Items.First().Id, "fulfill", new(Guid.NewGuid()), f.Actor, false, default);
        Assert.Equal("Open", first.State);
        var operation = new TabActionInput(Guid.NewGuid());
        var last = await f.Tabs.ItemAction(tab.Id, tab.Items.Last().Id, "fulfill", operation, f.Actor, false, default);
        Assert.Equal("Closed", last.State);
        Assert.Equal("Closed", (await f.Tabs.ItemAction(tab.Id, tab.Items.Last().Id, "fulfill", operation, f.Actor, false, default)).State);
        Assert.Single(last.History, x => x.Kind == "Closed");
        Assert.Equal(18, (await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == f.Product.Id)).Quantity);
        Assert.Equal(2, await f.Db.Set<StockMovement>().CountAsync(x => (x.OriginId == tab.Items.First().Id || x.OriginId == tab.Items.Last().Id) && x.Kind == "TabDelivery"));
    }
}
