using System.Globalization;
using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Application.Operations;
using LongBeach.Contracts.Overview;

namespace LongBeach.Application.Overview;

public interface IOwnerOverview
{
    Task<OwnerOverviewResponse> Read(string? month, CancellationToken ct);
}

public sealed record OwnerOverviewRecord(Guid Id, string Kind, string Payload);
public sealed record OwnerOverviewSettlement(Guid EntryId, string State, decimal Amount, decimal Refunded, DateTimeOffset? PaidAtUtc);
public sealed record OwnerOverviewBarItem(string State, decimal Total, DateTimeOffset? AcceptedAtUtc);
public sealed record OwnerOverviewBarPayment(string State, decimal Amount, DateTimeOffset? ConfirmedAtUtc);
public sealed record OwnerOverviewBarRefund(string State, decimal Amount, DateTimeOffset? ConfirmedAtUtc);
public sealed record OwnerOverviewLegacyBarEvent(string Name, decimal Amount, DateTimeOffset CreatedAtUtc);
public sealed record OwnerOverviewData(IReadOnlyList<OwnerOverviewRecord> Records,
    IReadOnlyList<OwnerOverviewSettlement> Settlements, IReadOnlyList<OwnerOverviewBarItem> BarItems,
    IReadOnlyList<OwnerOverviewBarPayment> BarPayments, IReadOnlyList<OwnerOverviewBarRefund> BarRefunds,
    IReadOnlyList<OwnerOverviewLegacyBarEvent>? LegacyBarEvents = null);

public static class OwnerOverviewRules
{
    public const string ZoneId = "America/Sao_Paulo";
    private static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById(ZoneId);
    private static readonly OwnerPhysicalTargets Targets = new(5, 6, 2, 25, 150, 14);
    private sealed record Row(Guid Id, string Kind, JsonElement Data);
    private sealed record PricedRow(Guid Id, int WeekDay, long? Price, Guid? StudentId = null);
    private sealed record Charge(Row Row, Guid SourceId, string SourceKind, long Amount);

