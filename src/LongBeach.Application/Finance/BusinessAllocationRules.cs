using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Domain.Operations;

namespace LongBeach.Application.Finance;

public sealed record BusinessAllocation(string Scope, string? BusinessUnitId);

public static class BusinessAllocationRules
{
    public static BusinessAllocation FromLegacy(string origin) => origin switch
    {
        "Bar" => new("Unit", BusinessUnits.Bar),
        "Escola" or "Locações" => new("Unit", BusinessUnits.Court),
        _ => new("Unclassified", null)
    };

    public static string? Validate(string origin, string? scope, string? unit)
    {
        // Older clients and historical documents remain readable without a bulk rewrite.
        if (scope is null && unit is null) return null;
        if (scope == "Unit" ? !BusinessUnits.Contains(unit) : scope is not ("Shared" or "Unclassified") || unit is not null)
            return "Confira a unidade de negócio e a classificação do lançamento.";
        var legacy = FromLegacy(origin);
        if (legacy.Scope == "Unit" && (scope != "Unit" || unit != legacy.BusinessUnitId))
            return "A unidade de negócio deve corresponder à origem: Bar ou Quadra (Escola e Locações).";
        return null;
    }

    public static string? Validate(JsonElement body)
    {
        foreach (var field in new[] { "allocationScope", "businessUnitId" })
            if (body.TryGetProperty(field, out var value) && value.ValueKind is not (JsonValueKind.String or JsonValueKind.Null))
                return "A classificação da unidade de negócio é inválida.";
        string? Read(string key) => body.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
        return Validate(Read("origin") ?? "", Read("allocationScope"), Read("businessUnitId"));
    }

    public static void PreserveOmitted(JsonObject incoming, string? previous)
    {
        if (previous is null || incoming["allocationScope"] is not null || incoming["businessUnitId"] is not null) return;
        var saved = JsonNode.Parse(previous)!.AsObject();
        foreach (var key in new[] { "allocationScope", "businessUnitId" })
            if (saved.ContainsKey(key)) incoming[key] = saved[key]?.DeepClone();
    }
}
