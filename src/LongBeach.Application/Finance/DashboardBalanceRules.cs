using LongBeach.Contracts.Finance;
namespace LongBeach.Application.Finance;

public static class DashboardBalanceRules
{
    private static readonly string[] DetailedMetrics = ["despesas", "receitas-arena", "vendas-bar-bruto"];
    private static readonly string[] SummaryMetrics = ["despesas", "receitas-consolidadas"];
    public static DashboardBalances Summarize(IEnumerable<HistoryItem> items, DateOnly today)
    {
        var rows = items.ToArray();
        // A balance is a dated snapshot, never the sum of balances across different days.
        var bankRows = rows.Where(x => x.Data.Series == "saldos" && x.Data.Grain == "snapshot" &&
            x.Data.Metric.Trim().Equals("Saldo Pagbank", StringComparison.OrdinalIgnoreCase) && x.Data.PeriodStart <= today).ToArray();
        var bankDate = bankRows.Select(x => (DateOnly?)x.Data.PeriodStart).Max();
        var latest = bankRows.Where(x => x.Data.PeriodStart == bankDate).ToArray();
        var bank = latest.Length == 1
            ? new BankBalanceSnapshot(latest[0].Data.AmountCents, bankDate, latest[0].SourceName, latest[0].Data.SourceCell, latest[0].Data.Metric, null)
            : new BankBalanceSnapshot(null, bankDate, null, null, null, latest.Length > 1 ? "Há mais de um saldo PagBank nesta data. Confira as fontes." : "Aguardando saldo da conta com data e origem.");
        // Only the original monthly summary: other controls can overlap and cannot be added again.
        var monthly = rows.Where(x => x.Data.Series == "consolidado" && x.Data.Grain == "month" && x.Data.PeriodStart <= today).ToArray();
        var month = monthly.Select(x => (DateOnly?)x.Data.PeriodStart).Max();
        var current = monthly.Where(x => x.Data.PeriodStart == month).ToArray();
        // A source may provide either a revenue breakdown or one reconciled revenue total.
        // Never combine the total with its components or invent zero-valued components.
        var summarized = current.Any(x => x.Data.Metric == "receitas-consolidadas");
        var expectedMetrics = summarized ? SummaryMetrics : DetailedMetrics;
        string? issue = current.Length == 0 ? "Aguardando receitas e despesas do consolidado mensal." :
            !expectedMetrics.All(metric => current.Any(x => x.Data.Metric == metric)) || current.Any(x => !expectedMetrics.Contains(x.Data.Metric)) ||
            summarized && current.Count(x => x.Data.Metric == "receitas-consolidadas") != 1 ? "O consolidado deste mês precisa de conferência antes de calcular o saldo." :
            current.GroupBy(x => x.Data.SourceCell).Any(g => g.Count() > 1) || current.Select(x => x.SourceSha256).Distinct().Count() != 1 ? "Há fontes sobrepostas neste mês. Confira a conciliação." : null;
        var income = current.Where(x => x.Data.Metric != "despesas").Sum(x => x.Data.AmountCents);
        var expenses = -current.Where(x => x.Data.Metric == "despesas").Sum(x => x.Data.AmountCents);
        var general = new MonthlyControlBalance(month?.ToString("yyyy-MM"), issue is null ? income - expenses : null,
            issue is null ? income : null, issue is null ? expenses : null, current.Length,
            current.Select(x => x.SourceName).Distinct().ToArray(), issue);
        return new(bank, general);
    }
}
