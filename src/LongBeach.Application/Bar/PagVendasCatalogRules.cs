using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;

namespace LongBeach.Application.Bar;

public static partial class PagVendasCatalogRules
{
    public static CatalogImportItem Parse(int row, string? externalId, JsonElement data)
    {
        try
        {
            if (data.GetProperty("entity").GetString() != "bar-product" ||
                data.GetProperty("source").GetString() != "PagVendas - Long Beach Arena Ltda" ||
                data.GetProperty("currency").GetString() != "BRL")
                throw new BarRuleException("O lote deve conter somente produtos PagVendas da Long Beach, em BRL.");
            var externalCode = data.GetProperty("codigo_pagvendas").GetString() ?? "";
            if (!ExternalCode().IsMatch(externalCode) || externalId != "pagvendas:" + externalCode)
                throw new BarRuleException("Referência externa PagVendas inválida.");
            var name = BarRules.Text(data.GetProperty("nome").GetString(), 160, "Produto");
            var category = data.GetProperty("categoria").GetString();
            category = string.IsNullOrWhiteSpace(category) ? "Sem categoria" : BarRules.Text(category, 100, "Categoria");
            var price = BarRules.Money(data.GetProperty("preco_venda_centavos").GetInt64() / 100m);
            var cost = BarRules.Cost(data.GetProperty("preco_custo_centavos").GetInt64() / 100m);
            var barcode = data.GetProperty("codigo_barras").GetString();
            if (!string.IsNullOrWhiteSpace(barcode)) barcode = BarRules.Text(barcode, 80, "Código de barras");
            else barcode = null;
            return new(row, externalId, "PV-" + externalCode.ToUpperInvariant(), name, category,
                price, cost, barcode, "Create", null, null, null);
        }
        catch (Exception e) when (e is KeyNotFoundException or InvalidOperationException or FormatException or OverflowException)
        {
            throw new BarRuleException($"Produto na linha {row}: conteúdo PagVendas inválido.");
        }
    }

    public static CatalogImportItem Compare(CatalogImportItem item, BarProduct? existing, string? category)
    {
        if (existing is null) return item;
        // Importação nunca sobrescreve custos calculados, estoque, receitas ou metadados locais.
        var matches = existing.Name == item.Name && existing.SalePrice == item.SalePrice && category == item.Category;
        return item with { ProductId = existing.Id, Version = existing.Version,
            Action = matches ? "Matched" : "Conflict",
            Conflict = matches ? null : "Nome, preço ou categoria diverge do cadastro atual. Revise o produto antes de importar." };
    }

    public static string Fingerprint(string sourceHash, IReadOnlyList<CatalogImportItem> items) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(
            sourceHash + JsonSerializer.Serialize(items.OrderBy(x => x.Code, StringComparer.Ordinal).ToArray()))));

    [GeneratedRegex("^[A-Za-z0-9._-]{1,37}$", RegexOptions.CultureInvariant)]
    private static partial Regex ExternalCode();
}
