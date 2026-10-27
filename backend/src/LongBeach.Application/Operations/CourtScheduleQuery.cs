using System.Text.Json;
using LongBeach.Contracts.Operations;

namespace LongBeach.Application.Operations;
public static class CourtScheduleQuery
{
    public const int MaximumRangeDays = 366;

    public static CourtScheduleRangeResponse BuildRange(DateOnly from, DateOnly to, DateTimeOffset updatedAt, IReadOnlyDictionary<string, JsonElement[]> records, bool includeClassIds)
    {
        var count = to.DayNumber - from.DayNumber + 1;
        if (count < 1 || count > MaximumRangeDays) throw new ArgumentOutOfRangeException(nameof(to));
        var days = Enumerable.Range(0, count).Select(offset => Build(from.AddDays(offset), updatedAt, records, includeClassIds)).ToArray();
        return new(from.ToString("yyyy-MM-dd"), to.ToString("yyyy-MM-dd"), updatedAt, days);
    }

    public static CourtScheduleResponse Build(DateOnly date, DateTimeOffset updatedAt, IReadOnlyDictionary<string, JsonElement[]> records, bool includeClassIds)
    {
        var rows = new List<CourtScheduleRow>();
        JsonElement[] Records(string kind) => records.TryGetValue(kind, out var value) ? value : [];
        foreach (var court in Records("courts"))
        {
            if (!Guid.TryParse(OperationalValidation.Text(court, "id"), out var courtId)) continue;
            var opening = OperationalValidation.Text(court, "openingTime"); var closing = OperationalValidation.Text(court, "closingTime");
            if (!CourtHours.TryMinute(opening, false, out var begin) || !CourtHours.TryMinute(closing, true, out var end) || begin >= end) continue;
            var blocks = new List<CourtScheduleBlock>(); var intervals = new List<(int Start, int End)>(); var rawIntervals = new List<(int Start, int End)>(); var reserved = 0; var classes = 0; var outsideHours = false;
            foreach (var record in Records("reservations").Where(row => OperationalValidation.Text(row, "courtId") == courtId.ToString() && OperationalValidation.Text(row, "date") == date.ToString("yyyy-MM-dd") && OperationalValidation.Text(row, "status") != "Cancelada"))
                AddBlock(record, OperationalValidation.Text(record, "status") == "Bloqueio" ? "Bloqueio" : OperationalValidation.Text(record, "activityKind") == "Trial" ? "Aula experimental" : "Reserva", true);
            foreach (var record in Records("classes").Where(row => OperationalValidation.Text(row, "courtId") == courtId.ToString() && OperationalValidation.Text(row, "status") == "Ativa" && OperationalValidation.ClassStartedOn(row, date) && row.TryGetProperty("weekDay", out var weekday) && weekday.TryGetInt32(out var value) && value == (int)date.DayOfWeek))
                AddBlock(record, "Aula", includeClassIds);
            var used = 0; var cursor = begin; var free = new List<CourtFreeInterval>();
            string Time(int minutes) => $"{minutes / 60:00}:{minutes % 60:00}";
            foreach (var interval in intervals.OrderBy(interval => interval.Start).ThenBy(interval => interval.End))
            {
                if (interval.Start > cursor) free.Add(new(Time(cursor), Time(interval.Start)));
                used += Math.Max(0, interval.End - Math.Max(cursor, interval.Start)); cursor = Math.Max(cursor, interval.End);
            }
            if (cursor < end) free.Add(new(Time(cursor), Time(end)));
            var unavailable = OperationalValidation.Text(court, "status") == "Manutenção";
            var closedForDay = !CourtHours.OpensOn(court, (int)date.DayOfWeek);
            var pending = !CourtHours.ScheduleConfirmed(court);
            var occupied = 0; var occupiedEnd = 0;
            foreach (var interval in rawIntervals.OrderBy(interval => interval.Start).ThenBy(interval => interval.End))
            {
                occupied += Math.Max(0, interval.End - Math.Max(occupiedEnd, interval.Start));
                occupiedEnd = Math.Max(occupiedEnd, interval.End);
            }
            rows.Add(new(courtId, opening, closing, unavailable || closedForDay ? 0 : pending ? null : Math.Max(0, end - begin - used), reserved, classes, unavailable, outsideHours || reserved + classes > used || (closedForDay || unavailable) && blocks.Count > 0, blocks.OrderBy(block => block.StartTime).ToArray(), closedForDay, unavailable || closedForDay ? 0 : end - begin, pending, occupied, pending ? null : unavailable || closedForDay ? [] : free));
            void AddBlock(JsonElement record, string source, bool includeId)
            {
                var startTime = OperationalValidation.Text(record, "startTime"); var endTime = OperationalValidation.Text(record, "endTime");
                if (!CourtHours.TryMinute(startTime, false, out var start) || !CourtHours.TryMinute(endTime, true, out var finish) || start >= finish) return;
                outsideHours |= start < begin || finish > end;
                rawIntervals.Add((start, finish));
                Guid? sourceId = includeId && Guid.TryParse(OperationalValidation.Text(record, "id"), out var id) ? id : null;
                blocks.Add(new(source, startTime, endTime, sourceId));
                start = Math.Max(start, begin); finish = Math.Min(finish, end); if (start >= finish) return;
                intervals.Add((start, finish));
                if (source is "Aula" or "Aula experimental") classes += finish - start; else reserved += finish - start;
            }
        }
        return new(date.ToString("yyyy-MM-dd"), updatedAt, rows);
    }
}
