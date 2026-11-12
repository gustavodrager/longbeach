using System.Data;
using System.Globalization;
using System.Text.Json;
using LongBeach.Application.Operations;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Operations;

public sealed record ClassDeletionResult(OperationalRecord? Class, OperationalRecord[] Enrollments,
    OperationalRecord[] Reservations, string? Error = null, bool NotFound = false);

public static class ClassDeletionService
{
    public static async Task<ClassDeletionResult> DeleteAsync(LongBeachDbContext db, Guid classId, int version,
        Guid actor, DateTimeOffset instant, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        // The same lock serializes registrations, reservation writes and subscription creation.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
        var records = await db.OperationalRecords.ToListAsync(ct);
        var lesson = records.SingleOrDefault(row => row.Id == classId && row.Kind == "classes");
        if (lesson is null) return new(null, [], [], "Turma não encontrada. Atualize a página.", true);
        var body = Data(lesson);
        var enrollments = records.Where(row => row.Kind == "enrollments" && ClassDeletionRules.References(Data(row), classId)).ToArray();
        var reservations = records.Where(row => row.Kind == "reservations" && ClassDeletionRules.References(Data(row), classId)).ToArray();
        if (ClassDeletionRules.IsDeleted(body))
        {
            // A lost response can be retried without modifying history or adding another audit.
            return new(lesson, enrollments.Where(row => ClassDeletionRules.Flag(Data(row), "closedByClassDeletion")).ToArray(),
                reservations.Where(row => ClassDeletionRules.Flag(Data(row), "cancelledByClassDeletion")).ToArray());
        }
        if (OperationalValidation.Version(body) != version)
            return new(null, [], [], "Esta turma mudou depois que você a abriu. Atualize os dados antes de excluir.");

        var enrollmentIds = enrollments.Select(row => row.Id).ToArray();
        if (await db.Set<BillingSubscription>().AnyAsync(row => row.SourceKind == "enrollments" && enrollmentIds.Contains(row.SourceId)
            && row.State != "CANCELED" && row.State != "EXPIRED" && row.State != "Rejected", ct))
            return new(null, [], [], ClassDeletionRules.SubscriptionMessage);

        var closed = enrollments.Where(row => OperationalValidation.Text(Data(row), "status") == "Ativa").ToArray();
        foreach (var enrollment in closed)
            enrollment.Update(enrollment.Name, ClassDeletionRules.CloseEnrollment(Data(enrollment), instant).ToJsonString());

        var cancelled = reservations.Where(row => IsFutureReservation(Data(row), instant)).ToArray();
        foreach (var reservation in cancelled)
            reservation.Update(reservation.Name, ClassDeletionRules.CancelReservation(Data(reservation)).ToJsonString());

        lesson.Update(lesson.Name, ClassDeletionRules.Archive(body, actor, instant).ToJsonString());
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new(lesson, closed, cancelled);
    }

    private static bool IsFutureReservation(JsonElement body, DateTimeOffset instant) =>
        OperationalValidation.Text(body, "status") is not ("Cancelada" or "Concluída" or "Chegou")
        && DateOnly.TryParseExact(OperationalValidation.Text(body, "date"), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)
        && day >= ClassDeletionRules.LocalDate(instant)
        && !ClassDeletionRules.StartsBefore(body, day, instant);

    private static JsonElement Data(OperationalRecord row) => JsonSerializer.Deserialize<JsonElement>(row.Payload);
}
