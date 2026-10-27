using System.Globalization;
using System.Text.Json;
using LongBeach.Contracts.Finance;

namespace LongBeach.Application.Finance;

/// <summary>A reviewed monthly composition. Never creates a bank payment, debt or receipt.</summary>
public static class MonthlyControlRules
{
    public const string Kind = "monthlyFinanceControls";
    public static DateOnly Month(string month) => DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture,
        DateTimeStyles.None, out var date) && date.Year is >= 2000 and <= 2100
        ? date : throw new FinancialRuleException("Informe uma competência válida.");

    public static void Validate(string month, MonthlyControlInput input)
    {
        var date = Month(month);
        if (input.Version < 0 || input.Lines is null || input.Lines.Length is < 1 or > 100 || input.Notes is null || input.Notes.Length > 4000 ||
            System.Text.Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(input)) > 65536)
            throw new FinancialRuleException("Confira os valores e as observações do controle mensal.");
        if (input.Lines.Any(x => x is null) || input.Lines.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() != input.Lines.Length)
            throw new FinancialRuleException("Há linhas sem identificação ou repetidas no controle.");
        foreach (var line in input.Lines)
        {
            var allocationError = BusinessAllocationRules.Validate(line.CostCenter, line.AllocationScope, line.BusinessUnitId);
            if (allocationError is not null) throw new FinancialRuleException(allocationError);
            if (!Guid.TryParse(line.Id, out var id) || id == Guid.Empty || string.IsNullOrWhiteSpace(line.Label) || line.Label.Length > 160 ||
                line.Direction is not ("Receita" or "Despesa") || line.Category is not ("Operação" or "Fixa" or "Variável" or "Parcela" or "Acerto") ||
                line.CostCenter is not ("Arena" or "Bar" or "Escola" or "Locações") || line.AmountCents is < 0 or > 99999999999 ||
                line.Basis is not ("Informado" or "Estimado") || string.IsNullOrWhiteSpace(line.Source) || line.Source.Length > 1500)
                throw new FinancialRuleException("Confira descrição, valor, classificação e origem de cada linha.");
            if (line.SourceMonth is not null && Month(line.SourceMonth) > date)
                throw new FinancialRuleException("A competência de referência não pode ser posterior ao controle.");
            if (line.Basis == "Estimado" && line.SourceMonth is null)
                throw new FinancialRuleException("Indique o mês de referência da estimativa.");
        }
        if (!input.Lines.Any(x => x.Direction == "Receita") || !input.Lines.Any(x => x.Direction == "Despesa"))
            throw new FinancialRuleException("O controle precisa de receitas e despesas identificadas; zero informado continua válido.");
    }

    public static MonthlyControlTotals Totals(IEnumerable<MonthlyControlLine> lines)
    {
        var rows = lines.ToArray();
        var income = rows.Where(x => x.Direction == "Receita").Sum(x => x.AmountCents);
        var expense = rows.Where(x => x.Direction == "Despesa").Sum(x => x.AmountCents);
        return new(income, expense, checked(income - expense),
            rows.Where(x => x.Direction == "Receita" && x.Basis == "Estimado").Sum(x => x.AmountCents),
            rows.Where(x => x.Direction == "Despesa" && x.Basis == "Estimado").Sum(x => x.AmountCents),
            rows.Count(x => x.Basis == "Estimado"));
    }

    public static MonthlyControlBalance Balance(MonthlyControlDocument control)
    {
        Validate(control.Month, new(control.Version, control.Lines, control.Notes));
        var totals = Totals(control.Lines);
        return new(control.Month, totals.ResultCents, totals.IncomeCents, totals.ExpenseCents,
            control.Lines.Length, ["Controle mensal revisado"],
            totals.EstimatedRecords > 0 ? "Inclui valores estimados. Confira o controle mensal." : "Totais informados; conciliação individual no controle mensal.",
            "revisado", totals.EstimatedRecords > 0, totals.EstimatedExpenseCents, ExpenseBreakdown(control.Lines));
    }

    public static MonthlyExpenseBreakdown ExpenseBreakdown(IEnumerable<MonthlyControlLine> lines)
    {
        var expenses = lines.Where(x => x.Direction == "Despesa").ToArray();
        long Sum(string category) => expenses.Where(x => x.Category == category).Sum(x => x.AmountCents);
        return new(Sum("Fixa"), Sum("Variável"), Sum("Parcela"), Sum("Acerto"),
            expenses.Where(x => x.Category is not ("Fixa" or "Variável" or "Parcela" or "Acerto")).Sum(x => x.AmountCents));
    }
}

public sealed class MonthlyControlConflictException(string message) : Exception(message);