    public static DateOnly LocalDate(DateTimeOffset now) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, Zone).DateTime);

    public static DateOnly Month(string? month, DateTimeOffset now)
    {
        if (month is null) return new(LocalDate(now).Year, LocalDate(now).Month, 1);
        if (!DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var first)
            || first.Year >= 9999 || month != first.ToString("yyyy-MM", CultureInfo.InvariantCulture))
            throw new FinancialRuleException("Selecione uma competência válida no formato ano-mês.");
        return first;
    }

    public static (DateTimeOffset FromUtc, DateTimeOffset ToUtc) Period(DateOnly month)
    {
        static DateTimeOffset Utc(DateOnly day) => new(TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(TimeOnly.MinValue), Zone));
        return (Utc(month), Utc(month.AddMonths(1)));
    }

    public static OwnerOverviewResponse Summarize(OwnerOverviewData data, string? month, DateTimeOffset now)
    {
        var first = Month(month, now);
        var competence = first.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        var today = LocalDate(now);
        var warnings = new Warnings();
        var rows = Parse(data.Records, warnings);
        var students = rows.Where(r => r.Kind == "students").Select(r => r.Id).ToHashSet();
        var classes = new Dictionary<Guid, int>();
        foreach (var row in rows.Where(r => r.Kind == "classes" && Text(r.Data, "status") == "Ativa" && !ClassDeletionRules.IsDeleted(r.Data)))
        {
            if (!OptionalDate(row.Data, "startDate", out var starts) || !WeekDay(row.Data, out var day))
            { warnings.Add("invalid_classes", "Turmas com data ou dia da semana inválido foram excluídas da carteira atual."); continue; }
            if (starts is null || starts <= today) classes.Add(row.Id, day);
        }

        var enrollmentCandidates = new List<PricedRow>();
        var enrollmentPairs = new Dictionary<Guid, (Guid Student, Guid Class)>();
        foreach (var row in rows.Where(r => r.Kind == "enrollments" && Text(r.Data, "status") == "Ativa" && !ClassDeletionRules.Flag(r.Data, "cancelledBeforeStart")))
        {
            if (!Date(row.Data, "startDate", out var starts) || !OptionalDate(row.Data, "endDate", out var ends) || ends < starts)
            { warnings.Add("invalid_enrollment_dates", "Matrículas com vigência inválida foram excluídas da carteira atual."); continue; }
            if (starts > today || ends < today) continue;
            if (!Id(row.Data, "studentId", out var student) || !students.Contains(student) || !Id(row.Data, "classId", out var lesson))
            { warnings.Add("invalid_enrollment_links", "Matrículas sem aluno ou turma identificados foram excluídas da carteira atual."); continue; }
            if (!classes.TryGetValue(lesson, out var day))
            { warnings.Add("inactive_class_enrollments", "Matrículas ativas em turmas fora da grade atual não compõem a carteira."); continue; }
            var price = Price(row.Data, warnings);
            enrollmentCandidates.Add(new(row.Id, day, price, student));
            enrollmentPairs.Add(row.Id, (student, lesson));
        }
        var duplicatedEnrollments = enrollmentPairs.GroupBy(x => x.Value).Where(g => g.Count() > 1).SelectMany(g => g.Select(x => x.Key)).ToHashSet();
        warnings.Add("duplicate_enrollments", "Matrículas repetidas para o mesmo aluno e turma foram excluídas; confira os vínculos antes de somar valores.", duplicatedEnrollments.Count);
        var enrollments = enrollmentCandidates.Where(x => !duplicatedEnrollments.Contains(x.Id)).ToArray();

        var rentals = new List<PricedRow>();
        foreach (var row in rows.Where(r => r.Kind == "rentalGroups" && Text(r.Data, "status") == "Ativo"))
        {
            if (!Date(row.Data, "startDate", out var starts) || !OptionalDate(row.Data, "endDate", out var ends) || ends < starts || !WeekDay(row.Data, out var day))
            { warnings.Add("invalid_rental_agreements", "Grupos com vigência ou dia da semana inválido foram excluídos da carteira atual."); continue; }
            if (starts > today || ends < today) continue;
            rentals.Add(new(row.Id, day, Price(row.Data, warnings)));
        }

        var schoolPrices = enrollments.Where(x => x.Price.HasValue).Select(x => x.Price!.Value).ToArray();
        var rentalPrices = rentals.Where(x => x.Price.HasValue).Select(x => x.Price!.Value).ToArray();
        var schoolMissing = enrollments.Length - schoolPrices.Length;
        var rentalMissing = rentals.Count - rentalPrices.Length;
        warnings.Add("school_prices_missing", "Há mensalidades de matrículas a combinar; a base conhecida não representa toda a carteira.", schoolMissing);
        warnings.Add("rental_prices_missing", "Há mensalidades de grupos a combinar; a base conhecida não representa toda a carteira.", rentalMissing);
        var weekdays = Enumerable.Range(0, 7).Select(day => new OwnerWeekdayOverview(day,
            classes.Values.Count(d => d == day), enrollments.Count(x => x.WeekDay == day), rentals.Count(x => x.WeekDay == day),
            Goal(enrollments, schoolPrices, day, IsSchoolGoalDay(day) ? Targets.ClassesPerWeekday * Targets.PlacesPerClass : 0),
            Goal(rentals, rentalPrices, day, Targets.RentalGroupsPerWeekday))).ToArray();
        var schoolTarget = CompleteTotal(weekdays.Where(x => IsSchoolGoalDay(x.WeekDay)).Select(x => x.SchoolGoal.EstimatedMonthlyCents));
        var rentalTarget = CompleteTotal(weekdays.Select(x => x.RentalGoal.EstimatedMonthlyCents));
        var knownMonthly = checked(schoolPrices.Sum() + rentalPrices.Sum());
        var finance = Finance(rows, data.Settlements, competence, today, now, warnings);
        var bar = Bar(data, first, now, warnings);
        var legacyBar = LegacyBar(data.LegacyBarEvents ?? [], first, now, warnings);
        return new(competence, today, now, ZoneId,
            new(enrollments.Select(x => x.StudentId).Distinct().Count(), enrollments.Length, classes.Count, schoolPrices.Sum(), schoolPrices.Length, schoolMissing),
            new(rentals.Count, rentalPrices.Sum(), rentalPrices.Length, rentalMissing),
            new(knownMonthly, schoolMissing + rentalMissing, schoolTarget, rentalTarget,
                schoolTarget.HasValue && rentalTarget.HasValue ? checked(schoolTarget.Value + rentalTarget.Value) : null, null),
            Targets, weekdays, new(finance.School, finance.Rentals, finance.OtherSchool, bar, legacyBar), warnings.Items());
    }

    private static bool IsSchoolGoalDay(int day) => day is >= 1 and <= 5;

    private static OwnerGoalEstimate Goal(IEnumerable<PricedRow> rows, long[] global, int day, int quantity)
    {
        var local = rows.Where(x => x.WeekDay == day && x.Price.HasValue).Select(x => x.Price!.Value).ToArray();
        var samples = local.Length > 0 ? local : global;
        if (samples.Length == 0) return new(null, null, 0, "missing", false);
        var average = samples.Sum(x => (decimal)x) / samples.Length;
        return new(Round(average * quantity), Round(average), samples.Length, local.Length > 0 ? "weekday" : "segment", local.Length == 0);
    }

    private static long? CompleteTotal(IEnumerable<long?> values)
    {
        var rows = values.ToArray();
        return rows.Any(x => x is null) ? null : rows.Sum(x => x!.Value);
    }

    private static (OwnerCompetenceFinance School, OwnerCompetenceFinance Rentals, OwnerCompetenceFinance OtherSchool) Finance(
        Row[] rows, IReadOnlyList<OwnerOverviewSettlement> payments, string month, DateOnly today, DateTimeOffset now, Warnings warnings)
    {
        var first = Month(month, now); var next = first.AddMonths(1);
        var sources = rows.ToDictionary(x => x.Id);
        var charges = new List<Charge>();
        foreach (var row in rows.Where(x => x.Kind == "financeEntries" && Text(x.Data, "direction") == "Receber" && Text(x.Data, "status") != "Cancelado"))
        {
            var sourceKind = Text(row.Data, "sourceKind");
            if (sourceKind is not ("enrollments" or "rentalMonths"))
            {
                Row? linkedSource = null;
                var hasSourceId = row.Data.TryGetProperty("sourceId", out var sourceIdField) && sourceIdField.ValueKind != JsonValueKind.Null
                    && (sourceIdField.ValueKind != JsonValueKind.String || !string.IsNullOrEmpty(sourceIdField.GetString()));
                if (hasSourceId && (!Id(row.Data, "sourceId", out var linkedId) || !sources.TryGetValue(linkedId, out linkedSource) || linkedSource.Kind != sourceKind))
                {
                    if (Text(row.Data, "origin") == "Escola" || sourceKind == "reservations")
                        warnings.Add("invalid_charge_links", "Cobranças com origem ausente ou competência conflitante foram excluídas.");
                    continue;
                }
                // Finance remains authoritative: do not add reservation.amount or
                // remove a historical charge because its reservation was canceled.
                var otherSchool = Text(row.Data, "origin") == "Escola"
                    || linkedSource is { Kind: "reservations" } && Text(linkedSource.Data, "activityKind") is "SingleLesson" or "Trial";
                if (otherSchool)
                {
                    if (!Date(row.Data, "dueDate", out var schoolDue))
                    { warnings.Add("school_due_date_missing", "Outras receitas de aulas sem vencimento válido foram excluídas do período."); continue; }
                    if (schoolDue < first || schoolDue >= next) continue;
                    if (!Money(row.Data, "amount", out var otherAmount) || otherAmount <= 0 || Text(row.Data, "status") is not ("Pendente" or "Pago"))
                    { warnings.Add("invalid_charges", "Cobranças com valor ou situação inválidos foram excluídas."); continue; }
                    charges.Add(new(row, linkedSource?.Id ?? Guid.Empty, "other-school", otherAmount));
                }
                else if ((Text(row.Data, "month") == month
                    || Date(row.Data, "dueDate", out var otherDue) && otherDue >= first && otherDue < next
                    || Date(row.Data, "paidDate", out var otherPaidDate) && otherPaidDate >= first && otherPaidDate < next)
                    && Text(row.Data, "origin") is "Escola" or "Locações" or "Bar")
                    warnings.Add("unallocated_receipts", "Há outros lançamentos do período fora das mensalidades, receitas de aulas e fontes identificadas do Bar; confira o financeiro geral.");
                continue;
            }
            if (!TryMonth(Text(row.Data, "month")))
            { warnings.Add("charge_competence_missing", "Cobranças sem competência válida foram excluídas do resumo financeiro."); continue; }
            if (Text(row.Data, "month") != month) continue;
            if (!Id(row.Data, "sourceId", out var sourceId) || !sources.TryGetValue(sourceId, out var source) || source.Kind != sourceKind
                || sourceKind == "rentalMonths" && Text(source.Data, "month") != month)
            { warnings.Add("invalid_charge_links", "Cobranças com origem ausente ou competência conflitante foram excluídas."); continue; }
            if (!Money(row.Data, "amount", out var amount) || amount <= 0 || Text(row.Data, "status") is not ("Pendente" or "Pago"))
            { warnings.Add("invalid_charges", "Cobranças com valor ou situação inválidos foram excluídas."); continue; }
            charges.Add(new(row, sourceId, sourceKind, amount));
        }
        // Recurring charges are unique per agreement/competence. Several charges
        // for the same single lesson/trial are permitted; do not collapse them.
        var duplicated = charges.Where(x => x.SourceKind != "other-school").GroupBy(x => (x.SourceKind, x.SourceId))
            .Where(g => g.Count() > 1).SelectMany(g => g.Select(x => x.Row.Id)).ToHashSet();
        warnings.Add("duplicate_charges", "Cobranças ativas repetidas na mesma origem e competência foram excluídas para evitar duplicidade.", duplicated.Count);
        var settlements = payments.ToLookup(x => x.EntryId);
        OwnerCompetenceFinance Segment(string kind)
        {
            long billed = 0, received = 0, overdue = 0;
            int count = 0, partial = 0, manual = 0, overdueCount = 0;
            foreach (var charge in charges.Where(x => x.SourceKind == kind && !duplicated.Contains(x.Row.Id)))
            {
                var related = settlements[charge.Row.Id].ToArray();
                long paid = 0;
                foreach (var payment in related.Where(x => x.State is "Approved" or "Refunded"))
                {
                    if (!Money(payment.Amount, out var amount) || !Money(payment.Refunded, out var refund) || refund > amount || amount <= 0
                        || payment.PaidAtUtc is null || payment.PaidAtUtc > now)
                    { warnings.Add("invalid_settlements", "Liquidações com valor ou data inválidos não foram consideradas como recebidas."); continue; }
                    paid = checked(paid + amount - refund);
                }
                if (Text(charge.Row.Data, "status") == "Pago" && related.All(x => x.State == "Canceled"))
                {
                    if (Date(charge.Row.Data, "paidDate", out var paidDate) && paidDate <= today) { paid = charge.Amount; manual++; }
                    else warnings.Add("manual_paid_date_invalid", "Lançamentos marcados como pagos sem data confirmada válida não foram considerados como recebidos.");
                }
                if (paid > charge.Amount) warnings.Add("settlement_above_charge", "Há liquidação acima da cobrança; o recebido foi limitado ao valor emitido.");
                paid = Math.Clamp(paid, 0, charge.Amount);
                billed = checked(billed + charge.Amount); received = checked(received + paid); count++;
                if (paid > 0 && paid < charge.Amount) partial++;
                if (!Date(charge.Row.Data, "dueDate", out var due))
                    warnings.Add("charge_due_date_missing", "Cobranças sem vencimento válido não puderam ser classificadas como vencidas.");
                else if (due < today && paid < charge.Amount)
                { overdue = checked(overdue + charge.Amount - paid); overdueCount++; }
            }
            return new(billed, received, billed - received, count, partial, manual, overdue, overdueCount, kind == "other-school" ? "due-date" : "competence");
        }
        return (Segment("enrollments"), Segment("rentalMonths"), Segment("other-school"));
    }

    private static OwnerBarFinance Bar(OwnerOverviewData data, DateOnly month, DateTimeOffset now, Warnings warnings)
    {
        var (from, to) = Period(month);
        bool Included(DateTimeOffset? date)
        {
            if (date is null || date > now) { warnings.Add("invalid_bar_dates", "Registros do Bar sem data confirmada válida foram excluídos do período."); return false; }
            return date >= from && date < to;
        }
        long consumed = 0, gross = 0, refunds = 0;
        int items = 0, receipts = 0, returns = 0;
        foreach (var item in data.BarItems.Where(x => x.State is "Accepted" or "Fulfilled"))
            if (Included(item.AcceptedAtUtc))
            {
                if (!Money(item.Total, out var cents)) { warnings.Add("invalid_bar_amounts", "Valores inválidos do Bar foram excluídos do período."); continue; }
                consumed = checked(consumed + cents); items++;
            }
        foreach (var payment in data.BarPayments.Where(x => x.State == "Approved"))
            if (Included(payment.ConfirmedAtUtc))
            {
                if (!Money(payment.Amount, out var cents)) { warnings.Add("invalid_bar_amounts", "Valores inválidos do Bar foram excluídos do período."); continue; }
                gross = checked(gross + cents); receipts++;
            }
        foreach (var refund in data.BarRefunds.Where(x => x.State == "Confirmed"))
            if (Included(refund.ConfirmedAtUtc))
            {
                if (!Money(refund.Amount, out var cents)) { warnings.Add("invalid_bar_amounts", "Valores inválidos do Bar foram excluídos do período."); continue; }
                refunds = checked(refunds + cents); returns++;
            }
        return new(consumed, gross, refunds, gross - refunds, items, receipts, returns);
    }

    private static OwnerLegacyBarFinance LegacyBar(IReadOnlyList<OwnerOverviewLegacyBarEvent> events, DateOnly month, DateTimeOffset now, Warnings warnings)
    {
        var (from, to) = Period(month);
        long gross = 0, refunds = 0; int receipts = 0, returns = 0;
        foreach (var entry in events.Where(x => x.Name is "SalePaid" or "SaleRefunded"))
        {
            if (entry.CreatedAtUtc < from || entry.CreatedAtUtc >= to) continue;
            if (entry.CreatedAtUtc > now)
            { warnings.Add("invalid_legacy_bar_dates", "Eventos do Bar antigo com data futura foram excluídos do período."); continue; }
            var amount = entry.Name == "SaleRefunded" ? -entry.Amount : entry.Amount;
            if (!Money(amount, out var cents) || cents <= 0)
            { warnings.Add("invalid_legacy_bar_amounts", "Eventos do Bar antigo com valor ou sinal inválido foram excluídos do período."); continue; }
            if (entry.Name == "SalePaid") { gross = checked(gross + cents); receipts++; }
            else { refunds = checked(refunds + cents); returns++; }
        }
        return new(gross, refunds, gross - refunds, receipts, returns);
    }

    private static Row[] Parse(IEnumerable<OwnerOverviewRecord> records, Warnings warnings)
    {
        var rows = new List<Row>();
        foreach (var row in records)
        {
            try
            {
                using var document = JsonDocument.Parse(row.Payload);
                if (row.Id == Guid.Empty || document.RootElement.ValueKind != JsonValueKind.Object) throw new JsonException();
                rows.Add(new(row.Id, row.Kind, document.RootElement.Clone()));
            }
            catch (JsonException) { warnings.Add("invalid_records", "Registros com dados inválidos foram excluídos dos indicadores."); }
        }
        var duplicated = rows.GroupBy(x => x.Id).Where(g => g.Count() > 1).Select(g => g.Key).ToHashSet();
        warnings.Add("duplicate_record_ids", "Identificadores repetidos foram excluídos dos indicadores.", rows.Count(x => duplicated.Contains(x.Id)));
        return rows.Where(x => !duplicated.Contains(x.Id)).ToArray();
    }

    private static string Text(JsonElement row, string key) => row.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    private static bool Id(JsonElement row, string key, out Guid id) => Guid.TryParse(Text(row, key), out id) && id != Guid.Empty;
    private static bool Date(JsonElement row, string key, out DateOnly value) => DateOnly.TryParseExact(Text(row, key), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out value);
    private static bool OptionalDate(JsonElement row, string key, out DateOnly? value)
    {
        value = null;
        if (!row.TryGetProperty(key, out var field) || field.ValueKind == JsonValueKind.Null || field.ValueKind == JsonValueKind.String && field.GetString() == "") return true;
        if (!Date(row, key, out var parsed)) return false;
        value = parsed; return true;
    }
    private static bool WeekDay(JsonElement row, out int day)
    {
        day = 0;
        return row.TryGetProperty("weekDay", out var field) && field.ValueKind == JsonValueKind.Number && field.TryGetInt32(out day) && day is >= 0 and <= 6;
    }
    private static long? Price(JsonElement row, Warnings warnings)
    {
        if (!row.TryGetProperty("monthlyAmount", out var value) || value.ValueKind == JsonValueKind.Null) return null;
        if (Money(row, "monthlyAmount", out var cents)) return cents;
        warnings.Add("invalid_agreement_prices", "Mensalidades com preço inválido foram tratadas como valores a confirmar.");
        return null;
    }
    private static bool Money(JsonElement row, string key, out long cents)
    {
        cents = 0;
        return row.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var amount) && Money(amount, out cents);
    }
    private static bool Money(decimal value, out long cents)
    {
        cents = 0;
        if (value < 0 || value > 999_999_999 || decimal.Round(value, 2) != value) return false;
        cents = checked((long)(value * 100)); return true;
    }
    private static bool TryMonth(string month) => DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var value)
        && value.Year < 9999 && month == value.ToString("yyyy-MM", CultureInfo.InvariantCulture);
    private static long Round(decimal cents) => checked((long)decimal.Round(cents, 0, MidpointRounding.AwayFromZero));

    private sealed class Warnings
    {
        private readonly Dictionary<string, OwnerOverviewWarning> values = new(StringComparer.Ordinal);
        public void Add(string code, string message, int count = 1)
        {
            if (count <= 0) return;
            values[code] = new(code, values.GetValueOrDefault(code)?.Count + count ?? count, message);
        }
        public OwnerOverviewWarning[] Items() => values.Values.OrderBy(x => x.Code, StringComparer.Ordinal).ToArray();
    }
}
