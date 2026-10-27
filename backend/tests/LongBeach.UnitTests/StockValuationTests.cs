using LongBeach.Application.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;

namespace LongBeach.UnitTests;

public sealed class StockValuationTests
{
    [Fact]
    public void Physical_cost_and_available_sale_use_distinct_bases_without_inventing_profit()
    {
        var location = new StockLocation("Bar"); var other = new StockLocation("Warehouse");
        var beverage = Product("Drink", 15, 6); var ingredient = Product("Ingredient", 0, 20, "kg");
        var missing = Product("Unknown", 5, 0); var incomplete = Product("Mixed", 8, 3);
        var balances = new[] { Balance(beverage, location, 10, 2), Balance(ingredient, location, .5m), Balance(missing, location, 4), Balance(incomplete, location, 8), Balance(beverage, other, 100) };
        var result = StockValuationRules.Calculate(location, DateTimeOffset.UtcNow, balances,
            new[] { beverage, ingredient, missing, incomplete }.ToDictionary(p => p.Id), new HashSet<Guid> { incomplete.Id });
        Assert.Equal(94m, result.StockCost); // 60 physical beverage + 10 ingredient + 24 incomplete registered cost.
        Assert.Equal(204m, result.SalePotential); // 8*15 + 4*5 + 8*8, excluding two reserved units.
        Assert.Equal(120m, result.ComparableSalePotential); Assert.Equal(48m, result.ComparableCost);
        Assert.Equal(72m, result.GrossProfit); Assert.Equal(60m, result.GrossMarginPercent);
        Assert.Equal(1, result.MissingCostProducts); Assert.Equal(1, result.IncompleteCostProducts);
        Assert.Equal(1, result.ExcludedSaleProducts); Assert.Equal(4, result.Rows.Count);
        Assert.Null(result.Rows.Single(r => r.ProductId == missing.Id).StockCost);
        Assert.Null(result.Rows.Single(r => r.ProductId == incomplete.Id).GrossProfit);
        Assert.Null(result.Rows.Single(r => r.ProductId == ingredient.Id).SalePotential);
    }

    [Fact]
    public void Inactive_prepared_and_untracked_products_do_not_inflate_sale_potential()
    {
        var location = new StockLocation("Bar"); var inactive = Product("Inactive", 10, 5);
        inactive.Change(inactive.Name, inactive.Name, inactive.CategoryId, "un", "un", 1, 10, 5, 0, true, false, 0, false);
        var prepared = Product("Prepared", 20, 4); prepared.SetPreparation(true);
        var untracked = new BarProduct("NoStock", "NoStock", "NoStock", Guid.NewGuid(), "un", "un", 1, 30, 6, 0, false, false, 0);
        var products = new[] { inactive, prepared, untracked };
        var result = StockValuationRules.Calculate(location, DateTimeOffset.UtcNow, products.Select(p => Balance(p, location, 2)).ToArray(), products.ToDictionary(p => p.Id), new HashSet<Guid>());
        Assert.Equal(30m, result.StockCost); Assert.Equal(0m, result.SalePotential); Assert.Equal(0m, result.GrossProfit);
        Assert.Null(result.GrossMarginPercent); Assert.Equal(3, result.ExcludedSaleProducts);
    }

    [Fact]
    public void Missing_cost_does_not_mean_zero_profit_and_negative_margin_is_preserved()
    {
        var location = new StockLocation("Bar"); var product = Product("Drink", 5, 0);
        var balance = Balance(product, location, 2); var products = new Dictionary<Guid, BarProduct> { [product.Id] = product };
        var result = StockValuationRules.Calculate(location, DateTimeOffset.UtcNow, [balance], products, new HashSet<Guid>());
        Assert.Null(result.GrossProfit); Assert.Null(result.GrossMarginPercent); Assert.Equal(10m, result.SalePotential);
        product.Change(product.Name, product.Name, product.CategoryId, "un", "un", 1, 5, 6, 0, true, false, 0, true);
        result = StockValuationRules.Calculate(location, DateTimeOffset.UtcNow, [balance], products, new HashSet<Guid>());
        Assert.Equal(-2m, result.GrossProfit); Assert.Equal(-20m, result.GrossMarginPercent);
    }

    [Fact]
    public void Converted_pack_cost_is_rounded_after_quantity_not_before()
    {
        var location = new StockLocation("Bar"); var p = Product("Pack", 18, 6.245833m);
        var result = StockValuationRules.Calculate(location, DateTimeOffset.UtcNow, [Balance(p, location, 24)], new Dictionary<Guid, BarProduct> { [p.Id] = p }, new HashSet<Guid>());
        Assert.Equal(149.90m, result.StockCost); Assert.Equal(432m, result.SalePotential); Assert.Equal(282.10m, result.GrossProfit);
    }

    [Fact]
    public void Uncosted_initial_stock_stays_incomplete_across_transfer_but_not_after_full_depletion()
    {
        var p = Product("Test", 8, 0); var bar = new StockLocation("Bar"); var store = new StockLocation("Store");
        var a = new StockBalance(p.Id, bar.Id); var b = new StockBalance(p.Id, store.Id); var actor = Guid.NewGuid(); var transfer = Guid.NewGuid();
        var movements = new List<StockMovement> { new(a, 2, 0, "InitialCount", "Count", Guid.NewGuid(), actor), new(a, 6, 4.5m, "PurchaseReceived", "Purchase", Guid.NewGuid(), actor), new(a, -8, 3.375m, "TransferOut", "Transfer", transfer, actor), new(b, 8, 3.375m, "TransferIn", "Transfer", transfer, actor) };
        for (var i = 0; i < movements.Count; i++) movements[i].MarkCreated(DateTimeOffset.UnixEpoch.AddMinutes(i));
        Assert.True(StockValuationRules.HasUncostedStock(8, movements));
        movements.Add(new(b, -8, 3.375m, "Sale", "Delivery", Guid.NewGuid(), actor));
        movements.Add(new(b, 6, 4.5m, "PurchaseReceived", "New cycle", Guid.NewGuid(), actor));
        for (var i = 0; i < movements.Count; i++) movements[i].MarkCreated(DateTimeOffset.UnixEpoch.AddMinutes(i));
        Assert.False(StockValuationRules.HasUncostedStock(6, movements));
    }

    private static BarProduct Product(string name, decimal price, decimal cost, string unit = "un") => new(name, name, name, Guid.NewGuid(), unit, unit, 1, price, cost, 0, true, false, 0);
    private static StockBalance Balance(BarProduct p, StockLocation location, decimal quantity, decimal reserved = 0)
    { var b = new StockBalance(p.Id, location.Id); b.Move(quantity); if (reserved > 0) b.Reserve(reserved); return b; }
}
