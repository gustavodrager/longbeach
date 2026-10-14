using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Finance;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;

public sealed class FinancialReceiptRulesTests
{
    [Theory]
    [InlineData("PagBankTerminal", null, "bar")]
    [InlineData("PagVendas", "C6", "bar")]
    [InlineData("CourtPix", "PagBank", "quadra")]
    [InlineData("CourtPix", "C6", "quadra")]
    public void Receipt_source_determines_unit_without_changing_amount_or_payment_state(string source, string? account, string unit)
    {
        var incoming = Entry(source, account);
        FinancialReceiptRules.PrepareWrite(incoming, null);
        Assert.Equal("Unit", incoming["allocationScope"]!.GetValue<string>());
        Assert.Equal(unit, incoming["businessUnitId"]!.GetValue<string>());
        Assert.Equal(account, incoming["receivingAccount"]?.GetValue<string>());
        Assert.Equal(120, incoming["amount"]!.GetValue<int>());
        Assert.Equal("Pendente", incoming["status"]!.GetValue<string>());
        Assert.False(incoming.ContainsKey("paidDate"));
        Assert.Null(Validate(incoming));
    }

    [Theory]
    [InlineData("PagBankTerminal", "Escola")]
    [InlineData("PagVendas", "Locações")]
    [InlineData("CourtPix", "Bar")]
    public void Conflicting_business_origin_is_not_silently_overridden(string source, string origin)
    {
        var incoming = Entry(source, "PagBank"); incoming["origin"] = origin;
        FinancialReceiptRules.PrepareWrite(incoming, null);
        Assert.NotNull(Validate(incoming));
        Assert.Equal(origin, incoming["origin"]!.GetValue<string>());
    }

    [Theory]
    [InlineData("Unit", "quadra")]
    [InlineData("Shared", null)]
    [InlineData("Unclassified", null)]
    [InlineData(null, null)]
    public void Explicit_conflicting_allocation_is_rejected_even_when_null(string? scope, string? unit)
    {
        var incoming = Entry("PagBankTerminal", null);
        incoming["allocationScope"] = scope; incoming["businessUnitId"] = unit;
        FinancialReceiptRules.PrepareWrite(incoming, null);
        BusinessAllocationRules.PreserveOmitted(incoming, """{"allocationScope":"Unit","businessUnitId":"bar"}""");
        Assert.Equal(scope, incoming["allocationScope"]?.GetValue<string>());
        Assert.NotNull(Validate(incoming));
    }

    [Theory]
    [InlineData("reservations", "PagBankTerminal")]
    [InlineData("enrollments", "PagVendas")]
    [InlineData("rentalMonths", "PagVendas")]
    public void A_linked_court_charge_cannot_be_classified_as_a_bar_sale(string sourceKind, string receiptSource)
    {
        var incoming = Entry(receiptSource, null);
        incoming["sourceKind"] = sourceKind; incoming["sourceId"] = Guid.NewGuid().ToString();
        FinancialReceiptRules.PrepareWrite(incoming, null);
        Assert.Contains("deve permanecer na Quadra", FinancialReceiptRules.Validate(JsonSerializer.SerializeToElement(incoming)));
    }

    [Theory]
    [InlineData("\"Pix\"", "null")]
    [InlineData("\"\"", "null")]
    [InlineData("true", "null")]
    [InlineData("5", "null")]
    [InlineData("{}", "null")]
    [InlineData("[]", "null")]
    [InlineData("null", "\"OtherBank\"")]
    [InlineData("null", "\"\"")]
    [InlineData("null", "false")]
    [InlineData("null", "{}")]
    public void Unknown_or_malformed_metadata_is_rejected_without_throwing(string source, string account)
    {
        var incoming = Entry(null, null);
        incoming["receiptSource"] = JsonNode.Parse(source); incoming["receivingAccount"] = JsonNode.Parse(account);
        FinancialReceiptRules.PrepareWrite(incoming, null);
        Assert.NotNull(Validate(incoming));
    }

