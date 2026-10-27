using System.Text.Json;
using LongBeach.Application.Bar;
using LongBeach.Domain.Bar;

namespace LongBeach.UnitTests;

public sealed class PagVendasCatalogRulesTests
{
    [Fact]
    public void Parse_preserves_centavos_and_external_reference_with_new_domain_identity()
    {
        var item = Parse("31", 349, 500, null);
        Assert.Equal("PV-31", item.Code); Assert.Equal("Sem categoria", item.Category);
        Assert.Equal(3.49m, item.SourceCost); Assert.Equal(5, item.SalePrice);
        Assert.Null(item.ProductId);
    }

    [Fact]
    public void Existing_stock_cost_and_metadata_do_not_get_overwritten()
    {
        var item = Parse("31", 0, 500, "Bebidas");
        var product = new BarProduct(item.Code, item.Name, "Nome local", Guid.NewGuid(), "un", "cx", 24, 5, 4.75m, 12, true, true, 3);
        product.SetMetadata("789", "https://storage.test/agua.jpg", null);
        var version = product.Version;
        var comparison = PagVendasCatalogRules.Compare(item, product, "Bebidas");
        Assert.Equal("Matched", comparison.Action); Assert.Equal(4.75m, product.AverageCost);
        Assert.Equal("789", product.Barcode); Assert.Equal(24, product.ConversionFactor);
        Assert.Equal(version, product.Version);
    }

    [Fact]
    public void Price_changes_require_review_and_invalidate_the_confirmation()
    {
        var item = Parse("31", 0, 500, "Bebidas");
        var product = new BarProduct(item.Code, item.Name, item.Name, Guid.NewGuid(), "un", "un", 1, 6, 0, 0, true, false, 0);
        var changed = PagVendasCatalogRules.Compare(item, product, "Bebidas");
        Assert.Equal("Conflict", changed.Action);
        Assert.NotEqual(PagVendasCatalogRules.Fingerprint("source", [item]), PagVendasCatalogRules.Fingerprint("source", [changed]));
    }

    [Theory]
    [InlineData("../secret", -1, 10)]
    [InlineData("31", -1, 10)]
    [InlineData("31", 0, -10)]
    public void Invalid_codes_and_negative_money_are_rejected(string code, long cost, long price) =>
        Assert.Throws<BarRuleException>(() => Parse(code, cost, price, "Bebidas"));

    private static LongBeach.Contracts.Bar.CatalogImportItem Parse(string code, long cost, long price, string? category) =>
        PagVendasCatalogRules.Parse(2, "pagvendas:" + code, JsonSerializer.SerializeToElement(new {
            entity = "bar-product", source = "PagVendas - Long Beach Arena Ltda", currency = "BRL",
            codigo_pagvendas = code, nome = "Água teste ", categoria = category,
            preco_custo_centavos = cost, preco_venda_centavos = price, codigo_barras = (string?)null
        }));
}
