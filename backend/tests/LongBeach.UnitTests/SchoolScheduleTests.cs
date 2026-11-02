using System.Text.Json;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;

public sealed class SchoolScheduleTests
{
    private static readonly Guid CourtA = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly Guid CourtB = Guid.Parse("10000000-0000-0000-0000-000000000002");
    private static readonly Guid Teacher = Guid.Parse("30000000-0000-0000-0000-000000000001");
    private static readonly DateTimeOffset UpdatedAt = new(2026, 11, 2, 12, 0, 0, TimeSpan.Zero);
    private static Guid ClassId(int value) => Guid.Parse($"20000000-0000-0000-0000-{value:D12}");

    [Fact]
    public void Every_active_class_appears_on_its_weekday_without_students_or_name_deduplication()
    {
        var result = CourtScheduleQuery.BuildRange(new(2026, 11, 2), new(2026, 11, 8), UpdatedAt, FullWeek(), true);
        var actual = result.Days.SelectMany(day => day.Courts.SelectMany(court => court.Blocks.Select(block =>
            (Date: day.Date, Court: court.CourtId, Id: block.SourceId, block.StartTime, block.EndTime, block.Source))))
            .OrderBy(item => item.Date).ThenBy(item => item.Court).ThenBy(item => item.Id).ToArray();
        var expected = new[]
        {
            (Date: "2026-11-02", Court: CourtA, Id: (Guid?)ClassId(1), StartTime: "08:00", EndTime: "09:00", Source: "Aula"),
            (Date: "2026-11-02", Court: CourtA, Id: (Guid?)ClassId(2), StartTime: "09:00", EndTime: "10:00", Source: "Aula"),
            (Date: "2026-11-02", Court: CourtB, Id: (Guid?)ClassId(3), StartTime: "08:00", EndTime: "09:00", Source: "Aula"),
            (Date: "2026-11-03", Court: CourtA, Id: (Guid?)ClassId(4), StartTime: "10:00", EndTime: "11:00", Source: "Aula"),
            (Date: "2026-11-04", Court: CourtB, Id: (Guid?)ClassId(5), StartTime: "12:00", EndTime: "13:00", Source: "Aula"),
            (Date: "2026-11-05", Court: CourtA, Id: (Guid?)ClassId(6), StartTime: "14:00", EndTime: "15:00", Source: "Aula"),
            (Date: "2026-11-06", Court: CourtB, Id: (Guid?)ClassId(7), StartTime: "23:00", EndTime: "24:00", Source: "Aula"),
            (Date: "2026-11-07", Court: CourtA, Id: (Guid?)ClassId(8), StartTime: "18:00", EndTime: "19:00", Source: "Aula"),
            (Date: "2026-11-08", Court: CourtB, Id: (Guid?)ClassId(9), StartTime: "20:00", EndTime: "21:00", Source: "Aula"),
        };

        Assert.Equal(expected.OrderBy(item => item.Date).ThenBy(item => item.Court).ThenBy(item => item.Id), actual);
        Assert.Equal(9, actual.Select(item => item.Id).Distinct().Count());
        Assert.Equal(new[] { 3, 1, 1, 1, 1, 1, 1 }, result.Days.Select(day => day.Courts.Sum(court => court.Blocks.Count)));
        Assert.Equal(new[] { 180, 60, 60, 60, 60, 60, 60 }, result.Days.Select(day => day.Courts.Sum(court => court.ClassMinutes)));
    }

    [Fact]
    public void Range_keeps_the_same_classes_and_identifiers_as_each_daily_read()
    {
        var records = FullWeek();
        var period = CourtScheduleQuery.BuildRange(new(2026, 11, 2), new(2026, 11, 8), UpdatedAt, records, true);

        foreach (var day in period.Days)
        {
            var daily = CourtScheduleQuery.Build(DateOnly.Parse(day.Date), UpdatedAt, records, true);
            Assert.Equal(JsonSerializer.Serialize(daily), JsonSerializer.Serialize(day));
        }
    }

    [Theory]
    [InlineData("2026-11-02", "2026-11-02", true)]
    [InlineData("2026-11-03", "2026-11-02", false)]
    [InlineData("2026-11-09", "2026-11-02", false)]
    [InlineData("2026-11-03", "2026-11-09", true)]
    [InlineData("", "2026-11-02", true)]
    [InlineData(null, "2026-11-02", true)]
    [InlineData("2026-11-02", "2026-11-03", false)]
    public void Start_date_and_weekday_control_the_first_occurrence(string? startDate, string day, bool visible)
    {
        var records = SingleClass(Lesson(ClassId(20), CourtA, 1, "08:00", "09:00", startDate));
        var court = Assert.Single(CourtScheduleQuery.Build(DateOnly.Parse(day), UpdatedAt, records, true).Courts);

        if (visible)
        {
            var block = Assert.Single(court.Blocks);
            Assert.Equal(ClassId(20), block.SourceId);
            Assert.Equal(60, court.ClassMinutes);
        }
        else
        {
            Assert.Empty(court.Blocks);
            Assert.Equal(0, court.ClassMinutes);
        }
    }

