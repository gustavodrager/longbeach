using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Operations;

public static class CourtScheduleRecords
{
    // Filter reservations before materializing JSON. Keep courts and classes so
    // CourtScheduleQuery retains its existing capacity and permission semantics.
    public static Task<List<OperationalRecord>> Load(LongBeachDbContext db, DateOnly day, CancellationToken ct) =>
        db.OperationalRecords.FromSqlInterpolated($"""
            SELECT * FROM operational_records
            WHERE "Kind" IN ('courts', 'classes')
               OR ("Kind" = 'reservations' AND "Payload"->>'date' = {day.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)})
            """).AsNoTracking().ToListAsync(ct);
}
