using LongBeach.Domain.Bar;

namespace LongBeach.UnitTests;

public sealed class BarProductCostTests
{
    [Theory]
    [InlineData(-10, 3)]
    [InlineData(-10, 10)]
    [InlineData(-10, 15)]
    [InlineData(0, 5)]
    public void Receipt_without_positive_stock_uses_the_received_unit_cost(decimal currentQuantity, decimal received)
    {
        var product = Product();
        var version = product.Version;

        product.ReceiveCost(currentQuantity, received, 2m);

        Assert.Equal(2m, product.AverageCost);
        Assert.Equal(2m, product.LastCost);
        Assert.Equal(version + 1, product.Version);
    }

    [Fact]
    public void Successive_receipts_start_weighting_only_after_stock_becomes_positive()
    {
        var product = Product();
        var version = product.Version;

        product.ReceiveCost(-10m, 3m, 2m);
        Assert.Equal(2m, product.AverageCost);
        product.ReceiveCost(-7m, 7m, 4m);
        Assert.Equal(4m, product.AverageCost);
        product.ReceiveCost(0m, 2m, 6m);
        Assert.Equal(6m, product.AverageCost);
        product.ReceiveCost(2m, 2m, 10m);

        Assert.Equal(8m, product.AverageCost);
        Assert.Equal(10m, product.LastCost);
        Assert.Equal(version + 4, product.Version);
    }

    [Fact]
    public void Positive_stock_keeps_the_weighted_average_with_six_decimal_places()
    {
        var product = Product();

        product.ReceiveCost(2m, 1m, 1m);

        Assert.Equal(4.333333m, product.AverageCost);
        Assert.Equal(1m, product.LastCost);
    }

    [Theory]
    [InlineData(0, 2)]
    [InlineData(-1, 2)]
    [InlineData(0.0001, 2)]
    [InlineData(100000000, 2)]
    [InlineData(1, -1)]
    [InlineData(1, 0.0000001)]
    [InlineData(1, 100000000)]
    public void Invalid_receipt_does_not_change_cost_or_version(decimal received, decimal unitCost)
    {
        var product = Product();
        product.ReceiveCost(0m, 1m, 4m);
        var before = (product.AverageCost, product.LastCost, product.Version);

        Assert.Throws<BarRuleException>(() => product.ReceiveCost(-5m, received, unitCost));

        Assert.Equal(before, (product.AverageCost, product.LastCost, product.Version));
    }

    [Fact]
    public void Calculated_cost_is_validated_before_mutating_any_product_field()
    {
        var product = Product();
        // Represents a legacy catalog value persisted by the old negative-stock formula.
        typeof(BarProduct).GetProperty(nameof(BarProduct.AverageCost))!.SetValue(product, -20m);
        var before = (product.AverageCost, product.LastCost, product.Version);

        Assert.Throws<BarRuleException>(() => product.ReceiveCost(10m, 1m, 2m));

        Assert.Equal(before, (product.AverageCost, product.LastCost, product.Version));
    }

    [Fact]
    public void Positive_weighted_result_does_not_hide_an_invalid_existing_cost()
    {
        var product = Product();
        typeof(BarProduct).GetProperty(nameof(BarProduct.AverageCost))!.SetValue(product, -6m);
        var before = (product.AverageCost, product.LastCost, product.Version);

        // The result would be positive, but the existing stock valuation is invalid.
        Assert.Throws<BarRuleException>(() => product.ReceiveCost(1m, 10m, 2m));

        Assert.Equal(before, (product.AverageCost, product.LastCost, product.Version));
    }

    private static BarProduct Product() => new("COST", "Produto", "Produto", Guid.NewGuid(),
        "un", "un", 1m, 8m, 6m, 0m, true, false, 0);
}
