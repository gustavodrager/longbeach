using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;

namespace LongBeach.UnitTests;

public sealed class ArenaHistoryRulesTests
{
    private static FinancialObservation Row(string series, string state = "Pago", long amount = 10000, string month = "2026-09", string notes = "", string label = "Pessoa teste")
    {
        var first = DateOnly.Parse(month + "-01");
        return new("financial-observation-v1", "BRL", "Teste!A2", series, series == "aulas" ? "valor-escalonavel" : "valor-informado", label, state,
            first, series == "aulas" ? first : first.AddMonths(1).AddDays(-1), series == "aulas" ? "day" : "month", amount, notes);
    }
    private static ArenaHistorySummary Summary(params FinancialObservation[] rows) => ArenaHistoryRules.Summarize(rows, [], null, DateTimeOffset.UtcNow);

    [Fact] public void Receipts_include_only_paid_rows_and_keep_unpaid_zero_as_a_record()
    {
        var result = Summary(Row("alunos", label: " Ana  Teste "), Row("alunos", amount: 5000, label: "ANA TESTE"),
            Row("alunos", "Não Pago", 0), Row("alunos", "Cobrado", 9000), Row("alunos", "Desistiu", 8000));
        Assert.Equal(15000, result.Students!.PaidAmountCents); Assert.Equal(2, result.Students.PaidRecords);
        Assert.Equal(1, result.Students.PaidNames); Assert.Equal(2, result.Students.UnpaidRecords); Assert.Equal(1, result.Students.OtherRecords);
    }
    [Fact] public void Latest_period_is_independent_per_control_and_explicit_month_does_not_fallback()
    {
        var rows = new[] { Row("alunos"), Row("alunos", amount: 999999, month: "2026-08"), Row("aulas", month: "2026-03", label: "Aula 18:00 até 19:00") };
        var result = Summary(rows); Assert.Equal("2026-09", result.Students!.Month); Assert.Equal(10000, result.Students.PaidAmountCents);
        Assert.Equal("2026-03", result.Lessons!.Month); Assert.Null(result.Rentals);
        Assert.Null(ArenaHistoryRules.Summarize(rows, [], "2026-09", DateTimeOffset.UtcNow).Lessons);
        Assert.Null(ArenaHistoryRules.Summarize(rows, [], "2026-10", DateTimeOffset.UtcNow).Students);
    }
    [Fact] public void Rental_hours_sum_source_intervals_and_exclude_released_or_reviewed_slots()
    {
        const string slot = """{"Dia da Semana":"Terça-feira","Horário":"18:30 até 20:00"}""";
        var result = Summary(Row("mensalistas", notes: slot), Row("mensalistas", "Não Pago", notes: slot),
            Row("mensalistas", "Entregou Horário", notes: slot), Row("mensalistas", "Revisão", notes: slot));
        Assert.Equal(180, result.Rentals!.WeeklyMinutes); Assert.Equal(2, result.Rentals.ScheduleRecords);
        var group = Assert.Single(result.Rentals.Schedule); Assert.Equal(1, group.PaidRecords); Assert.Equal(1, group.UnpaidRecords);
    }
    [Theory]
    [InlineData("")]
    [InlineData("not-json")]
    [InlineData("[]")]
    [InlineData("{\"Dia da Semana\":\"Terça-feira\",\"Horário\":\"23:00 até 01:00\"}")]
    [InlineData("{\"Dia da Semana\":\"Terça-feira\",\"Horário\":\"25:00 até 26:00\"}")]
    public void Incomplete_schedule_never_yields_a_misleading_partial_total(string notes)
    {
        var result = Summary(Row("mensalistas", notes: notes), Row("mensalistas", notes: """{"Dia da Semana":"Segunda-feira","Horário":"18:00 até 19:00"}"""));
        Assert.Null(result.Rentals!.WeeklyMinutes); Assert.Equal(1, result.Rentals.InvalidSchedules);
    }
    [Fact] public void Lessons_exclude_cancellations_estimates_and_summaries_and_count_participations()
    {
        var row = Row("aulas", month: "2026-03", notes: "{\"quantidadeAlunos\":3}", label: "Aula 18:00 até 19:00");
        var result = Summary(row, row with { State = "Aula Ruivo", Notes = "{\"quantidadeAlunos\":4}", Label = "Aula 19:00 até 20:30" },
            row with { State = "Cancelada" }, row with { State = "Cancelado" }, row with { State = "Não informado" },
            row with { Grain = "month", AmountCents = 999999 }, Row("consolidado", amount: 999999));
        Assert.Equal(2, result.Lessons!.Lessons); Assert.Equal(2, result.Lessons.CancelledRecords); Assert.Equal(1, result.Lessons.OtherRecords);
        Assert.Equal(150, result.Lessons.Minutes); Assert.Equal(7, result.Lessons.Attendances); Assert.Equal(3.5m, result.Lessons.AverageAttendance);
    }
    [Fact] public void Missing_attendance_is_unavailable_while_zero_is_valid_and_empty_average_is_null()
    {
        var row = Row("aulas", notes: "{\"quantidadeAlunos\":0}", label: "Aula 18:00 até 19:00");
        Assert.Equal(0, Summary(row).Lessons!.Attendances); Assert.Equal(0m, Summary(row).Lessons!.AverageAttendance);
        var result = Summary(row, row with { Notes = "{}", Label = "Aula sem horário" });
        Assert.Null(result.Lessons!.Minutes); Assert.Null(result.Lessons.Attendances); Assert.Null(result.Lessons.AverageAttendance);
        Assert.Equal(1, result.Lessons.MissingAttendance);
        Assert.Null(Summary(row with { State = "Cancelada" }).Lessons!.AverageAttendance);
    }
}
