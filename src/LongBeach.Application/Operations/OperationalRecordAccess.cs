using System.Text.Json.Nodes;

namespace LongBeach.Application.Operations;

/// <summary>Academic and infrastructure permissions do not grant financial information.</summary>
public static class OperationalRecordAccess
{
    private static string[] Fields(string kind) => kind switch
    {
        "rentalGroups" => ["monthlyAmount", "extraAmount"], "rentalMonths" => ["amount"],
        "students" => ["monthlyAmount", "paymentStatus", "paymentDate", "statementName"],
        "enrollments" => ["monthlyAmount"], "team" => ["payAmount", "payBasis", "paymentFrequency", "paymentDay", "notes"], "inventory" => ["unitCost", "paymentMethod"],
        "projects" => ["estimatedCost", "actualCost"], "reservations" => ["amount"], _ => []
    };
    private static JsonNode Default(string field) => field is "paymentStatus" or "paymentDate" or "statementName" or "payBasis" or "paymentFrequency" or "paymentDay" or "notes" or "paymentMethod" ? JsonValue.Create("")! : JsonValue.Create(0)!;
    public static string VisiblePayload(string json, string kind, bool financeRead)
    {
        var fields = Fields(kind);
        if (fields.Length == 0) return json;
        var payload = JsonNode.Parse(json)!.AsObject();
        payload["costsVisible"] = financeRead;
        if (!financeRead) foreach (var field in fields) payload[field] = kind is "rentalGroups" or "rentalMonths" ? null : Default(field);
        return payload.ToJsonString();
    }
    public static (JsonObject Body, bool Allowed) PrepareWrite(string incomingJson, string? savedJson, string kind, bool financeRead, bool financeWrite)
    {
        var incoming = JsonNode.Parse(incomingJson)!.AsObject();
        incoming.Remove("costsVisible");
        if (financeWrite) return (incoming, true);
        var previous = savedJson is null ? null : JsonNode.Parse(savedJson)!.AsObject();
        foreach (var field in Fields(kind))
        {
            var saved = previous is not null && previous.ContainsKey(field) ? previous[field]?.DeepClone() : kind is "rentalGroups" or "rentalMonths" ? null : Default(field);
            if (financeRead && incoming[field] is not null && !JsonNode.DeepEquals(incoming[field], saved)) return (incoming, false);
            incoming[field] = saved;
        }
        return (incoming, true);
    }
}
