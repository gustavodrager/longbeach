using System.Text.Json;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;
public sealed class CourtScheduleTests
{
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
