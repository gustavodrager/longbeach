using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
namespace LongBeach.UnitTests;
public sealed class DashboardBalanceRulesTests
{
    private static HistoryItem Row(string series, string metric, long cents, int month = 8, string grain = "month", string hash = "source")
        => new(Guid.NewGuid(), Guid.NewGuid(), "source.xlsx", hash,
            new("financial-observation-v1", "BRL", "Sheet!" + Guid.NewGuid(), series, metric, metric, "Informado", new(2026, month, 1), grain == "snapshot" ? new(2026, month, 1) : new DateOnly(2026, month, 1).AddMonths(1).AddDays(-1), grain, cents, ""));
    [Fact] public void Chooses_latest_bank_snapshot_and_one_month_without_overlapping_controls()
    {
        HistoryItem[] rows = [Row("saldos", "Saldo Pagbank", 999, 7, "snapshot"), Row("saldos", "Saldo Pagbank", -321, 8, "snapshot"),
            Row("saldos", "Saldo C6", 999999, 9, "snapshot"), Row("consolidado", "receitas-arena", 20000), Row("consolidado", "vendas-bar-bruto", 5000), Row("consolidado", "despesas", -18000),
            Row("consolidado-com-dividas", "despesas", -40000), Row("pagvendas-vendas", "vendas-informadas", 500000), Row("alunos", "valor-informado", 999),
            Row("consolidado", "despesas", -999999, 9, "estimate")];
        var result = DashboardBalanceRules.Summarize(rows, new(2026,10,6));
        Assert.Equal(-321, result.PagBank.AmountCents); Assert.Equal(new DateOnly(2026,8,1), result.PagBank.Date);
        Assert.Equal(7000, result.General.AmountCents); Assert.Equal(25000, result.General.IncomeCents); Assert.Equal(18000, result.General.ExpenseCents); Assert.Equal(3, result.General.Records);
    }
    [Fact] public void Preserves_deficit_and_expense_adjustments()
    {
        var result = DashboardBalanceRules.Summarize([Row("consolidado", "receitas-arena", 100), Row("consolidado", "vendas-bar-bruto", 200), Row("consolidado", "despesas", -600), Row("consolidado", "despesas", 50)], new(2026,10,6));
        Assert.Equal(-250, result.General.AmountCents); Assert.Equal(550, result.General.ExpenseCents);
    }
    [Fact] public void Missing_or_ambiguous_data_is_unavailable_instead_of_zero_or_sum()
    {
        var empty = DashboardBalanceRules.Summarize([], new(2026,10,6)); Assert.Null(empty.PagBank.AmountCents); Assert.Null(empty.General.AmountCents);
        var duplicate = DashboardBalanceRules.Summarize([Row("saldos", "Saldo Pagbank", 100, 8, "snapshot"), Row("saldos", "Saldo Pagbank", 100, 8, "snapshot"), Row("consolidado", "despesas", -500)], new(2026,10,6));
        Assert.Null(duplicate.PagBank.AmountCents); Assert.Null(duplicate.General.AmountCents);
    }
    [Fact] public void Never_mixes_partial_latest_month_with_previous_month_or_future_snapshot()
    {
        var result = DashboardBalanceRules.Summarize([Row("consolidado", "despesas", -1000), Row("consolidado", "receitas-arena", 3000), Row("consolidado", "vendas-bar-bruto", 1000), Row("consolidado", "receitas-arena", 100, 9), Row("saldos", "Saldo Pagbank", 900, 12, "snapshot")], new(2026,10,6));
        Assert.Equal("2026-09", result.General.Month); Assert.Null(result.General.AmountCents); Assert.Null(result.PagBank.AmountCents);
    }
}
