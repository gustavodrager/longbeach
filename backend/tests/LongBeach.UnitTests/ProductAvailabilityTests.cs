using System.Text.Json;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;

namespace LongBeach.UnitTests;

public sealed class ProductAvailabilityTests
{
    private static BarProduct Product() => new("LOCAL", "Água", "Água", Guid.NewGuid(), "un", "un", 1, 5, 2, 0, true, false, 0);

    [Fact]
    public void Hidden_product_keeps_its_definition_but_rejects_new_sale_and_tab_items()
    {
        var product = Product();
        Assert.True(product.AvailableForSale);
        var version = product.Version;
        product.SetSaleAvailability(false);
        Assert.Equal(version + 1, product.Version);
        Assert.True(product.Active);
        Assert.Equal(5, product.SalePrice);
        Assert.Throws<BarRuleException>(() => new BarSale(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()).Add(product, 1));
        Assert.Throws<BarRuleException>(() => new BarTabItem(Guid.NewGuid(), product, 1, Guid.NewGuid(), false));
        product.SetSaleAvailability(false);
        Assert.Equal(version + 1, product.Version);
        product.SetSaleAvailability(true);
        Assert.True(product.AvailableForSale);
    }

    [Fact]
    public void Archive_is_logical_versioned_and_idempotent()
    {
        var product = Product(); var id = product.Id; var version = product.Version;
        product.Archive(); product.Archive();
        Assert.Equal(id, product.Id); Assert.Equal(version + 1, product.Version);
        Assert.False(product.Active); Assert.False(product.AvailableForSale);
        Assert.Equal(5, product.SalePrice); Assert.True(product.ControlsStock);
    }

    [Fact]
    public void Omitted_availability_preserves_legacy_stock_operation_fingerprint_shape()
    {
        var product = Product();
        var input = new ProductInput(product.Code, product.Name, product.ShortName, product.CategoryId,
            "un", "un", 1, 5, 2, 0, true, false, 0, Version: product.Version);
        var stock = new ProductStockInput(input, 3, 0, Guid.NewGuid()); var actor = Guid.NewGuid(); var id = product.Id;
        var legacyProduct = new { input.Code, input.Name, input.ShortName, input.CategoryId, input.SaleUnit, input.PurchaseUnit,
            input.ConversionFactor, input.SalePrice, input.AverageCost, input.MinimumStock, input.ControlsStock, input.Favorite,
            input.DisplayOrder, input.Active, input.Version, input.Barcode, input.ImageUrl, input.MainSupplierId, input.Prepared };
        var oldJson = JsonSerializer.Serialize(new { action = "productStock", id, input = new { Product = legacyProduct, stock.Available, stock.StockVersion, stock.OperationId }, actor });
        var newJson = JsonSerializer.Serialize(new { action = "productStock", id, input = stock, actor });
        Assert.Equal(oldJson, newJson);
        Assert.DoesNotContain("AvailableForSale", newJson);
        Assert.Contains("\"AvailableForSale\":false", JsonSerializer.Serialize(input with { AvailableForSale = false }));
        var catalog = new CatalogProduct(id, "LOCAL", "Água", "Água", product.CategoryId, "un", 5, true, 0, false, 0, true, 2);
        var oldResponse = JsonSerializer.Serialize(catalog).Replace(",\"AvailableForSale\":true", "");
        Assert.True(JsonSerializer.Deserialize<CatalogProduct>(oldResponse)!.AvailableForSale);
    }
}
