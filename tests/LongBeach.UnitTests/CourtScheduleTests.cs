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
    public void Trial_is_counted_as_a_class_while_preserving_its_reservation_identity()
    {
        var court=Guid.NewGuid(); var reservation=Guid.NewGuid();
        var rows=new Dictionary<string,JsonElement[]> {
            ["courts"]=[JsonSerializer.SerializeToElement(new{id=court,openingTime="08:00",closingTime="24:00",status="Disponível"})],
            ["reservations"]=[JsonSerializer.SerializeToElement(new{id=reservation,courtId=court,date="2026-10-05",startTime="23:30",endTime="24:00",status="Confirmada",activityKind="Trial"})]
        };
        var row=Assert.Single(CourtScheduleQuery.Build(new(2026,10,5),DateTimeOffset.UtcNow,rows,true).Courts);
        Assert.Equal(30,row.ClassMinutes);Assert.Equal(0,row.ReservedMinutes);Assert.Equal(30,row.OccupiedMinutes);
        var block=Assert.Single(row.Blocks);Assert.Equal("Aula experimental",block.Source);Assert.Equal(reservation,block.SourceId);
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

    [Fact]
    public void Period_matches_daily_capacity_and_preserves_class_redaction_and_start_date()
    {
        var court = Guid.NewGuid(); var lesson = Guid.NewGuid();
        var records = new Dictionary<string, JsonElement[]>
        {
            ["courts"] = [JsonSerializer.SerializeToElement(new { id = court, openingTime = "06:00", closingTime = "24:00", status = "Disponível" })],
            ["classes"] = [JsonSerializer.SerializeToElement(new { id = lesson, courtId = court, startDate = "2026-10-09", weekDay = 5, startTime = "17:00", endTime = "18:00", status = "Ativa" })]
        };
        var timestamp = DateTimeOffset.UtcNow;
        var result = CourtScheduleQuery.BuildRange(new(2026, 10, 2), new(2026, 10, 16), timestamp, records, false);
        Assert.Equal(15, result.Days.Count);
        Assert.Empty(result.Days[0].Courts[0].Blocks);
        Assert.Equal(2, result.Days.Sum(day => day.Courts.Sum(row => row.Blocks.Count)));
        Assert.All(result.Days, day => Assert.Equal(
            JsonSerializer.Serialize(CourtScheduleQuery.Build(DateOnly.Parse(day.Date), timestamp, records, false)), JsonSerializer.Serialize(day)));
        Assert.DoesNotContain(lesson.ToString(), JsonSerializer.Serialize(result));
    }

    [Fact]
    public void Period_rejects_reversed_or_unbounded_ranges_and_includes_both_boundaries()
    {
        var records = new Dictionary<string, JsonElement[]>();
        Assert.Throws<ArgumentOutOfRangeException>(() => CourtScheduleQuery.BuildRange(new(2026, 10, 2), new(2026, 10, 1), DateTimeOffset.UtcNow, records, false));
        Assert.Throws<ArgumentOutOfRangeException>(() => CourtScheduleQuery.BuildRange(new(2026, 1, 1), new(2027, 1, 2), DateTimeOffset.UtcNow, records, false));
        Assert.Equal(366, CourtScheduleQuery.BuildRange(new(2026, 1, 1), new(2027, 1, 1), DateTimeOffset.UtcNow, records, false).Days.Count);
        Assert.Single(CourtScheduleQuery.BuildRange(DateOnly.MaxValue, DateOnly.MaxValue, DateTimeOffset.UtcNow, records, false).Days);
    }
    [Fact]
    public void Free_intervals_merge_touching_blocks_and_keep_partial_hours_and_midnight()
    {
        var id = Guid.NewGuid();
        JsonElement Reservation(string start, string end, string status = "Confirmada") => JsonSerializer.SerializeToElement(new { id = Guid.NewGuid(), courtId = id, date = "2026-10-09", startTime = start, endTime = end, status });
        var records = new Dictionary<string, JsonElement[]>
        {
            ["courts"] = [JsonSerializer.SerializeToElement(new { id, openingTime = "06:00", closingTime = "24:00", status = "Disponível", scheduleConfirmed = true })],
            ["reservations"] = [Reservation("07:15", "08:30"), Reservation("08:30", "09:00"), Reservation("08:00", "08:45"), Reservation("23:00", "23:30", "Bloqueio"), Reservation("12:00", "13:00", "Cancelada")]
        };
        var row = CourtScheduleQuery.Build(new(2026,10,9), DateTimeOffset.UtcNow, records, true).Courts[0];
        Assert.Equal(135, row.OccupiedMinutes);
        Assert.Equal(945, row.AvailableMinutes);
        Assert.True(row.HasConflict);
        Assert.Equal(new[] { ("06:00", "07:15"), ("09:00", "23:00"), ("23:30", "24:00") }, row.FreeIntervals!.Select(window => (window.StartTime,window.EndTime)));
        Assert.Equal(row.AvailableMinutes, row.FreeIntervals!.Sum(window => Minute(window.EndTime) - Minute(window.StartTime)));
        static int Minute(string value) => int.Parse(value[..2]) * 60 + int.Parse(value[3..]);
    }

    [Theory]
    [InlineData(false, "Disponível", false)]
    [InlineData(true, "Manutenção", false)]
    [InlineData(true, "Disponível", true)]
    public void Pending_maintenance_and_closed_days_never_offer_free_intervals(bool confirmed, string status, bool closed)
    {
        var records = new Dictionary<string, JsonElement[]> { ["courts"] = [JsonSerializer.SerializeToElement(new { id = Guid.NewGuid(), openingTime = "06:00", closingTime = "24:00", status, scheduleConfirmed = confirmed, operatingDays = closed ? new[] { 1 } : new[] { 5 } })] };
        var row = CourtScheduleQuery.Build(new(2026,10,9), DateTimeOffset.UtcNow, records, true).Courts[0];
        if (!confirmed) Assert.Null(row.FreeIntervals); else Assert.Empty(row.FreeIntervals!);
    }

    [Fact]
    public void Blocks_completely_outside_hours_remain_visible_and_count_as_occupied_once()
    {
        var id = Guid.NewGuid();
        var records = new Dictionary<string, JsonElement[]>
        {
            ["courts"] = [JsonSerializer.SerializeToElement(new { id, openingTime = "08:00", closingTime = "22:00", status = "Disponível" })],
            ["reservations"] = [JsonSerializer.SerializeToElement(new { id = Guid.NewGuid(), courtId = id, date = "2026-10-09", startTime = "06:00", endTime = "07:00", status = "Confirmada" })]
        };
        var row = CourtScheduleQuery.Build(new(2026,10,9), DateTimeOffset.UtcNow, records, true).Courts[0];
        Assert.Single(row.Blocks); Assert.True(row.HasConflict); Assert.Equal(60, row.OccupiedMinutes);
        Assert.Equal(840, row.AvailableMinutes);
        var window = Assert.Single(row.FreeIntervals!); Assert.Equal("08:00",window.StartTime); Assert.Equal("22:00",window.EndTime);
    }

}