    [Fact]
    public void Court_pix_requires_destination_and_expense_cannot_carry_receipt_metadata()
    {
        var incoming = Entry("CourtPix", null);
        Assert.Contains("PagBank ou C6", Validate(incoming));
        incoming["receiptSource"] = null; incoming["receivingAccount"] = "C6"; incoming["direction"] = "Pagar";
        Assert.Contains("valores a receber", Validate(incoming));
        incoming["receiptSource"] = "PagVendas"; incoming["receivingAccount"] = null;
        Assert.Contains("valores a receber", Validate(incoming));
        incoming["receiptSource"] = null;
        Assert.Null(Validate(incoming));
    }

    [Fact]
    public void Bank_account_and_free_text_pix_do_not_infer_a_business_unit()
    {
        var incoming = Entry(null, "PagBank"); incoming["name"] = "Pix sem origem conferida";
        FinancialReceiptRules.PrepareWrite(incoming, null);
        Assert.False(incoming.ContainsKey("allocationScope"));
        Assert.False(incoming.ContainsKey("businessUnitId"));
        Assert.Null(Validate(incoming));
        incoming.Remove("receiptSource"); incoming.Remove("receivingAccount");
        FinancialReceiptRules.PrepareWrite(incoming, null);
        Assert.False(incoming.ContainsKey("receiptSource"));
        Assert.Null(Validate(incoming));
    }

    [Fact]
    public void Old_client_preserves_metadata_but_explicit_null_clears_it()
    {
        const string previous = """{"receiptSource":"CourtPix","receivingAccount":"C6","allocationScope":"Unit","businessUnitId":"quadra"}""";
        var incoming = Entry(null, null); incoming.Remove("receiptSource"); incoming.Remove("receivingAccount");
        FinancialReceiptRules.PrepareWrite(incoming, previous);
        BusinessAllocationRules.PreserveOmitted(incoming, previous);
        Assert.Equal("CourtPix", incoming["receiptSource"]!.GetValue<string>());
        Assert.Equal("C6", incoming["receivingAccount"]!.GetValue<string>());
        Assert.Equal("quadra", incoming["businessUnitId"]!.GetValue<string>());
        Assert.Null(Validate(incoming));

        incoming["receiptSource"] = null; incoming["receivingAccount"] = null;
        FinancialReceiptRules.PrepareWrite(incoming, previous);
        Assert.Null(incoming["receiptSource"]); Assert.Null(incoming["receivingAccount"]);
        Assert.Null(Validate(incoming));
    }

    [Fact]
    public void New_receipt_source_replaces_omitted_allocation_but_does_not_infer_receiving_account()
    {
        const string previous = """{"allocationScope":"Shared","businessUnitId":null}""";
        var incoming = Entry("PagVendas", null);
        FinancialReceiptRules.PrepareWrite(incoming, previous);
        BusinessAllocationRules.PreserveOmitted(incoming, previous);
        Assert.Equal("Unit", incoming["allocationScope"]!.GetValue<string>());
        Assert.Equal("bar", incoming["businessUnitId"]!.GetValue<string>());
        Assert.Null(incoming["receivingAccount"]);
        Assert.Null(Validate(incoming));
    }

    private static JsonObject Entry(string? source, string? account) => new()
    {
        ["id"] = Guid.NewGuid().ToString(), ["name"] = "Recebimento de teste", ["origin"] = "Arena",
        ["direction"] = "Receber", ["amount"] = 120, ["dueDate"] = "2026-10-14", ["status"] = "Pendente",
        ["receiptSource"] = source, ["receivingAccount"] = account
    };

    private static string? Validate(JsonObject body) => OperationalValidation.Validate("financeEntries",
        Guid.Parse(body["id"]!.GetValue<string>()), JsonSerializer.SerializeToElement(body),
        new Dictionary<string, JsonElement[]>(), new DateOnly(2026, 10, 14));
}
