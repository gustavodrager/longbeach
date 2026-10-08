using System.Text.Json;
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
        }
        finally { db.RemoveRange(rows); await db.SaveChangesAsync(); }
    }
}