    [Theory]
    [InlineData("Ativa", 1)]
    [InlineData("Pausada", 0)]
    [InlineData("Encerrada", 0)]
    public void Paused_and_closed_classes_do_not_create_current_occupations(string status, int expectedBlocks)
    {
        var records = SingleClass(Lesson(ClassId(21), CourtA, 1, "08:00", "09:00", status: status));
        var court = Assert.Single(CourtScheduleQuery.Build(new(2026, 11, 2), UpdatedAt, records, true).Courts);

        Assert.Equal(expectedBlocks, court.Blocks.Count);
        Assert.Equal(expectedBlocks * 60, court.OccupiedMinutes);
        Assert.Equal(expectedBlocks * 60, court.ClassMinutes);
    }

    [Theory]
    [InlineData("Disponível", true, "06:00", "07:00", 840, 0, true)]
    [InlineData("Manutenção", true, "09:00", "10:00", 0, 60, true)]
    [InlineData("Disponível", false, "09:00", "10:00", null, 60, false)]
    public void Outside_hours_maintenance_and_pending_confirmation_do_not_hide_classes(
        string status, bool confirmed, string start, string end, int? available, int classMinutes, bool conflict)
    {
        var records = SingleClass(Lesson(ClassId(22), CourtA, 1, start, end),
            Court(CourtA, "08:00", "22:00", status, confirmed));
        var court = Assert.Single(CourtScheduleQuery.Build(new(2026, 11, 2), UpdatedAt, records, true).Courts);
        var block = Assert.Single(court.Blocks);

        Assert.Equal(ClassId(22), block.SourceId);
        Assert.Equal("Aula", block.Source);
        Assert.Equal(start, block.StartTime);
        Assert.Equal(end, block.EndTime);
        Assert.Equal(60, court.OccupiedMinutes);
        Assert.Equal(classMinutes, court.ClassMinutes);
        Assert.Equal(available, court.AvailableMinutes);
        Assert.Equal(conflict, court.HasConflict);
    }

    [Fact]
    public void Redacted_schedule_keeps_every_class_but_discloses_no_class_or_teacher_identity()
    {
        var result = CourtScheduleQuery.BuildRange(new(2026, 11, 2), new(2026, 11, 8), UpdatedAt, FullWeek(), false);
        var blocks = result.Days.SelectMany(day => day.Courts).SelectMany(court => court.Blocks).ToArray();

        Assert.Equal(9, blocks.Length);
        Assert.All(blocks, block => { Assert.Equal("Aula", block.Source); Assert.Null(block.SourceId); });
        Assert.Equal(new[] { 3, 1, 1, 1, 1, 1, 1 }, result.Days.Select(day => day.Courts.Sum(court => court.Blocks.Count)));
        var json = JsonSerializer.Serialize(result);
        Assert.DoesNotContain("Turma de teste privada", json);
        Assert.DoesNotContain(Teacher.ToString(), json);
        for (var number = 1; number <= 9; number++) Assert.DoesNotContain(ClassId(number).ToString(), json);
    }

    private static Dictionary<string, JsonElement[]> FullWeek() => new()
    {
        ["courts"] = [Court(CourtA), Court(CourtB)],
        ["classes"] =
        [
            Lesson(ClassId(1), CourtA, 1, "08:00", "09:00"),
            Lesson(ClassId(2), CourtA, 1, "09:00", "10:00"),
            Lesson(ClassId(3), CourtB, 1, "08:00", "09:00"),
            Lesson(ClassId(4), CourtA, 2, "10:00", "11:00"),
            Lesson(ClassId(5), CourtB, 3, "12:00", "13:00"),
            Lesson(ClassId(6), CourtA, 4, "14:00", "15:00"),
            Lesson(ClassId(7), CourtB, 5, "23:00", "24:00"),
            Lesson(ClassId(8), CourtA, 6, "18:00", "19:00"),
            Lesson(ClassId(9), CourtB, 0, "20:00", "21:00"),
        ],
    };

    private static Dictionary<string, JsonElement[]> SingleClass(JsonElement lesson, JsonElement? court = null) => new()
    {
        ["courts"] = [court ?? Court(CourtA)],
        ["classes"] = [lesson],
    };

    private static JsonElement Court(Guid id, string opening = "06:00", string closing = "24:00",
        string status = "Disponível", bool confirmed = true) => JsonSerializer.SerializeToElement(new
        {
            id, openingTime = opening, closingTime = closing, status, scheduleConfirmed = confirmed,
            operatingDays = new[] { 1, 2, 3, 4, 5 },
        });

    private static JsonElement Lesson(Guid id, Guid court, int weekday, string start, string end,
        string? startDate = "2026-01-01", string status = "Ativa")
    {
        var values = new Dictionary<string, object?>
        {
            ["id"] = id, ["courtId"] = court, ["name"] = "Turma de teste privada", ["teacherId"] = Teacher,
            ["weekDay"] = weekday, ["startTime"] = start, ["endTime"] = end, ["status"] = status,
            ["capacity"] = 8, ["studentIds"] = Array.Empty<Guid>(),
        };
        if (startDate is not null) values["startDate"] = startDate;
        return JsonSerializer.SerializeToElement(values);
    }
}
