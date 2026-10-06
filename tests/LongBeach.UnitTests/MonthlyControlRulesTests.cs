using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
namespace LongBeach.UnitTests;

public sealed class MonthlyControlRulesTests
{
    private static MonthlyControlLine Line(string direction, long amount, string basis = "Informado") =>
        new(Guid.NewGuid().ToString(), "Referência de teste", direction, "Operação", "Arena", amount, basis, "Fonte de teste", "2026-08");
    [Fact] public void Estimates_are_identified_and_expenses_remain_positive_while_deficit_is_negative()
    {
        var lines = new[] { Line("Receita", 10000), Line("Despesa", 4000), Line("Despesa", 9000, "Estimado"), Line("Despesa", 0, "Estimado") };
        MonthlyControlRules.Validate("2026-09", new(0, lines, "Conferência"));
        var result = MonthlyControlRules.Balance(new("2026-09", 1, lines, "Conferência", DateTimeOffset.UtcNow));
        Assert.Equal(10000, result.IncomeCents); Assert.Equal(13000, result.ExpenseCents); Assert.Equal(-3000, result.AmountCents);
        Assert.Equal(9000, result.EstimatedExpenseCents); Assert.True(result.Estimated); Assert.Equal("revisado", result.Basis);
        Assert.Equal(2, MonthlyControlRules.Totals(lines).EstimatedRecords);
    }
    [Fact] public void Rejects_repeated_lines_invalid_month_negative_values_and_unknown_provenance()
    {
        var income = Line("Receita", 10000); var expense = Line("Despesa", 2000, "Estimado");
        void Invalid(MonthlyControlLine item) => Assert.Throws<FinancialRuleException>(() => MonthlyControlRules.Validate("2026-09", new(0, [income, item], "")));
        Invalid(expense with { Id = income.Id }); Invalid(expense with { AmountCents = -1 });
        Invalid(expense with { Source = "" }); Invalid(expense with { SourceMonth = null });
        Invalid(expense with { SourceMonth = "2026-10" }); Invalid(expense with { Basis = "Pago" });
        Assert.Throws<FinancialRuleException>(() => MonthlyControlRules.Validate("2026-13", new(0, [income, expense], "")));
        Assert.Throws<FinancialRuleException>(() => MonthlyControlRules.Validate("2026-09", new(0, [income], "")));
    }
}
