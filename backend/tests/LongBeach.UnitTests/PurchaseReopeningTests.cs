using LongBeach.Domain.Bar;
using LongBeach.Domain.Purchases;

namespace LongBeach.UnitTests;

public sealed class PurchaseReopeningTests
{
    private static readonly DateTimeOffset CorrectDate = new(2026, 3, 2, 12, 0, 0, TimeSpan.FromHours(-3));

    [Fact]
    public void Reopening_changes_only_date_state_and_version_and_preserves_last_cancellation()
    {
        var purchase = NewPurchase();
        var item = Assert.Single(purchase.Items);
        var identity = (purchase.Id, purchase.SupplierId, purchase.Document, purchase.ActorId);
        var terms = (purchase.Total, purchase.Freight, purchase.Discount, purchase.PaymentMethod, purchase.AccountReference);
        var itemSnapshot = (item.Id, item.ProductId, item.Quantity, item.PurchaseCost, item.PurchaseUnit, item.Conversion, item.LandedTotal);
        var canceledBy = Guid.NewGuid();
        purchase.Cancel("Data incorreta no cadastro", canceledBy);
        var version = purchase.Version;

        purchase.Reopen(CorrectDate);

        Assert.Equal("Ordered", purchase.State);
        Assert.Equal(CorrectDate.ToUniversalTime(), purchase.PurchasedAtUtc);
        Assert.Equal(TimeSpan.Zero, purchase.PurchasedAtUtc!.Value.Offset);
        Assert.Equal(version + 1, purchase.Version);
        Assert.Equal(identity, (purchase.Id, purchase.SupplierId, purchase.Document, purchase.ActorId));
        Assert.Equal(terms, (purchase.Total, purchase.Freight, purchase.Discount, purchase.PaymentMethod, purchase.AccountReference));
        Assert.Equal(itemSnapshot, (item.Id, item.ProductId, item.Quantity, item.PurchaseCost, item.PurchaseUnit, item.Conversion, item.LandedTotal));
        Assert.Equal(0m, item.Received);
        Assert.Equal(0m, item.CostReceived);
        Assert.Equal("Data incorreta no cadastro", purchase.CancellationReason);
        Assert.Equal(canceledBy, purchase.CanceledBy);
        Assert.Throws<BarRuleException>(() => purchase.Reopen(CorrectDate));
    }

    [Theory]
    [InlineData("Ordered")]
    [InlineData("PartiallyReceived")]
    [InlineData("Received")]
    public void Only_canceled_purchases_can_be_reopened(string state)
    {
        var purchase = NewPurchase();
        if (state != "Ordered")
        {
            purchase.Items.Single().Receive(state == "Received" ? 2 : 1);
            purchase.Receive();
        }
        var version = purchase.Version;
        var date = purchase.PurchasedAtUtc;

        Assert.Throws<BarRuleException>(() => purchase.Reopen(CorrectDate));
        Assert.Equal(state, purchase.State);
        Assert.Equal(date, purchase.PurchasedAtUtc);
        Assert.Equal(version, purchase.Version);
    }

    [Theory]
    [InlineData(12.34)]
    [InlineData(0)]
    public void Canceled_remaining_balance_cannot_reopen_after_any_receipt_even_with_zero_cost(decimal cost)
    {
        var purchase = NewPurchase(cost);
        purchase.Items.Single().Receive(1);
        purchase.Receive();
        purchase.Cancel("Saldo restante cancelado", Guid.NewGuid());
        var version = purchase.Version;

        Assert.Throws<BarRuleException>(() => purchase.Reopen(CorrectDate));
        Assert.Equal("Canceled", purchase.State);
        Assert.Equal(version, purchase.Version);
        Assert.Equal(1m, purchase.Items.Single().Received);
    }

    [Fact]
    public void Missing_date_does_not_change_the_canceled_purchase()
    {
        var purchase = NewPurchase();
        purchase.Cancel("Data incorreta", Guid.NewGuid());
        var date = purchase.PurchasedAtUtc;
        var version = purchase.Version;

        Assert.Throws<BarRuleException>(() => purchase.Reopen(default));
        Assert.Equal("Canceled", purchase.State);
        Assert.Equal(date, purchase.PurchasedAtUtc);
        Assert.Equal(version, purchase.Version);
    }

    private static Purchase NewPurchase(decimal cost = 12.34m)
    {
        var product = new BarProduct("TEST-PACK", "Produto fictício", "Teste", Guid.NewGuid(), "un", "cx", 6, 5, 0, 0, true, false, 0);
        var purchase = new Purchase(Guid.NewGuid(), "Documento fictício", Guid.NewGuid());
        purchase.Items.Add(new PurchaseItem(purchase.Id, product, 2, cost));
        purchase.Terms(cost == 0 ? 0 : 2, cost == 0 ? 0 : 1, "Pix", "Conta fictícia", CorrectDate.AddDays(3));
        return purchase;
    }
}
