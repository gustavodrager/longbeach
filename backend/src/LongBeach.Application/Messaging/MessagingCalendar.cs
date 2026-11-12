using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Operations;
using LongBeach.Application.Operations;

namespace LongBeach.Application.Messaging;

public static class MessagingCalendar
{
    public static readonly TimeZoneInfo ArenaZone = TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");
    public static Guid StableId(string purpose, string value) => new(SHA256.HashData(Encoding.UTF8.GetBytes($"longbeach-messaging-v1:{purpose}:{value}"))[..16]);
    public static Guid OccurrenceId(MessagingActivityDto activity) => StableId("occurrence", $"{activity.Kind}:{activity.Id}:{activity.SubjectId}:{activity.Date:yyyy-MM-dd}");
    public static string Fingerprint(MessagingActivityDto activity) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
        $"{OccurrenceId(activity)}:{activity.StartTime}:{activity.EndTime}:{activity.CourtId}:{activity.Court}")));
    public static DateTimeOffset StartsAt(MessagingActivityDto activity) => new(
        activity.Date.ToDateTime(TimeOnly.ParseExact(activity.StartTime, "HH:mm", CultureInfo.InvariantCulture)),
        ArenaZone.GetUtcOffset(activity.Date.ToDateTime(TimeOnly.MinValue)));
    public static DateOnly Today(DateTimeOffset now) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, ArenaZone).DateTime);
    public static string Text(JsonElement data, string key) => data.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    public static Guid Id(JsonElement data, string key) => Guid.TryParse(Text(data, key), out var id) ? id : Guid.Empty;
    private static bool Begins(JsonElement data, string key, DateOnly date) => !DateOnly.TryParse(Text(data, key), out var start) || date >= start;
    private static bool Ends(JsonElement data, string key, DateOnly date) => !DateOnly.TryParse(Text(data, key), out var end) || date <= end;

    public static IReadOnlyList<MessagingActivityDto> Build(Guid customerId, IEnumerable<CustomerSourceLink> links,
        IReadOnlyList<OperationalRecord> records, DateOnly from, DateOnly until)
    {
        var rows = records.ToDictionary(row => row.Id, row => JsonSerializer.Deserialize<JsonElement>(row.Payload));
        var sourceLinks = links.ToArray();
        bool Linked(string kind, Guid sourceId, Guid parentId, Guid fallbackCustomer)
        {
            var authoritative = sourceLinks.Where(link => link.Kind.Equals(kind, StringComparison.OrdinalIgnoreCase) && link.SourceId == sourceId && link.ParentId == parentId).ToArray();
            // An explicit reassignment or tombstone wins over historical payload snapshots.
            return authoritative.Length == 0 ? fallbackCustomer == customerId : authoritative.Length == 1 && authoritative[0].CustomerId == customerId;
        }
        var students = records.Where(row => row.Kind == "students" && Linked("students", row.Id, Guid.Empty, Id(rows[row.Id], "customerId"))).Select(row => row.Id).ToHashSet();
        var result = new List<MessagingActivityDto>();
        var exceptions = records.Where(row => row.Kind == "portalExceptions").Select(row => Text(rows[row.Id], "key")).ToHashSet();
        string Court(JsonElement data) => records.FirstOrDefault(row => row.Kind == "courts" && row.Id == Id(data, "courtId"))?.Name ?? "Quadra a confirmar";
        bool ValidTime(JsonElement data) => CourtHours.TryMinute(Text(data, "startTime"), false, out var start) && CourtHours.TryMinute(Text(data, "endTime"), true, out var end) && start < end;
        foreach (var enrollment in records.Where(row => row.Kind == "enrollments"))
        {
            var e = rows[enrollment.Id]; var studentId = Id(e, "studentId");
            if (!students.Contains(studentId) || ClassDeletionRules.Flag(e, "cancelledBeforeStart")) continue;
            var student = records.FirstOrDefault(row => row.Id == studentId && row.Kind == "students");
            if (student is null || Text(rows[studentId], "status") is "Inativo" or "Pausado") continue;
            var lesson = records.FirstOrDefault(row => row.Id == Id(e, "classId") && row.Kind == "classes");
            if (lesson is null) continue;
            var c = rows[lesson.Id];
            if (!ValidTime(c) || !c.TryGetProperty("weekDay", out var dayOfWeek) || !dayOfWeek.TryGetInt32(out var weekday)) continue;
            for (var date = from; date <= until; date = date.AddDays(1))
            {
                if ((int)date.DayOfWeek != weekday || !ClassDeletionRules.IsScheduledOn(c, date) || !Begins(e, "startDate", date) || !Begins(c, "startDate", date)
                    || !Ends(e, "endDate", date) || Text(e, "status") is not ("Ativa" or "Encerrada")
                    || Text(e, "status") == "Encerrada" && !DateOnly.TryParse(Text(e, "endDate"), out _)
                    || exceptions.Contains($"class:{enrollment.Id}:{date:yyyy-MM-dd}")) continue;
                result.Add(new("Class", enrollment.Id, studentId, student.Name, lesson.Name, date,
                    Text(c, "startTime"), Text(c, "endTime"), Court(c), "Pending", 0, Id(c, "courtId")));
            }
        }
        foreach (var reservation in records.Where(row => row.Kind == "reservations"))
        {
            var r = rows[reservation.Id];
            if (!DateOnly.TryParse(Text(r, "date"), out var date) || date < from || date > until || !ValidTime(r)
                || Text(r, "status") is "Cancelada" or "Bloqueio" or "Concluída" || exceptions.Contains($"reservation:{reservation.Id}")) continue;
            var groupId = Id(r, "rentalGroupId");
            if (!rows.TryGetValue(groupId, out var group) || !group.TryGetProperty("members", out var members) || members.ValueKind != JsonValueKind.Array) continue;
            foreach (var member in members.EnumerateArray())
            {
                var memberId = Id(member, "id");
                if (Text(member, "status") != "Ativo" || memberId == Guid.Empty) continue;
                if (!Linked("rentalMembers", memberId, groupId, Id(member, "customerId"))) continue;
                result.Add(new("Rental", reservation.Id, memberId, Text(member, "name"), reservation.Name, date,
                    Text(r, "startTime"), Text(r, "endTime"), Court(r), "Pending", 0, Id(r, "courtId")));
            }
        }
        return result.DistinctBy(OccurrenceId).OrderBy(activity => activity.Date).ThenBy(activity => activity.StartTime).ToArray();
    }
}
