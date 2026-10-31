using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;

public sealed class DailyCourtOperationTests
{
    private static readonly Guid Court = Guid.NewGuid();
    private static readonly Guid Teacher = Guid.NewGuid();
    private static readonly DateOnly Sunday = new(2026, 10, 4);
    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value);
    public static IEnumerable<object[]> LegacyDays()
    {
        foreach (var weekday in Enumerable.Range(0, 7))
        foreach (var empty in new[] { false, true })
            yield return [weekday, empty];
    }
    private static Dictionary<string, JsonElement[]> Records(bool empty, string status = "Disponível", bool confirmed = true) => new()
    {
        ["courts"] = [Json(new { id = Court, name = "Quadra legada", status, openingTime = "06:00", closingTime = "24:00", operatingDays = empty ? Array.Empty<int>() : [1, 2, 3, 4, 5], scheduleConfirmed = confirmed })],
        ["team"] = [Json(new { id = Teacher, name = "Professor" })]
    };
    private static JsonElement Reservation(int weekday, string start = "23:00", string end = "24:00") => Json(new
    {
        id = Guid.NewGuid(), name = "Reserva diária", courtId = Court, date = Sunday.AddDays(weekday).ToString("yyyy-MM-dd"),
        startTime = start, endTime = end, status = "Confirmada", amount = 0
    });
    private static JsonElement Lesson(int weekday) => Json(new
    {
        id = Guid.NewGuid(), name = "Aula diária", courtId = Court, teacherId = Teacher, weekDay = weekday,
        startTime = "23:00", endTime = "24:00", capacity = 8, studentIds = Array.Empty<Guid>(), status = "Ativa"
    });
    private static JsonElement Group(int weekday) => Json(new
    {
        id = Guid.NewGuid(), name = "Mensalistas", courtId = Court, weekDay = weekday, startTime = "23:00", endTime = "24:00",
        startDate = "2026-10-01", endDate = "", status = "Ativo", capacity = 8, dueDay = 10,
        monthlyAmount = (decimal?)null, extraAmount = (decimal?)null, fifthPolicy = "Incluído", members = Array.Empty<object>()
    });
    private static string? Validate(string kind, JsonElement body, Dictionary<string, JsonElement[]> records) =>
        OperationalValidation.Validate(kind, RentalGroupRules.Id(body), body, records, Sunday);

    [Theory]
    [MemberData(nameof(LegacyDays))]
    public void Legacy_restricted_or_empty_days_allow_every_weekday_and_monthly_occurrence(int weekday, bool empty)
    {
        var records = Records(empty);
        var reservation = Reservation(weekday); var lesson = Lesson(weekday); var group = Group(weekday);
        Assert.Null(Validate("reservations", reservation, records));
        Assert.Null(Validate("classes", lesson, records));
        Assert.Null(Validate("rentalGroups", group, records));
        var dates = RentalGroupRules.Dates(group, "2026-10");
        Assert.NotEmpty(dates);
        foreach (var date in dates)
        {
            Assert.Equal(weekday, (int)DateOnly.Parse(date).DayOfWeek);
            var occurrence = Json(RentalGroupRules.Reservation(group, "2026-10", date));
            Assert.Null(Validate("reservations", occurrence, records));
        }
        records["reservations"] = [reservation]; records["classes"] = [lesson];
        Assert.Null(Validate("courts", records["courts"][0], records));
    }

    [Theory]
    [MemberData(nameof(LegacyDays))]
    public void Daily_agenda_keeps_hours_blocks_pending_confirmation_and_maintenance(int weekday, bool empty)
    {
        var records = Records(empty);
        records["reservations"] = [Reservation(weekday, "07:00", "08:00")]; records["classes"] = [Lesson(weekday)];
        var date = Sunday.AddDays(weekday);
        var row = Assert.Single(CourtScheduleQuery.Build(date, DateTimeOffset.UtcNow, records, true).Courts);
        Assert.False(row.ClosedForDay); Assert.False(row.HasConflict); Assert.False(row.SchedulePending);
        Assert.Equal(1080, row.OperatingMinutes); Assert.Equal(960, row.AvailableMinutes);
        Assert.Equal(60, row.ReservedMinutes); Assert.Equal(60, row.ClassMinutes); Assert.Equal(120, row.OccupiedMinutes);
        Assert.Equal(new[] { ("06:00", "07:00"), ("08:00", "23:00") }, row.FreeIntervals!.Select(window => (window.StartTime, window.EndTime)));

        records["courts"] = Records(empty, confirmed: false)["courts"];
        row = Assert.Single(CourtScheduleQuery.Build(date, DateTimeOffset.UtcNow, records, true).Courts);
        Assert.False(row.ClosedForDay); Assert.True(row.SchedulePending); Assert.Null(row.AvailableMinutes); Assert.Null(row.FreeIntervals);
        Assert.Equal(1080, row.OperatingMinutes); Assert.Equal(2, row.Blocks.Count);

        records["courts"] = Records(empty, status: "Manutenção")["courts"];
        row = Assert.Single(CourtScheduleQuery.Build(date, DateTimeOffset.UtcNow, records, true).Courts);
        Assert.False(row.ClosedForDay); Assert.True(row.ClosedForMaintenance); Assert.True(row.HasConflict);
        Assert.Equal(0, row.AvailableMinutes); Assert.Equal(0, row.OperatingMinutes); Assert.Empty(row.FreeIntervals!);
        Assert.Equal(2, row.Blocks.Count);
    }

    [Theory]
    [MemberData(nameof(LegacyDays))]
    public void Daily_operation_still_rejects_overlaps_maintenance_and_outside_hours(int weekday, bool empty)
    {
        var records = Records(empty);
        records["reservations"] = [Reservation(weekday)];
        Assert.Contains("ocupado", Validate("reservations", Reservation(weekday), records));
        Assert.Contains("conflita", Validate("classes", Lesson(weekday), records));
        records["reservations"] = []; records["classes"] = [Lesson(weekday)];
        Assert.Contains("ocupado", Validate("reservations", Reservation(weekday), records));
        Assert.Contains("conflita", Validate("classes", Lesson(weekday), records));
        records["classes"] = []; records["courts"] = Records(empty, status: "Manutenção")["courts"];
        Assert.Contains("manutenção", Validate("reservations", Reservation(weekday), records));
        Assert.Contains("manutenção", Validate("classes", Lesson(weekday), records));
        records["courts"] = Records(empty)["courts"];
        Assert.Contains("funcionamento", Validate("reservations", Reservation(weekday, "05:00", "06:00"), records));
        var shorterHours = JsonNode.Parse(records["courts"][0].GetRawText())!.AsObject(); shorterHours["closingTime"] = "22:00";
        records["reservations"] = [Reservation(weekday)];
        Assert.Contains("novo horário", Validate("courts", Json(shorterHours), records));
    }

    [Theory]
    [InlineData("-1")]
    [InlineData("7")]
    [InlineData("1.5")]
    [InlineData("\"1\"")]
    [InlineData("null")]
    public void Daily_operation_keeps_invalid_class_and_monthly_weekdays_rejected(string weekday)
    {
        foreach (var (kind, body) in new[] { ("classes", Lesson(0)), ("rentalGroups", Group(0)) })
        {
            var input = JsonNode.Parse(body.GetRawText())!.AsObject(); input["weekDay"] = JsonNode.Parse(weekday);
            Assert.Contains("dia", Validate(kind, Json(input), Records(false)));
        }
    }

    [Theory]
    [InlineData("2026-02-30")]
    [InlineData("2026-10-32")]
    [InlineData("domingo")]
    public void Daily_operation_keeps_invalid_dates_rejected(string date)
    {
        var input = JsonNode.Parse(Reservation(0).GetRawText())!.AsObject(); input["date"] = date;
        Assert.Contains("data", Validate("reservations", Json(input), Records(true)));
    }
}
