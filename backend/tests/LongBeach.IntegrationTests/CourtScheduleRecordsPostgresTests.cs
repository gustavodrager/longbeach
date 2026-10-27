using System.Text.Json;
using System.Net;
using System.Net.Http.Json;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using static LongBeach.IntegrationTests.OperationalPostgresTests;

namespace LongBeach.IntegrationTests;

public sealed class CourtScheduleRecordsPostgresTests
{
    [PostgresFact]
    public async Task Daily_read_keeps_courts_and_classes_but_does_not_materialize_other_days_or_modules()
    {
        await using var factory = Factory();
        await Migrate(factory);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        OperationalRecord Row(string kind, string? date = null) => new(Guid.NewGuid(), kind,
            "Schedule query fixture", JsonSerializer.Serialize(new { date }));
        var court = Row("courts"); var lesson = Row("classes");
        var selected = Row("reservations", "2048-02-10");
        var previous = Row("reservations", "2048-02-09");
        var future = Row("reservations", "2048-02-11");
        var unrelated = Row("financeEntries", "2048-02-10");
        var rows = new[] { court, lesson, selected, previous, future, unrelated };
        db.AddRange(rows); await db.SaveChangesAsync();
        try
        {
            var result = await CourtScheduleRecords.Load(db, new DateOnly(2048, 2, 10), default);
            var ids = result.Select(row => row.Id).ToHashSet();
            Assert.Contains(court.Id, ids); Assert.Contains(lesson.Id, ids); Assert.Contains(selected.Id, ids);
            Assert.DoesNotContain(previous.Id, ids); Assert.DoesNotContain(future.Id, ids); Assert.DoesNotContain(unrelated.Id, ids);
            var period = await CourtScheduleRecords.Load(db, new DateOnly(2048, 2, 10), new DateOnly(2048, 2, 11), default);
            var periodIds = period.Select(row => row.Id).ToHashSet();
            Assert.Contains(selected.Id, periodIds); Assert.Contains(future.Id, periodIds);
            Assert.Contains(court.Id, periodIds); Assert.Contains(lesson.Id, periodIds);
            Assert.DoesNotContain(previous.Id, periodIds); Assert.DoesNotContain(unrelated.Id, periodIds);
        }
        finally { db.RemoveRange(rows); await db.SaveChangesAsync(); }
    }

    [Fact]
    public async Task Period_requires_permission_and_valid_bounded_dates_before_reading_data()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        const string path = "/api/v1/operations/courts/schedule-range";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path + "?from=2026-10-09&to=2026-10-16")).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Student");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path + "?from=2026-10-09&to=2026-10-16")).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Owner");
        foreach (var query in new[] { "", "?from=2026-02-30&to=2026-03-01", "?from=2026-10-10&to=2026-10-09", "?from=2026-01-01&to=2027-01-02" })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(path + query)).StatusCode);
    }

    [PostgresFact]
    public async Task Period_endpoint_matches_daily_classes_without_disclosing_school_identity_to_reception()
    {
        await using var factory = Factory(); using var client = factory.CreateClient();
        await Migrate(factory);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var courtId = Guid.NewGuid(); var classId = Guid.NewGuid();
        var court = new OperationalRecord(courtId, "courts", "Quadra teste período", JsonSerializer.Serialize(new { id = courtId, name = "Quadra teste período", openingTime = "06:00", closingTime = "24:00", status = "Disponível" }));
        var lesson = new OperationalRecord(classId, "classes", "Nome privado da aula", JsonSerializer.Serialize(new { id = classId, name = "Nome privado da aula", courtId, startDate = "2026-10-09", weekDay = 5, startTime = "17:00", endTime = "18:00", status = "Ativa" }));
        db.AddRange(court, lesson); await db.SaveChangesAsync();
        try
        {
            client.DefaultRequestHeaders.Authorization = Header("Operations", "projects:read");
            var period = await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/courts/schedule-range?from=2026-10-02&to=2026-10-16");
            Assert.Equal(15, period.GetProperty("days").GetArrayLength());
            foreach (var day in period.GetProperty("days").EnumerateArray())
            {
                var date = day.GetProperty("date").GetString();
                var daily = await client.GetFromJsonAsync<JsonElement>($"/api/v1/operations/courts/schedule?date={date}");
                var row = day.GetProperty("courts").EnumerateArray().Single(value => value.GetProperty("courtId").GetGuid() == courtId);
                var dailyRow = daily.GetProperty("courts").EnumerateArray().Single(value => value.GetProperty("courtId").GetGuid() == courtId);
                Assert.Equal(dailyRow.GetRawText(), row.GetRawText());
                var expected = date is "2026-10-09" or "2026-10-16" ? 1 : 0;
                Assert.Equal(expected, row.GetProperty("blocks").GetArrayLength());
                Assert.Equal(expected * 60, row.GetProperty("occupiedMinutes").GetInt32());
                Assert.Equal(expected == 0 ? 1 : 2, row.GetProperty("freeIntervals").GetArrayLength());
                Assert.Equal(1080 - expected * 60, row.GetProperty("availableMinutes").GetInt32());
            }
            Assert.DoesNotContain(classId.ToString(), period.GetRawText());
            Assert.DoesNotContain("Nome privado da aula", period.GetRawText());
            client.DefaultRequestHeaders.Authorization = Header("Owner");
            var owner = await client.GetStringAsync("/api/v1/operations/courts/schedule-range?from=2026-10-09&to=2026-10-09");
            Assert.Contains(classId.ToString(), owner);
        }
        finally { db.RemoveRange(court, lesson); await db.SaveChangesAsync(); }
    }
}
