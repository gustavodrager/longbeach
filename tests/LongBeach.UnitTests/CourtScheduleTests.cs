using System.Text.Json;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;
public sealed class CourtScheduleTests
{
    [Theory]
    [InlineData("2026-10-05", true, 1080, 1080)]
    [InlineData("2026-10-09", true, 1080, 1080)]
    [InlineData("2026-10-10", true, 0, 0)]
    [InlineData("2026-10-11", true, 0, 0)]
    [InlineData("2026-10-06", false, 1080, null)]
    public void Weekday_hours_and_unconfirmed_agenda_are_distinct(string date, bool confirmed, int operating, int? available)
    {
        var records = new Dictionary<string, JsonElement[]> { ["courts"] = [JsonSerializer.SerializeToElement(new { id = Guid.NewGuid(), openingTime = "06:00", closingTime = "24:00", status = "Disponível", operatingDays = new[] { 1, 2, 3, 4, 5 }, scheduleConfirmed = confirmed })] };
        var row = Assert.Single(CourtScheduleQuery.Build(DateOnly.Parse(date), DateTimeOffset.UtcNow, records, true).Courts);
        Assert.Equal(operating, row.OperatingMinutes);
        Assert.Equal(available, row.AvailableMinutes);
        Assert.Equal(operating == 0, row.ClosedForDay);
        Assert.Equal(!confirmed, row.SchedulePending);
    }

    [Fact]
    public void Final_hour_ends_at_midnight_of_the_selected_day()
    {
        var id = Guid.NewGuid();
        var records = new Dictionary<string, JsonElement[]>
        {
            ["courts"] = [JsonSerializer.SerializeToElement(new { id, openingTime = "06:00", closingTime = "24:00", status = "Disponível" })],
            ["reservations"] = [JsonSerializer.SerializeToElement(new { id = Guid.NewGuid(), courtId = id, date = "2026-10-05", startTime = "23:00", endTime = "24:00", status = "Confirmada" })]
        };
        var row = Assert.Single(CourtScheduleQuery.Build(new(2026, 10, 5), DateTimeOffset.UtcNow, records, true).Courts);
        Assert.Equal(60, row.ReservedMinutes); Assert.Equal(1020, row.AvailableMinutes);
    }

    [Fact]
    public void Reception_capacity_includes_classes_without_disclosing_their_records_or_people()
    {
        var court = Guid.NewGuid(); var lesson = Guid.NewGuid();
        var records = new Dictionary<string, JsonElement[]>
        {
            ["courts"] = [JsonSerializer.SerializeToElement(new { id = court, openingTime = "06:00", closingTime = "22:00", status = "Disponível" })],
            ["classes"] = [JsonSerializer.SerializeToElement(new { id = lesson, courtId = court, name = "Nome privado", teacherId = Guid.NewGuid(), studentIds = new[] { Guid.NewGuid() }, weekDay = 1, startTime = "18:00", endTime = "19:00", status = "Ativa" })],
            ["reservations"] = [JsonSerializer.SerializeToElement(new { id = Guid.NewGuid(), courtId = court, date = "2026-10-05", startTime = "19:00", endTime = "20:00", status = "Confirmada", customerName = "Cliente privado", phone = "Telefone privado" })]
        };
        var result = CourtScheduleQuery.Build(new(2026, 10, 5), DateTimeOffset.UtcNow, records, false);
        var row = Assert.Single(result.Courts);
        Assert.Equal(840, row.AvailableMinutes); Assert.Equal(60, row.ReservedMinutes); Assert.Equal(60, row.ClassMinutes);
        Assert.False(row.HasConflict); Assert.Null(row.Blocks.Single(block => block.Source == "Aula").SourceId);
        var json = JsonSerializer.Serialize(result);
        Assert.DoesNotContain("Nome privado", json); Assert.DoesNotContain("Cliente privado", json); Assert.DoesNotContain("Telefone privado", json); Assert.DoesNotContain(lesson.ToString(), json);
    }
    [Fact]
    public void Overlapping_imported_blocks_do_not_reduce_available_capacity_twice()
    {
        var court = Guid.NewGuid();
        var records = new Dictionary<string, JsonElement[]>
        {
            ["courts"] = [JsonSerializer.SerializeToElement(new { id = court, openingTime = "06:00", closingTime = "22:00", status = "Disponível" })],
            ["classes"] = [JsonSerializer.SerializeToElement(new { id = Guid.NewGuid(), courtId = court, weekDay = 1, startTime = "18:00", endTime = "19:00", status = "Ativa" })],
            ["reservations"] = [JsonSerializer.SerializeToElement(new { id = Guid.NewGuid(), courtId = court, date = "2026-10-05", startTime = "18:30", endTime = "19:30", status = "Confirmada" })]
        };
        var result = CourtScheduleQuery.Build(new(2026, 10, 5), DateTimeOffset.UtcNow, records, true);
        var row = Assert.Single(result.Courts);
        Assert.Equal(870, row.AvailableMinutes); Assert.True(row.HasConflict);
    }
}
