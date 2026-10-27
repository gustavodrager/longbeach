using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace LongBeach.Application.Finance;

public sealed record C6BankEntry(string EntryId, DateOnly BookedDate, long AmountCents, string Title,
    string Description, string OperationType, string TransactionType, string? EndToEndId);

public static class C6StatementRules
{
    public static void Period(DateOnly from, DateOnly through, DateOnly today)
    {
        if (from < new DateOnly(2000, 1, 1) || through < from || through > today || through.DayNumber - from.DayNumber > 29)
            throw new FinancialRuleException("Selecione até 30 dias, terminando no máximo hoje.");
    }

    public static IReadOnlyList<C6BankEntry> Parse(JsonElement root, DateOnly from, DateOnly through)
    {
        try
        {
            if (!root.TryGetProperty("entries", out var rows) || rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() > 100_000)
                throw new FinancialRuleException("C6_STATEMENT_SCHEMA");
            var result = new List<C6BankEntry>();
            var keys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var row in rows.EnumerateArray())
            {
                var date = DateOnly.ParseExact(Text(row, "entry_date", 10), "yyyy-MM-dd", CultureInfo.InvariantCulture);
                // C6 supplies a local timestamp without a timezone. Preserve it; never pretend it is UTC.
                var created = Text(row, "created_at", 64);
                var operation = Text(row, "operation_type", 20);
                if (date < from || date > through || operation is not ("INCOMING" or "OUTGOING"))
                    throw new FinancialRuleException("C6_STATEMENT_INCONSISTENT");
                var amount = Money(row.GetProperty("amount"));
                if (amount < 0) throw new FinancialRuleException("C6_STATEMENT_AMOUNT");
                if (operation == "OUTGOING") amount = -amount;
                // The official schema requires these properties, but does not require nonempty text.
                var title = Text(row, "title", 500, allowEmpty: true);
                var description = Text(row, "description", 2000, allowEmpty: true);
                var transaction = Text(row, "transaction_type", 100);
                var endToEnd = NullText(row, "end_to_end_id", 100);
                var reference = NullText(row, "reference", 180);
                var local = NullText(row, "local_reference", 180);
                // Both provider references are optional. Canonical field order keeps a fallback stable;
                // indistinguishable duplicates fail the whole batch instead of dropping a real movement.
                var id = reference is not null ? "reference:" + reference : local is not null ? "local:" + local
                    : "sha256:" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(
                        new { created, date, amount, title, description, operation, transaction, endToEnd }))));
                if (!keys.Add(id)) throw new FinancialRuleException("C6_STATEMENT_INCONSISTENT");
                result.Add(new(id, date, amount, title, description, operation, transaction, endToEnd));
            }
            return result;
        }
        catch (Exception e) when (e is JsonException or FormatException or InvalidOperationException or KeyNotFoundException or OverflowException)
        { throw new FinancialRuleException("C6_STATEMENT_SCHEMA"); }
    }

    public static long Money(JsonElement value)
    {
        var parsed = value.ValueKind switch
        {
            JsonValueKind.String => decimal.Parse(value.GetString()!, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture),
            JsonValueKind.Number => value.GetDecimal(),
            _ => throw new FinancialRuleException("C6_AMOUNT_SCHEMA")
        };
        var cents = parsed * 100m;
        if (cents != decimal.Truncate(cents) || cents is < -99999999999m or > 99999999999m)
            throw new FinancialRuleException("C6_AMOUNT_PRECISION");
        return checked((long)cents);
    }

    private static string Text(JsonElement row, string name, int maximum, bool optional = false, bool allowEmpty = false)
    {
        if ((!row.TryGetProperty(name, out var field) || field.ValueKind == JsonValueKind.Null) && optional) return "";
        if (field.ValueKind != JsonValueKind.String) throw new FinancialRuleException("C6_STATEMENT_SCHEMA");
        var text = field.GetString()!;
        if ((!optional && !allowEmpty && string.IsNullOrWhiteSpace(text)) || text.Length > maximum)
            throw new FinancialRuleException("C6_STATEMENT_SCHEMA");
        return text;
    }
    private static string? NullText(JsonElement row, string name, int maximum)
    {
        var value = Text(row, name, maximum, optional: true);
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
}
