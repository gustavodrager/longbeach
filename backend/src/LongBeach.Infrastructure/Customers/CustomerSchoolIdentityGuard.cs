using System.Text.Json;
using LongBeach.Application.Customers;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Customers;

public static class CustomerSchoolIdentityGuard
{
    public static async Task CheckAsync(LongBeachDbContext db, ICustomerRegistry registry, string kind, Guid id,
        JsonElement body, IReadOnlyList<OperationalRecord> records, CancellationToken ct, bool lockIdentity = true)
    {
        if (kind is not ("enrollments" or "presences") || kind == "enrollments" && Text(body, "status") != "Ativa") return;
        // Same ordering as arena writes/backfill: agenda first, then cadastral identity.
        if (lockIdentity) await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031907)", ct);
        var person = await registry.GetSourceAsync("students", Id(body, "studentId"), null, ct);
        if (person is null) return;
        foreach (var row in records.Where(row => row.Kind == kind && row.Id != id))
        {
            var other = JsonSerializer.Deserialize<JsonElement>(row.Payload);
            if (Id(other, "classId") != Id(body, "classId") || kind == "enrollments" && Text(other, "status") != "Ativa"
                || kind == "presences" && Text(other, "date") != Text(body, "date")) continue;
            var otherStudent = Id(other, "studentId");
            if (otherStudent == Guid.Empty) continue;
            var contact = await registry.GetSourceAsync("students", otherStudent, null, ct);
            if (contact?.Id == person.Id)
                throw new CustomerRuleException(kind == "enrollments"
                    ? "Este cliente já tem matrícula ativa nesta turma por outra ficha de aluno. Peça à gestão para conferir os cadastros."
                    : "Este cliente já possui presença nesta turma e data por outra ficha de aluno. Confira o registro existente.", 409);
        }
    }
    private static string Text(JsonElement body, string key) => body.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    private static Guid Id(JsonElement body, string key) => Guid.TryParse(Text(body, key), out var id) ? id : Guid.Empty;
}
