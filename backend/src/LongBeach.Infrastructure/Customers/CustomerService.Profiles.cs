using System.Text.Json;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Customers;

public sealed partial class CustomerService
{
    private sealed record ProfileCustomer(Guid Id, Guid? MergedIntoId);
    private sealed record ProfileSource(Guid Id, string Kind, Guid SourceId, Guid? CustomerId);
    private sealed record ProfileReservation(Guid Id, string? Status, string? ActivityKind, string? TeacherId, string? RentalGroupId);
    private sealed record ProfileSchoolRequest(Guid Id, string ReservationId);
    private sealed record CustomerProfileIndex(IReadOnlyDictionary<Guid, HashSet<string>> Labels, IReadOnlySet<Guid> SportsCustomers);

    private async Task<CustomerProfileIndex> Profiles(CancellationToken ct, Guid? selectedCustomer = null)
    {
        var customers = await db.Set<Customer>().AsNoTracking()
            .Select(row => new ProfileCustomer(row.Id, row.MergedIntoId)).ToDictionaryAsync(row => row.Id, ct);
        foreach (var entry in db.ChangeTracker.Entries<Customer>().Where(entry => entry.State != EntityState.Unchanged))
            if (entry.State == EntityState.Deleted) customers.Remove(entry.Entity.Id);
            else customers[entry.Entity.Id] = new(entry.Entity.Id, entry.Entity.MergedIntoId);

        Guid CanonicalId(Guid customerId)
        {
            var seen = new HashSet<Guid>();
            while (customers.TryGetValue(customerId, out var customer) && customer.MergedIntoId is Guid next && seen.Add(customerId))
                customerId = next;
            return customerId;
        }
        var family = selectedCustomer is Guid selected ? customers.Keys.Where(id => CanonicalId(id) == selected).ToHashSet() : null;
        var sourceQuery = db.Set<CustomerSourceLink>().AsNoTracking();
        if (family is not null) sourceQuery = sourceQuery.Where(row => row.CustomerId != null && family.Contains(row.CustomerId.Value));
        var sources = await sourceQuery
            .Select(row => new ProfileSource(row.Id, row.Kind, row.SourceId, row.CustomerId)).ToDictionaryAsync(row => row.Id, ct);
        foreach (var entry in db.ChangeTracker.Entries<CustomerSourceLink>().Where(entry => entry.State != EntityState.Unchanged))
            if (entry.State == EntityState.Deleted || family is not null && (entry.Entity.CustomerId is not Guid localCustomer || !family.Contains(localCustomer))) sources.Remove(entry.Entity.Id);
            else sources[entry.Entity.Id] = new(entry.Entity.Id, entry.Entity.Kind, entry.Entity.SourceId, entry.Entity.CustomerId);

        var reservationIds = sources.Values.Where(row => row.Kind == "reservations" && row.CustomerId != null)
            .Select(row => row.SourceId).Distinct().ToArray();
        var avulso = new HashSet<Guid>();
        if (reservationIds.Length > 0)
        {
            // Read only classification fields, never contact details, messages or financial payloads.
            var reservations = await db.Database.SqlQuery<ProfileReservation>($"""
                SELECT "Id", "Payload"->>'status' AS "Status", "Payload"->>'activityKind' AS "ActivityKind",
                       "Payload"->>'teacherId' AS "TeacherId", "Payload"->>'rentalGroupId' AS "RentalGroupId"
                FROM operational_records
                WHERE "Kind"='reservations' AND "Id"=ANY({reservationIds})
                """).ToDictionaryAsync(row => row.Id, ct);
            var reservationKeys = reservationIds.Select(id => id.ToString()).ToArray();
            var schoolRequests = await db.Database.SqlQuery<ProfileSchoolRequest>($"""
                SELECT "Id", "Payload"->>'reservationId' AS "ReservationId"
                FROM operational_records
                WHERE "Kind"='portalRequests' AND ("Payload"->>'reservationId')=ANY({reservationKeys})
                  AND (("Payload"->>'kind')='Trial' OR
                       ("Payload"->>'kind')='Reschedule' AND ("Payload"->>'appointmentKey') LIKE 'class:%')
                """).ToDictionaryAsync(row => row.Id, ct);
            foreach (var entry in db.ChangeTracker.Entries<OperationalRecord>().Where(entry => entry.State != EntityState.Unchanged))
            {
                var row = entry.Entity;
                if (row.Kind is not ("reservations" or "portalRequests")) continue;
                reservations.Remove(row.Id); schoolRequests.Remove(row.Id);
                if (entry.State == EntityState.Deleted) continue;
                using var document = JsonDocument.Parse(row.Payload);
                var body = document.RootElement;
                if (body.ValueKind != JsonValueKind.Object) continue;
                if (row.Kind == "reservations" && reservationIds.Contains(row.Id))
                    reservations[row.Id] = new(row.Id, Field(body, "status"), Field(body, "activityKind"), Field(body, "teacherId"), Field(body, "rentalGroupId"));
                if (row.Kind == "portalRequests" && (Field(body, "kind") == "Trial" ||
                    Field(body, "kind") == "Reschedule" && (Field(body, "appointmentKey") ?? "").StartsWith("class:", StringComparison.Ordinal)) &&
                    Guid.TryParse(Field(body, "reservationId"), out var id) && reservationIds.Contains(id))
                    schoolRequests[row.Id] = new(row.Id, id.ToString());
            }
            var schoolReservations = schoolRequests.Values.Select(row => Guid.Parse(row.ReservationId)).ToHashSet();
            foreach (var row in reservations.Values.Where(row => !schoolReservations.Contains(row.Id)))
            {
                if (row.Status is not ("Confirmada" or "Chegou" or "Concluída") || !string.IsNullOrEmpty(row.RentalGroupId) ||
                    row.ActivityKind is not (null or "" or "SingleLesson")) continue;
                var teacher = Guid.TryParse(row.TeacherId, out var teacherId) && teacherId != Guid.Empty;
                if (row.ActivityKind == "SingleLesson" ? teacher : string.IsNullOrEmpty(row.TeacherId)) avulso.Add(row.Id);
            }
        }

        var result = new Dictionary<Guid, HashSet<string>>();
        var sportsCustomers = new HashSet<Guid>();
        foreach (var source in sources.Values)
        {
            if (source.CustomerId is not Guid customerId) continue;
            customerId = CanonicalId(customerId);
            // "Somente bar" is conservative: any identified sports record, including history,
            // rules it out even if the activity is not an Avulso (trial, replacement, cancellation).
            if (source.Kind is "students" or "rentalMembers" or "reservations") sportsCustomers.Add(customerId);
            var profile = source.Kind == "reservations" && avulso.Contains(source.SourceId) ? "Avulso" : Profile(source.Kind);
            if (profile is null) continue;
            if (!result.TryGetValue(customerId, out var found)) result[customerId] = found = [];
            found.Add(profile);
        }
        return new(result, sportsCustomers);
    }

    private static string? Field(JsonElement body, string field) => !body.TryGetProperty(field, out var value) || value.ValueKind == JsonValueKind.Null
        ? null : value.ValueKind == JsonValueKind.String ? value.GetString() : value.GetRawText();
}
