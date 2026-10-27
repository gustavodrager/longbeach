using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Infrastructure.Finance;

namespace LongBeach.UnitTests;

public sealed class C6StatementRulesTests
{
    private static readonly DateOnly Day = new(2026, 10, 19);

    [Fact]
    public void Preserves_bank_date_and_direction_without_inventing_utc_from_created_at()
    {
        using var json = JsonDocument.Parse("""
            {"entries":[
              {"reference":"credit-1","local_reference":"local-1","created_at":"2026-10-19T00:01:00",
               "entry_date":"2026-10-19","amount":"123.45","title":"Pix recebido","description":"Teste",
               "operation_type":"INCOMING","transaction_type":"CREDIT_QRCODE_PIX_PAYMENT_RECEIVED","end_to_end_id":"Etest"},
              {"reference":"debit-1","created_at":"2026-10-19T00:05:00","entry_date":"2026-10-19","amount":"5.70","title":"Tarifa","description":"Teste",
               "operation_type":"OUTGOING","transaction_type":"FEE"}
            ]}
            """);
        var entries = C6StatementRules.Parse(json.RootElement, Day, Day);
        Assert.Equal(Day, entries[0].BookedDate);
        Assert.Equal(12345, entries[0].AmountCents);
        Assert.Equal(-570, entries[1].AmountCents);
        Assert.Equal("Etest", entries[0].EndToEndId);
    }

    [Theory]
    [InlineData("123.456", "INCOMING", "2026-10-19", "C6_AMOUNT_PRECISION")]
    [InlineData("-1.00", "INCOMING", "2026-10-19", "C6_STATEMENT_AMOUNT")]
    [InlineData("-1.00", "OUTGOING", "2026-10-19", "C6_STATEMENT_AMOUNT")]
    [InlineData("1.00", "UNKNOWN", "2026-10-19", "C6_STATEMENT_INCONSISTENT")]
    [InlineData("1.00", "INCOMING", "2026-10-18", "C6_STATEMENT_INCONSISTENT")]
    public void Rejects_unsafe_precision_direction_and_period(string amount, string direction, string date, string expected)
    {
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(new { entries = new[] { new { reference = "test", entry_date = date,
            created_at = "2026-10-19T12:00:00", title = "Teste", description = "Teste",
            amount, operation_type = direction, transaction_type = "TEST" } } }));
        Assert.Equal(expected, Assert.Throws<FinancialRuleException>(() => C6StatementRules.Parse(json.RootElement, Day, Day)).Message);
    }

    [Fact]
    public void Duplicate_ids_reject_entire_response_and_missing_entries_is_not_an_empty_statement()
    {
        var row = new { reference = "test", entry_date = "2026-10-19", created_at = "2026-10-19T12:00:00", title = "Teste", description = "Teste", amount = "1.00", operation_type = "INCOMING", transaction_type = "TEST" };
        using var duplicate = JsonDocument.Parse(JsonSerializer.Serialize(new { entries = new[] { row, row } }));
        Assert.Throws<FinancialRuleException>(() => C6StatementRules.Parse(duplicate.RootElement, Day, Day));
        using var missing = JsonDocument.Parse("{}");
        Assert.Throws<FinancialRuleException>(() => C6StatementRules.Parse(missing.RootElement, Day, Day));
        using var empty = JsonDocument.Parse("{\"entries\":[]}");
        Assert.Empty(C6StatementRules.Parse(empty.RootElement, Day, Day));
    }

    [Fact]
    public void Limits_period_to_thirty_inclusive_local_days()
    {
        C6StatementRules.Period(Day.AddDays(-29), Day, Day);
        Assert.Throws<FinancialRuleException>(() => C6StatementRules.Period(Day.AddDays(-30), Day, Day));
        Assert.Throws<FinancialRuleException>(() => C6StatementRules.Period(Day, Day.AddDays(1), Day));
        Assert.Throws<FinancialRuleException>(() => C6StatementRules.Period(Day, Day.AddDays(-1), Day));
    }

    [Fact]
    public void Negative_balance_remains_negative_and_missing_balance_is_not_zero()
    {
        using var balance = JsonDocument.Parse("{\"available\":-42.05,\"currency_code\":\"BRL\",\"date\":\"2026-10-19\",\"limit\":10000,\"total_available\":9957.95}");
        Assert.Equal(-4205, C6BankingWorker.ParseBalance(balance.RootElement, Day).AmountCents);
        Assert.Equal(Day, C6BankingWorker.ParseBalance(balance.RootElement, Day).SourceDate);
        using var missing = JsonDocument.Parse("{}");
        Assert.Throws<FinancialRuleException>(() => C6BankingWorker.ParseBalance(missing.RootElement, Day));
    }

    [Fact]
    public void Missing_provider_references_use_stable_fallback_but_indistinguishable_rows_are_rejected()
    {
        using var first = JsonDocument.Parse("""{"entries":[{"created_at":"2026-10-19T12:00:00","entry_date":"2026-10-19","amount":"1.00","title":"Teste","description":"Teste","operation_type":"INCOMING","transaction_type":"TEST"}]}""");
        using var reordered = JsonDocument.Parse("""{"entries":[{"title":"Teste","entry_date":"2026-10-19","created_at":"2026-10-19T12:00:00","description":"Teste","amount":"1.00","transaction_type":"TEST","operation_type":"INCOMING"}]}""");
        var a = Assert.Single(C6StatementRules.Parse(first.RootElement, Day, Day));
        var b = Assert.Single(C6StatementRules.Parse(reordered.RootElement, Day, Day));
        Assert.StartsWith("sha256:", a.EntryId); Assert.Equal(a.EntryId, b.EntryId);
        var row = first.RootElement.GetProperty("entries")[0].GetRawText();
        using var duplicate = JsonDocument.Parse("{\"entries\":[" + row + "," + row + "]}");
        Assert.Throws<FinancialRuleException>(() => C6StatementRules.Parse(duplicate.RootElement, Day, Day));
    }

    [Fact]
    public void Required_display_fields_can_be_empty_but_cannot_be_missing()
    {
        using var empty = JsonDocument.Parse("""{"entries":[{"reference":"test","created_at":"2026-10-19T12:00:00","entry_date":"2026-10-19","amount":"1.00","title":"","description":"","operation_type":"INCOMING","transaction_type":"OTHER"}]}""");
        var entry = Assert.Single(C6StatementRules.Parse(empty.RootElement, Day, Day));
        Assert.Empty(entry.Title); Assert.Empty(entry.Description);
        using var missing = JsonDocument.Parse("""{"entries":[{"reference":"test","created_at":"2026-10-19T12:00:00","entry_date":"2026-10-19","amount":"1.00","title":"","operation_type":"INCOMING","transaction_type":"OTHER"}]}""");
        Assert.Throws<FinancialRuleException>(() => C6StatementRules.Parse(missing.RootElement, Day, Day));
    }

    [Fact]
    public void Null_balance_date_is_a_safe_schema_error()
    {
        using var missing = JsonDocument.Parse("""{"available":0,"currency_code":"BRL","date":null}""");
        Assert.Equal("C6_BALANCE_SCHEMA", Assert.Throws<FinancialRuleException>(() => C6BankingWorker.ParseBalance(missing.RootElement, Day)).Message);
    }
}
