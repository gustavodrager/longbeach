using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Cash;
namespace LongBeach.UnitTests;
public sealed class BarRulesTests
{
    [Theory]
    [InlineData(-1)] [InlineData(1.001)]
    public void Money_rejects_negative_or_fractional_cents(decimal value) => Assert.Throws<BarRuleException>(() => BarRules.Money(value));
    [Fact]
    public void Conversion_factor_must_be_positive() => Assert.Throws<BarRuleException>(() => Product(0));
    [Fact]
    public void Concurrent_reservation_cannot_oversell()
    {
        var b = new StockBalance(Guid.NewGuid(), Guid.NewGuid()); b.Move(5); b.Reserve(3);
        Assert.Throws<BarRuleException>(() => b.Move(-3)); Assert.Throws<BarRuleException>(() => b.Reserve(3));
        Assert.Equal(5, b.Quantity); Assert.Equal(2, b.Available);
    }
    [Fact]
    public void Movement_records_origin_actor_and_balance()
    {
        var b = new StockBalance(Guid.NewGuid(), Guid.NewGuid()); b.Move(10); var actor = Guid.NewGuid(); var origin = Guid.NewGuid();
        var m = new StockMovement(b, -2, 6, "Loss", "Quebra", origin, actor);
        Assert.Equal(10, m.Before); Assert.Equal(8, m.After); Assert.Equal(actor, m.ActorId); Assert.Equal(origin, m.OriginId);
    }
    [Fact]
    public void Loss_requires_reason() => Assert.Throws<BarRuleException>(() => new StockMovement(new StockBalance(Guid.NewGuid(), Guid.NewGuid()), 1, 0, "Loss", "", Guid.NewGuid(), Guid.NewGuid()));
    [Fact]
    public void Cash_difference_requires_supervisor_and_justification()
    {
        var s = new CashSession(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "tablet", 100);
        Assert.Throws<BarRuleException>(() => new CashClosing(s, 90, "", Guid.NewGuid(), true));
        Assert.Throws<BarRuleException>(() => new CashClosing(s, 90, "Falta física", Guid.NewGuid(), false));
        Assert.Equal("Open", s.State);
        var close = new CashClosing(s, 90, "Falta física", Guid.NewGuid(), true);
        Assert.Equal(-10, close.Difference); Assert.Throws<BarRuleException>(() => s.Move(1));
    }
    [Fact]
    public void Inventory_requires_complete_count_and_becomes_immutable()
    {
        var c = new InventoryCount(Guid.NewGuid(), true, Guid.NewGuid()); var p = Guid.NewGuid(); c.Items.Add(new InventoryCountItem(c.Id, p, 0, 0, 6));
        Assert.Throws<BarRuleException>(() => c.Approve(Guid.NewGuid(), "Contagem física")); c.Count(p, 10); c.Approve(Guid.NewGuid(), "Contagem física");
        Assert.Throws<BarRuleException>(() => c.Count(p, 11)); Assert.Throws<BarRuleException>(() => c.Approve(Guid.NewGuid(), "repetido"));
    }
    [Fact]
    public void Weighted_cost_uses_received_quantity()
    { var p = Product(24); p.ReceiveCost(10, 10, 8); Assert.Equal(7, p.AverageCost); Assert.Equal(8, p.LastCost); }
    private static BarProduct Product(decimal conversion) => new("AGUA", "Água", "Água", Guid.NewGuid(), "un", "cx", conversion, 10, 6, 10, true, false, 0);
}
