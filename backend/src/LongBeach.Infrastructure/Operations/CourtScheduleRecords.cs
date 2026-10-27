using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Operations;

public static class CourtScheduleRecords
{
    // Filter reservations before materializing JSON. Keep courts and classes so
    // CourtScheduleQuery retains its existing capacity and permission semantics.
    public static Task<List<OperationalRecord>> Load(LongBeachDbContext db, DateOnly day, CancellationToken ct) =>
        Load(db, day, day, ct);

    public static Task<List<OperationalRecord>> Load(LongBeachDbContext db, DateOnly from, DateOnly to, CancellationToken ct) =>
        db.OperationalRecords.FromSqlInterpolated($"""
            SELECT * FROM operational_records
            WHERE "Kind" IN ('courts', 'classes')
               OR ("Kind" = 'reservations' AND "Payload"->>'date' >= {from.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)}
                   AND "Payload"->>'date' <= {to.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)})
            """).AsNoTracking().ToListAsync(ct);
}
