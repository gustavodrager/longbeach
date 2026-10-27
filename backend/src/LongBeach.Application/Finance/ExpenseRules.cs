using System.Globalization;
using System.Text.Json;
using LongBeach.Contracts.Finance;

namespace LongBeach.Application.Finance;

// The expense is the existing financeEntries record. A partner advance changes its creditor,
// and company payments settle that same obligation; neither creates another expense.
public sealed record ExpenseMetadata(int Schema, string Kind, string Category, string Beneficiary,
    DateOnly ExpenseDate, DateOnly? DueDate, string PaidBy, Guid? PartnerId, string? PartnerName,
    Guid? TeamMemberId, string? TeamBasis, string? ReferenceMonth, DateOnly? WorkDate, string? Shift,
    string? Reference, Guid? PurchaseId, decimal PaidAmount, string RequestHash);

public static class ExpenseRules
{
    public const string PaymentKind = "expensePayments";
    public const string PartnerKind = "expensePartners";
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static DateOnly Today(TimeProvider clock) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo")).DateTime);
    public static bool Managed(JsonElement body) => body.TryGetProperty("expense", out var metadata) && metadata.ValueKind == JsonValueKind.Object;
    public static ExpenseMetadata? Metadata(JsonElement body) => Managed(body) ? body.GetProperty("expense").Deserialize<ExpenseMetadata>(Json) : null;
    public static bool Reserved(JsonElement body) => body.EnumerateObject().Any(x => x.Name.StartsWith("expense", StringComparison.OrdinalIgnoreCase)) || Text(body, "sourceKind") == "barPurchases";
    public static string Text(JsonElement body, string key) => body.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    public static void Money(decimal amount)
    {
        if (amount <= 0 || amount > 999_999_999m || decimal.Round(amount, 2) != amount)
            throw new ExpenseRuleException("Informe um valor maior que zero, com até duas casas decimais.");
    }
    public static string Required(string? value, int limit, string label)
    {
        var normalized = value?.Trim() ?? "";
        if (normalized.Length == 0 || normalized.Length > limit) throw new ExpenseRuleException($"Confira {label} (até {limit} caracteres).");
        return normalized;
    }
    public static string? Optional(string? value, int limit, string label) => string.IsNullOrWhiteSpace(value) ? null : Required(value, limit, label);
    public static ExpenseInput Normalize(ExpenseInput input, DateOnly today)
    {
        Money(input.Amount);
        if (input.ExpenseDate == default || input.ExpenseDate > today) throw new ExpenseRuleException("A data da despesa deve ser até hoje.");
        if (input.DueDate == default(DateOnly)) throw new ExpenseRuleException("Confira o vencimento ou deixe sem prazo.");
        if (input.Kind is not ("Expense" or "Team") || input.PaidBy is not ("Pending" or "Company" or "Partner")) throw new ExpenseRuleException("Confira o tipo de despesa e quem pagou.");
        if (input.Origin is not ("Bar" or "Escola" or "Locações" or "Arena")) throw new ExpenseRuleException("Confira a origem da despesa.");
        if (input.PaidBy == "Partner" && (input.PartnerId is null || input.PartnerId == Guid.Empty)) throw new ExpenseRuleException("Escolha o sócio que adiantou o valor.");
        if (input.PaidBy != "Partner" && input.PartnerId is not null) throw new ExpenseRuleException("Informe o sócio somente para compra paga pessoalmente por ele.");
        if (input.PaidBy == "Company" && (input.PaidDate is null || input.PaidDate == default(DateOnly) || input.PaidDate > today)) throw new ExpenseRuleException("Informe a data do pagamento confirmado, até hoje.");
        if (input.PaidBy != "Company" && input.PaidDate is not null) throw new ExpenseRuleException("A data de baixa só se aplica a pagamento pela empresa.");
        if (input.Kind == "Team")
        {
            if (input.TeamMemberId is null || input.TeamMemberId == Guid.Empty || input.TeamBasis is not ("Monthly" or "Daily")) throw new ExpenseRuleException("Escolha a pessoa e a referência do pagamento da equipe.");
            if (input.TeamBasis == "Monthly")
            {
                if (!DateOnly.TryParseExact(input.ReferenceMonth + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var month) || month > today || input.WorkDate is not null || !string.IsNullOrWhiteSpace(input.Shift))
                    throw new ExpenseRuleException("Informe uma competência mensal até o mês atual.");
            }
            else if (input.WorkDate is null || input.WorkDate == default(DateOnly) || input.WorkDate > today || input.ReferenceMonth is not null)
                throw new ExpenseRuleException("Informe o dia trabalhado, até hoje.");
        }
        else if (input.TeamMemberId is not null || input.TeamBasis is not null || input.ReferenceMonth is not null || input.WorkDate is not null || input.Shift is not null)
            throw new ExpenseRuleException("Referência de equipe só se aplica a pagamento de funcionário.");
        return input with
        {
            Description = Required(input.Description, 240, "a descrição"),
            Category = string.IsNullOrWhiteSpace(input.Category) ? "General" : Required(input.Category, 80, "a categoria"),
            Beneficiary = input.Kind == "Team" ? "" : Optional(input.Beneficiary, 240, "o beneficiário") ?? "",
            Shift = Optional(input.Shift, 100, "o turno"), Reference = Optional(input.Reference, 160, "a referência"),
            Notes = Optional(input.Notes, 2000, "as observações"), DocumentReference = Optional(input.DocumentReference, 240, "a referência do comprovante"),
            PaymentMethod = Required(input.PaymentMethod, 40, "a forma de pagamento"), AccountReference = Optional(input.AccountReference, 100, "a conta"),
            AllocationScope = input.AllocationScope ?? (input.Origin == "Arena" ? "Unclassified" : "Unit"),
            BusinessUnitId = input.BusinessUnitId ?? (input.Origin == "Arena" ? null : input.Origin == "Bar" ? "bar" : "quadra")
        };
    }
    public static ExpensePaymentInput Normalize(ExpensePaymentInput input, DateOnly today)
    {
        Money(input.Amount);
        if (input.OperationId == Guid.Empty || input.Version < 0) throw new ExpenseRuleException("Confira a chave da operação e a versão do lançamento.");
        if (input.PaidDate == default || input.PaidDate > today) throw new ExpenseRuleException("Informe a data do pagamento confirmado, até hoje.");
        return input with { PaymentMethod = Required(input.PaymentMethod, 40, "a forma de pagamento"), AccountReference = Optional(input.AccountReference, 100, "a conta") };
    }
    public static decimal Remaining(decimal amount, decimal paid, string state) => state == "Cancelado" ? 0m : Math.Max(0m, amount - paid);
    public static void PaymentAllowed(decimal amount, decimal paid, decimal payment, string state)
    {
        Money(payment);
        if (state != "Pendente" || payment > Remaining(amount, paid, state)) throw new ExpenseRuleException("O pagamento excede o saldo ou o lançamento já foi concluído.", true);
    }
}
