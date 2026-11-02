using System.Text.Json;

namespace LongBeach.Application.Operations;

public static class ClassDeletionRules
{
    public const string LinkedRecordsMessage = "Esta turma possui alunos ou histórico vinculado. Encerre a turma para preservar os registros.";

    public static string? Validate(Guid classId, JsonElement lesson, IEnumerable<JsonElement> records)
    {
        // Older imports may still keep their roster on the class itself.
        if (lesson.TryGetProperty("studentIds", out var students)
            && (students.ValueKind != JsonValueKind.Array || students.GetArrayLength() > 0))
            return LinkedRecordsMessage;
        return records.Any(row => ReferencesClass(row, classId)) ? LinkedRecordsMessage : null;
    }

    private static bool ReferencesClass(JsonElement value, Guid classId)
    {
        if (value.ValueKind == JsonValueKind.Array)
            return value.EnumerateArray().Any(item => ReferencesClass(item, classId));
        if (value.ValueKind != JsonValueKind.Object) return false;
        foreach (var property in value.EnumerateObject())
        {
            if (property.Name is "classId" or "sourceId"
                && property.Value.ValueKind == JsonValueKind.String
                && Guid.TryParse(property.Value.GetString(), out var id) && id == classId)
                return true;
            if (ReferencesClass(property.Value, classId)) return true;
        }
        return false;
    }
}
