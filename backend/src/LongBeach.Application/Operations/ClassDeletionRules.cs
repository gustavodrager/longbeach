using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace LongBeach.Application.Operations;

/// <summary>Server-owned deletion metadata preserves the class and all of its references.</summary>
public static class ClassDeletionRules
{
    public const string ReadOnlyMessage = "Esta turma foi excluída. Seu histórico está disponível somente para consulta.";
    public const string SubscriptionMessage = "Esta turma possui uma assinatura de cobrança recorrente ativa ou aguardando confirmação. Cancele a assinatura e aguarde a confirmação antes de excluir a turma. Os registros anteriores serão preservados.";
    public static readonly TimeZoneInfo ArenaZone = TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");
    private static readonly string[] MetadataFields =
        ["deletedAt", "deletedBy", "deletedEffectiveDate", "deletedPreviousStatus", "closedByClassDeletion", "cancelledBeforeStart", "cancelledByClassDeletion"];

    public static bool IsDeleted(JsonElement value) => !string.IsNullOrEmpty(OperationalValidation.Text(value, "deletedAt"));
    public static bool Flag(JsonElement value, string name) => value.TryGetProperty(name, out var flag) && flag.ValueKind == JsonValueKind.True;
    public static bool Flag(JsonObject value, string name) => value[name] is JsonValue flag && flag.TryGetValue<bool>(out var enabled) && enabled;
    public static bool HasReservedMetadata(JsonElement value) => MetadataFields.Any(field => value.TryGetProperty(field, out _));
    public static bool IsDerivedHistory(JsonElement value) => Flag(value, "closedByClassDeletion") || Flag(value, "cancelledByClassDeletion");
    public static bool References(JsonElement value, Guid classId) =>
        Guid.TryParse(OperationalValidation.Text(value, "classId"), out var id) && id == classId;
    public static DateOnly LocalDate(DateTimeOffset instant) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, ArenaZone).DateTime);

    public static JsonObject Archive(JsonElement lesson, Guid actor, DateTimeOffset instant)
    {
        var result = JsonNode.Parse(lesson.GetRawText())!.AsObject();
        result["deletedPreviousStatus"] = OperationalValidation.Text(lesson, "status");
        result["status"] = "Encerrada";
        result["deletedAt"] = instant.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
        result["deletedBy"] = actor.ToString();
        result["deletedEffectiveDate"] = LocalDate(instant).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        result["version"] = checked(OperationalValidation.Version(lesson) + 1);
        return result;
    }

    public static JsonObject CloseEnrollment(JsonElement enrollment, DateTimeOffset instant)
    {
        var result = JsonNode.Parse(enrollment.GetRawText())!.AsObject();
        var day = LocalDate(instant);
        var future = DateOnly.TryParseExact(OperationalValidation.Text(enrollment, "startDate"), "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var start) && start > day;
        result["status"] = "Encerrada";
        // Keep start/end ordering for a future registration, but never make this
        // artificial one-day interval eligible for attendance or appointments.
        result["endDate"] = (future ? start : day).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        result["closedByClassDeletion"] = true;
        result["cancelledBeforeStart"] = future;
        result["version"] = checked(OperationalValidation.Version(enrollment) + 1);
        return result;
    }

    public static JsonObject CancelReservation(JsonElement reservation)
    {
        var result = JsonNode.Parse(reservation.GetRawText())!.AsObject();
        result["status"] = "Cancelada";
        result["cancelledByClassDeletion"] = true;
        result["version"] = checked(OperationalValidation.Version(reservation) + 1);
        return result;
    }

    public static bool StartsBefore(JsonElement value, DateOnly day, DateTimeOffset cutoff)
    {
        if (!CourtHours.TryMinute(OperationalValidation.Text(value, "startTime"), false, out var minute)) return false;
        var local = day.ToDateTime(TimeOnly.MinValue).AddMinutes(minute);
        return new DateTimeOffset(local, ArenaZone.GetUtcOffset(local)) < cutoff;
    }

    public static bool IsScheduledOn(JsonElement lesson, DateOnly day)
    {
        if (!OperationalValidation.ClassStartedOn(lesson, day)) return false;
        if (!IsDeleted(lesson)) return OperationalValidation.Text(lesson, "status") == "Ativa";
        return OperationalValidation.Text(lesson, "deletedPreviousStatus") == "Ativa"
            && DateTimeOffset.TryParse(OperationalValidation.Text(lesson, "deletedAt"), CultureInfo.InvariantCulture, DateTimeStyles.None, out var cutoff)
            && StartsBefore(lesson, day, cutoff);
    }
}
