using System.Text.Json;
using System.Text.Json.Nodes;

namespace LongBeach.Application.Operations;

public static class RentalMusicPreferences
{
    private const string Field = "musicPreferences";
    private static readonly HashSet<string> Genres = new(StringComparer.Ordinal)
    {
        "rock", "pop", "pagode", "samba", "sertanejo", "mpb", "funk", "forro-piseiro",
        "rap-hip-hop", "trap", "eletronica", "reggae", "axe", "gospel", "brega-arrocha"
    };
    public static string? Validate(JsonElement body)
    {
        const string error = "Confira as preferências musicais: escolha estilos da lista, sem repetir.";
        if (body.ValueKind != JsonValueKind.Object) return error;
        if (!body.TryGetProperty(Field, out var choices)) return null;
        if (choices.ValueKind != JsonValueKind.Array || choices.GetArrayLength() > Genres.Count) return error;
        var selected = new HashSet<string>(StringComparer.Ordinal);
        foreach (var choice in choices.EnumerateArray())
            if (choice.ValueKind != JsonValueKind.String || !Genres.Contains(choice.GetString()!) || !selected.Add(choice.GetString()!))
                return error;
        return null;
    }
    public static void PreserveOmitted(JsonObject incoming, string? savedJson)
    {
        if (incoming.ContainsKey(Field) || savedJson is null) return;
        var saved = JsonNode.Parse(savedJson)!.AsObject();
        // A legacy omission preserves the stored preference. An explicit empty
        // array clears it. Records that never had the field stay unchanged.
        if (saved.ContainsKey(Field)) incoming[Field] = saved[Field]?.DeepClone();
    }
}
