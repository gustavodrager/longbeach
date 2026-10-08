using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;

namespace LongBeach.UnitTests;

public sealed class BusinessAllocationRulesTests
{
    [Theory]
    [InlineData("Bar", "Unit", "bar")]
    [InlineData("Escola", "Unit", "quadra")]
    [InlineData("Locações", "Unit", "quadra")]
    [InlineData("Arena", "Unclassified", null)]
    public void Legacy_mapping_does_not_invent_an_allocation_for_arena(string origin, string scope, string? unit)
        => Assert.Equal(new BusinessAllocation(scope, unit), BusinessAllocationRules.FromLegacy(origin));

    [Theory]
    [InlineData("Bar", "Unit", "quadra")]
    [InlineData("Escola", "Shared", null)]
    [InlineData("Locações", "Unclassified", null)]
    [InlineData("Arena", "Unit", null)]
    [InlineData("Arena", "Unit", "unknown")]
    [InlineData("Arena", "Shared", "bar")]
    [InlineData("Arena", "Unclassified", "quadra")]
    [InlineData("Arena", null, "bar")]
    [InlineData("Arena", "", null)]
    public void Invalid_or_contradictory_classification_is_rejected(string origin, string? scope, string? unit)
        => Assert.NotNull(BusinessAllocationRules.Validate(origin, scope, unit));

    [Theory]
    [InlineData("Unit", "bar")]
    [InlineData("Unit", "quadra")]
    [InlineData("Shared", null)]
    [InlineData("Unclassified", null)]
    [InlineData(null, null)]
    public void General_entries_allow_explicit_review_or_pending_classification(string? scope, string? unit)
        => Assert.Null(BusinessAllocationRules.Validate("Arena", scope, unit));

    [Fact]
    public void Old_client_edits_preserve_reviewed_classification_and_do_not_allow_origin_conflicts()
    {
        const string saved = """{"origin":"Arena","allocationScope":"Unit","businessUnitId":"bar"}""";
        var incoming = JsonNode.Parse("""{"origin":"Arena","name":"Corrigido"}""")!.AsObject();
        BusinessAllocationRules.PreserveOmitted(incoming, saved);
        Assert.Equal("bar", incoming["businessUnitId"]!.GetValue<string>());
        incoming["origin"] = "Escola";
        Assert.NotNull(BusinessAllocationRules.Validate(JsonSerializer.SerializeToElement(incoming)));
        Assert.NotNull(BusinessAllocationRules.Validate(JsonSerializer.Deserialize<JsonElement>("""{"origin":"Arena","allocationScope":5}""")));
    }

    [Fact]
    public void Monthly_classification_never_changes_amounts_or_allocates_shared_expenses()
    {
        var income = new MonthlyControlLine(Guid.NewGuid().ToString(), "Receita", "Receita", "Operação", "Bar", 10000, "Informado", "Teste", null, "Unit", "bar");
        var shared = new MonthlyControlLine(Guid.NewGuid().ToString(), "Limpeza", "Despesa", "Fixa", "Arena", 3000, "Informado", "Teste", null, "Shared");
        MonthlyControlRules.Validate("2026-10", new(0, [income, shared], ""));
        Assert.Equal(7000, MonthlyControlRules.Totals([income, shared]).ResultCents);
        Assert.Throws<FinancialRuleException>(() => MonthlyControlRules.Validate("2026-10", new(0, [income with { BusinessUnitId = "quadra" }, shared], "")));
    }
}
