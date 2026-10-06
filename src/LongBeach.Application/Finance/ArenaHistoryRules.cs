using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using LongBeach.Contracts.Finance;

namespace LongBeach.Application.Finance;

public static partial class ArenaHistoryRules
{
    private static readonly string[] Days = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];

    // Use only the imported detail series. Monthly totals and estimates must not become lessons.
    public static bool IsControl(FinancialObservation row) => row.Series switch
    {
        "alunos" or "mensalistas" => row.Metric == "valor-informado" && row.Grain == "month",
        "aulas" => row.Metric == "valor-escalonavel" && row.Grain == "day",
        _ => false
    };

    public static ArenaHistorySummary Summarize(IEnumerable<FinancialObservation> observations,
        IReadOnlyList<string> months, string? month, DateTimeOffset queriedAt)
    {
        var rows = observations.Where(IsControl).ToArray();
        FinancialObservation[] Latest(string series)
        {
            var all = rows.Where(x => x.Series == series).ToArray();
            var selected = month ?? all.Select(x => x.PeriodStart.ToString("yyyy-MM")).OrderDescending().FirstOrDefault();
            return all.Where(x => x.PeriodStart.ToString("yyyy-MM") == selected).ToArray();
        }
        var students = Latest("alunos"); var rentals = Latest("mensalistas"); var lessons = Latest("aulas");
        return new(months, students.Length == 0 ? null : Payments(students),
            rentals.Length == 0 ? null : Rentals(rentals), lessons.Length == 0 ? null : Lessons(lessons), queriedAt);
    }

    private static string Normalize(string value) => string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();
    private static bool Paid(FinancialObservation row) => Normalize(row.State) == "PAGO";
    private static bool Unpaid(FinancialObservation row) => Normalize(row.State) is "NÃO PAGO" or "COBRADO";

    private static PaymentControlSummary Payments(FinancialObservation[] rows)
    {
        var paid = rows.Where(Paid).ToArray(); var unpaid = rows.Count(Unpaid);
        return new(rows[0].PeriodStart.ToString("yyyy-MM"), rows.Length, paid.Length,
            paid.Select(x => Normalize(x.Label)).Distinct(StringComparer.Ordinal).Count(),
            paid.Sum(x => x.AmountCents), unpaid, rows.Length - paid.Length - unpaid);
    }

    private static RentalControlSummary Rentals(FinancialObservation[] rows)
    {
        var active = rows.Where(x => Paid(x) || Unpaid(x)).ToArray();
        var schedule = new List<(string Day, string Hours, int Minutes, FinancialObservation Row)>();
        foreach (var row in active)
        {
            var day = Note(row, "Dia da Semana"); var hours = Note(row, "Horário");
            var canonicalDay = Days.FirstOrDefault(x => Normalize(x) == Normalize(day ?? ""));
            if (canonicalDay is not null && Duration(hours) is int minutes)
                schedule.Add((canonicalDay, hours!.Trim(), minutes, row));
        }
        // Each source row is one monthly control entry, not a confirmed booking or a court identity.
        var invalid = active.Length - schedule.Count;
        var grouped = schedule.GroupBy(x => (x.Day, x.Hours)).OrderBy(x => Array.IndexOf(Days, x.Key.Day)).ThenBy(x => x.Key.Hours)
            .Select(x => new RentalScheduleSummary(x.Key.Day, x.Key.Hours, x.Count(), x.Count(v => Paid(v.Row)), x.Count(v => Unpaid(v.Row)))).ToArray();
        return new(Payments(rows), active.Length, invalid == 0 ? schedule.Sum(x => x.Minutes) : null, invalid, grouped);
    }

    private static LessonControlSummary Lessons(FinancialObservation[] rows)
    {
        var included = rows.Where(x => Paid(x) || Normalize(x.State) == "AULA RUIVO").ToArray();
        var cancelled = rows.Count(x => Normalize(x.State) is "CANCELADA" or "CANCELADO");
        var minutes = included.Select(x => Duration(x.Label.StartsWith("Aula ", StringComparison.Ordinal) ? x.Label[5..] : null)).ToArray();
        var attendance = included.Select(Attendance).ToArray();
        var invalidHours = minutes.Count(x => x is null); var missingAttendance = attendance.Count(x => x is null);
        int? totalAttendance = missingAttendance == 0 ? attendance.Sum(x => x!.Value) : null;
        return new(rows[0].PeriodStart.ToString("yyyy-MM"), rows.Length, included.Length, cancelled,
            rows.Length - included.Length - cancelled, invalidHours == 0 ? minutes.Sum(x => x!.Value) : null,
            invalidHours, totalAttendance, missingAttendance,
            included.Length > 0 && totalAttendance is not null ? decimal.Round((decimal)totalAttendance / included.Length, 1, MidpointRounding.AwayFromZero) : null,
            rows.Max(x => x.PeriodStart));
    }

    private static string? Note(FinancialObservation row, string key)
    {
        try
        {
            using var json = JsonDocument.Parse(row.Notes);
            return json.RootElement.ValueKind == JsonValueKind.Object && json.RootElement.TryGetProperty(key, out var value)
                && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
        }
        catch (JsonException) { return null; }
    }
    private static int? Attendance(FinancialObservation row)
    {
        try
        {
            using var json = JsonDocument.Parse(row.Notes);
            return json.RootElement.ValueKind == JsonValueKind.Object && json.RootElement.TryGetProperty("quantidadeAlunos", out var value)
                && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var count) && count is >= 0 and <= 10000 ? count : null;
        }
        catch (JsonException) { return null; }
    }
    private static int? Duration(string? text)
    {
        var match = HoursPattern().Match(text?.Trim() ?? "");
        if (!match.Success || !TimeOnly.TryParseExact(match.Groups[1].Value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start)
            || !TimeOnly.TryParseExact(match.Groups[2].Value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var end) || end <= start) return null;
        return (int)(end - start).TotalMinutes;
    }
    [GeneratedRegex(@"^(\d{2}:\d{2})\s+até\s+(\d{2}:\d{2})$", RegexOptions.CultureInvariant)]
    private static partial Regex HoursPattern();
}
