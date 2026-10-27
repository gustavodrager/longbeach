using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;

namespace LongBeach.UnitTests;

public sealed class ExternalBusinessAllocationRulesTests
{
    [Theory]
    [InlineData("pagvendas-vendas", "vendas-informadas", "bar")]
    [InlineData("alunos", "valor-informado", "quadra")]
    [InlineData("mensalistas", "valor-informado", "quadra")]
    [InlineData("aulas", "valor-escalonavel", "quadra")]
    [InlineData("consolidado", "vendas-bar-bruto", "bar")]
    [InlineData("consolidado-com-dividas", "vendas-bar-bruto", "bar")]
    public void Identified_business_sources_determine_unit(string series, string metric, string expected)
        => Assert.Equal(expected, ExternalBusinessAllocationRules.FromHistory(series, metric));

    [Theory]
    [InlineData("pagbank-conta", "entradas-extrato")]
    [InlineData("pagbank-conta", "saidas-extrato")]
    [InlineData("pagbank-conta", "vendas-bar-bruto")]
    [InlineData("saldos", "Saldo Pagbank")]
    [InlineData("saldos", "Saldo C6")]
    [InlineData("consolidado", "receitas-arena")]
    [InlineData("consolidado", "receitas-consolidadas")]
    [InlineData("consolidado", "despesas")]
    [InlineData("despesas-fora-pagbank", "despesas")]
    public void Account_balances_and_ambiguous_controls_remain_unclassified(string series, string metric)
        => Assert.Null(ExternalBusinessAllocationRules.FromHistory(series, metric));

    [Fact]
    public void Pix_and_fiado_in_pagvendas_remain_bar_without_claiming_bank_receipt()
    {
        var pix = Row("pagvendas-vendas", "vendas-informadas") with { Label = "Pix", State = "Venda informada no PagVendas" };
        var credit = pix with { SourceCell = "Teste!A2", Label = "Fiado", State = "Fiado na fonte" };
        var totals = FinancialHistoryRules.Totals([pix, credit]);
        Assert.Equal(2, totals.Length);
        Assert.All(totals, total => Assert.Equal("bar", total.BusinessUnitId));
        Assert.Contains(totals, total => total.State == "Fiado na fonte");
    }

    [Fact]
    public void Classification_preserves_sources_fingerprint_and_separate_totals()
    {
        var rows = new[] {
            Row("pagvendas-vendas", "vendas-informadas"),
            Row("pagbank-conta", "entradas-extrato") with { SourceCell = "Teste!A2" },
            Row("mensalistas", "valor-informado") with { SourceCell = "Teste!A3" }
        };
        var source = JsonSerializer.Serialize(rows);
        var fingerprint = FinancialHistoryRules.Fingerprint("original-source", rows);
        var totals = FinancialHistoryRules.Totals(rows);
        Assert.Equal(3, totals.Length);
        Assert.All(totals, total => Assert.Equal(1000, total.AmountCents));
        Assert.Null(totals.Single(total => total.Series == "pagbank-conta").BusinessUnitId);
        Assert.Equal("quadra", totals.Single(total => total.Series == "mensalistas").BusinessUnitId);
        Assert.Equal(source, JsonSerializer.Serialize(rows));
        Assert.Equal(fingerprint, FinancialHistoryRules.Fingerprint("original-source", rows));
        Assert.DoesNotContain("BusinessUnitId", source);
    }

    private static FinancialObservation Row(string series, string metric) => new(
        "financial-observation-v1", "BRL", "Teste!A1", series, metric, "Teste", "Informado",
        new(2026, 10, 1), new(2026, 10, 31), "month", 1000, "");
}
