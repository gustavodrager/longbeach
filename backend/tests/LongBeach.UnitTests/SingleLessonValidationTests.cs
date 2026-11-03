using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;

public sealed class SingleLessonValidationTests
{
    private static readonly Guid Court = Guid.NewGuid();
    private static readonly Guid OtherCourt = Guid.NewGuid();
    private static readonly Guid Teacher = Guid.NewGuid();
    private static readonly Guid Customer = Guid.NewGuid();
    private static readonly DateOnly Today = new(2026, 10, 4);
    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value);
    private static Dictionary<string, JsonElement[]> Records() => new()
    {
        ["courts"] = [Json(new { id = Court, name = "Quadra", status = "Disponível", openingTime = "06:00", closingTime = "24:00" }),
            Json(new { id = OtherCourt, name = "Outra quadra", status = "Disponível", openingTime = "06:00", closingTime = "24:00" })],
        ["team"] = [Json(new { id = Teacher, name = "Professor", status = "Ativo" })],
    };
    private static JsonObject Lesson() => JsonSerializer.SerializeToNode(new
    {
        id = Guid.NewGuid(), name = "Aula avulsa", courtId = Court, customerId = Customer, teacherId = Teacher,
        date = "2026-10-05", startTime = "10:00", endTime = "11:00", status = "Confirmada", amount = 100,
        activityKind = "SingleLesson"
    })!.AsObject();
    private static string? Validate(JsonObject lesson, Dictionary<string, JsonElement[]>? records = null) =>
        OperationalValidation.Validate("reservations", Guid.Parse(lesson["id"]!.ToString()), JsonSerializer.SerializeToElement(lesson), records ?? Records(), Today);

    [Fact]
    public void Explicit_single_lesson_uses_court_and_teacher_without_creating_a_weekly_class()
    {
        var lesson = Lesson();
        Assert.Null(Validate(lesson));
        var records = Records(); records["reservations"] = [JsonSerializer.SerializeToElement(lesson)];
        var schedule = CourtScheduleQuery.Build(new(2026, 10, 5), DateTimeOffset.UtcNow, records, true);
        var row = schedule.Courts.Single(row => row.CourtId == Court);
        Assert.Equal(60, row.ClassMinutes);
        Assert.Equal(0, row.ReservedMinutes);
        Assert.Equal("Aula avulsa", Assert.Single(row.Blocks).Source);
        Assert.Equal(Guid.Parse(lesson["id"]!.ToString()), row.Blocks[0].SourceId);
        Assert.Empty(records.GetValueOrDefault("classes", []));
    }

    [Theory]
    [InlineData("customerId", "", "cliente")]
    [InlineData("teacherId", "", "professor")]
    [InlineData("teacherId", "00000000-0000-4000-8000-000000000099", "professor")]
    [InlineData("rentalGroupId", "00000000-0000-4000-8000-000000000099", "mensalista")]
    [InlineData("rentalMonth", "2026-10", "mensalista")]
    [InlineData("groupId", "00000000-0000-4000-8000-000000000099", "mensalista")]
    [InlineData("status", "Bloqueio", "bloqueio")]
    [InlineData("activityKind", "GuessLesson", "tipo")]
    public void Invalid_or_ambiguous_single_lessons_are_rejected(string field, string value, string message)
    {
        var lesson = Lesson(); lesson[field] = value;
        Assert.Contains(message, Validate(lesson));
    }

    [Fact]
    public void Inactive_teacher_cannot_receive_a_new_lesson_but_an_existing_lesson_can_be_canceled()
    {
        var records = Records(); records["team"] = [Json(new { id = Teacher, name = "Professor", status = "Inativo" })];
        var lesson = Lesson();
        Assert.Contains("ativo", Validate(lesson, records));
        lesson["status"] = "Cancelada";
        Assert.Null(Validate(lesson, records));
    }

    [Theory]
    [InlineData("reservations")]
    [InlineData("classes")]
    public void Teacher_cannot_be_booked_in_two_courts_at_the_same_time(string otherKind)
    {
        var records = Records();
        records[otherKind] = [otherKind == "reservations"
            ? Json(new { id = Guid.NewGuid(), courtId = OtherCourt, teacherId = Teacher, date = "2026-10-05", startTime = "10:30", endTime = "11:30", status = "Confirmada", activityKind = "Trial" })
            : Json(new { id = Guid.NewGuid(), courtId = OtherCourt, teacherId = Teacher, weekDay = 1, startTime = "10:30", endTime = "11:30", status = "Ativa", startDate = "2026-10-01" })];
        Assert.Contains("professor", Validate(Lesson(), records));
    }

    [Fact]
    public void A_new_weekly_class_cannot_overwrite_the_teachers_single_lesson_in_another_court()
    {
        var lesson = Lesson(); var records = Records(); records["reservations"] = [JsonSerializer.SerializeToElement(lesson)];
        var id = Guid.NewGuid();
        var weekly = Json(new { id, name = "Turma", courtId = OtherCourt, teacherId = Teacher, weekDay = 1,
            startTime = "10:30", endTime = "11:30", status = "Ativa", capacity = 5, startDate = "2026-10-01", studentIds = Array.Empty<Guid>() });
        Assert.Contains("professor", OperationalValidation.Validate("classes", id, weekly, records, Today));
    }
}
