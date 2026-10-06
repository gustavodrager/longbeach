using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Contracts.Finance;
namespace LongBeach.Application.Finance;

public static class FinancialHistoryRules
{
    public static readonly string[] Series = ["consolidado", "consolidado-com-dividas", "compras-detalhadas", "servicos-detalhados", "saldos", "alunos", "mensalistas", "aulas", "pagvendas-vendas", "pagbank-conta", "despesas-fora-pagbank"];
    public static FinancialObservation Parse(JsonElement payload)
    {
        try
        {
            var item = payload.Deserialize<FinancialObservation>(new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (item is null || item.Entity != "financial-observation-v1" || item.Currency != "BRL" ||
                !Series.Contains(item.Series) || string.IsNullOrWhiteSpace(item.SourceCell) || item.SourceCell.Length > 160 ||
                string.IsNullOrWhiteSpace(item.Label) || item.Label.Length > 240 || string.IsNullOrWhiteSpace(item.Metric) || item.Metric.Length > 80 ||
                string.IsNullOrWhiteSpace(item.State) || item.State.Length > 80 || item.Notes is null || item.Notes.Length > 2000 ||
                item.AmountCents is < -99999999999 or > 99999999999 ||
                item.PeriodStart < new DateOnly(2000,1,1) || item.PeriodEnd > new DateOnly(2100,12,31) || item.PeriodEnd < item.PeriodStart ||
                item.Grain is not ("day" or "month" or "snapshot" or "estimate") ||
                item.Grain is "day" or "snapshot" && item.PeriodStart != item.PeriodEnd ||
                item.Grain is "month" or "estimate" && (item.PeriodStart.Day != 1 || item.PeriodEnd != item.PeriodStart.AddMonths(1).AddDays(-1)))
                throw new FinancialRuleException("Observação financeira inválida. Confira origem, período e valor em centavos.");
            return item;
        }
        catch (Exception e) when (e is JsonException or ArgumentException or InvalidOperationException)
        { throw new FinancialRuleException("Conteúdo financeiro não reconhecido."); }
    }
    public static HistoryTotal[] Totals(IEnumerable<FinancialObservation> rows) => rows
        .GroupBy(x => (x.Series,x.Metric,x.State,Period:x.PeriodStart.ToString(x.Grain=="snapshot" ? "yyyy-MM-dd" : "yyyy-MM"),x.Grain))
        .OrderBy(x=>x.Key.Period).ThenBy(x=>x.Key.Series).ThenBy(x=>x.Key.Metric)
        .Select(x=>new HistoryTotal(x.Key.Series,x.Key.Metric,x.Key.State,x.Key.Period,x.Key.Grain,x.Sum(v=>v.AmountCents),x.Count())).ToArray();
    public static string Fingerprint(string hash, IEnumerable<FinancialObservation> items) => Convert.ToHexStringLower(
        SHA256.HashData(Encoding.UTF8.GetBytes(hash + JsonSerializer.Serialize(items.OrderBy(x=>x.SourceCell,StringComparer.Ordinal)))));
}
