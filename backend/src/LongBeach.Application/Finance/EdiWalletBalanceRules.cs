using System.Globalization;
using System.Text.Json;
using LongBeach.Contracts.Finance;
namespace LongBeach.Application.Finance;

public sealed record EdiBalanceDocument(int Page, string Hash, JsonElement Payload);
public static class EdiWalletBalanceRules
{
    // Official EDI layout: 07 = opening; 08 = closing. This is the acquiring wallet,
    // explicitly distinct from the PagBank digital checking account (manual, p. 36).
    public static EdiWalletSnapshot Read(DateOnly day, DateTimeOffset collected, IEnumerable<EdiBalanceDocument> documents, string merchant, DateOnly today)
    {
        var rows = documents.OrderBy(x => x.Page).ToArray();
        var hashes = rows.Select(x => x.Hash).ToArray();
        try
        {
            if (day >= today || rows.Length == 0 || string.IsNullOrEmpty(merchant)) throw new FinancialRuleException("EDI_BALANCE_INCOMPLETE");
            var pages = rows.Select((row, index) => PagBankEdiRules.Parse(row.Payload, index + 1, merchant)).ToArray();
            if (rows.Where((row, index) => row.Page != index + 1).Any() || pages.Any(p => p.TotalPages != pages.Length || p.TotalElements != pages[0].TotalElements) || pages.Sum(p => p.Details.Count) != pages[0].TotalElements)
                throw new FinancialRuleException("EDI_BALANCE_INCOMPLETE");
            var closing = new List<long>();
            foreach (var row in pages.SelectMany(p => p.Details))
            {
                var code = row.GetProperty("tipo_evento");
                var kind = code.ValueKind == JsonValueKind.String ? int.Parse(code.GetString()!, CultureInfo.InvariantCulture) : code.GetInt32();
                if (kind is not (7 or 8)) throw new FinancialRuleException("EDI_BALANCE_EVENT");
                var date = row.GetProperty("data_movimentacao").GetString();
                if (!DateOnly.TryParseExact(date, ["yyyy-MM-dd", "yyyyMMdd"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var actual) || actual != day)
                    throw new FinancialRuleException("EDI_BALANCE_DATE");
                var amount = row.GetProperty("valor_saldo").GetDecimal() * 100;
                if (amount != decimal.Truncate(amount)) throw new FinancialRuleException("EDI_BALANCE_PRECISION");
                if (kind == 8) closing.Add(checked((long)amount));
            }
            if (closing.Count != 1) throw new FinancialRuleException("EDI_BALANCE_AMBIGUOUS");
            return new(closing[0], day, collected, hashes, day < today.AddDays(-1) ? "Coleta atrasada: saldo da última data validada." : null);
        }
        catch (Exception ex) when (ex is FinancialRuleException or JsonException or KeyNotFoundException or InvalidOperationException or FormatException or OverflowException)
        {
            return new(null, day, collected, hashes, "O saldo final da carteira requer conferência. Consulte os documentos EDI; não foi estimado um valor.");
        }
    }
}
