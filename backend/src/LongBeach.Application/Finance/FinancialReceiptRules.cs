using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Domain.Operations;

namespace LongBeach.Application.Finance;

/// <summary>Business classification comes from the receipt source, never from the destination account.</summary>
public static class FinancialReceiptRules
{
    public static string? BusinessUnitFor(string? receiptSource) => receiptSource switch
    {
        "PagBankTerminal" or "PagVendas" => BusinessUnits.Bar,
        "CourtPix" => BusinessUnits.Court,
        _ => null
    };

    public static void PrepareWrite(JsonObject incoming, string? previous)
    {
        // An older client must not erase receipt information it did not know about.
        // Explicit null means clear, and is therefore distinct from an omitted property.
        var saved = previous is null ? null : JsonNode.Parse(previous)!.AsObject();
        foreach (var key in new[] { "receiptSource", "receivingAccount" })
            if (!incoming.ContainsKey(key) && saved?.ContainsKey(key) == true)
                incoming[key] = saved[key]?.DeepClone();

        if (incoming.ContainsKey("allocationScope") || incoming.ContainsKey("businessUnitId")) return;
        if (incoming["receiptSource"] is not JsonValue value || !value.TryGetValue<string>(out var source)) return;
        var unit = BusinessUnitFor(source);
        if (unit is null) return;
        incoming["allocationScope"] = "Unit";
        incoming["businessUnitId"] = unit;
    }

    public static string? Validate(JsonElement body)
    {
        foreach (var key in new[] { "receiptSource", "receivingAccount" })
            if (body.TryGetProperty(key, out var value) && value.ValueKind is not (JsonValueKind.String or JsonValueKind.Null))
                return "Confira o canal de recebimento e a conta de destino.";

        string? Read(string key) => body.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
        var source = Read("receiptSource");
        var account = Read("receivingAccount");
        if (source is not (null or "PagBankTerminal" or "PagVendas" or "CourtPix") || account is not (null or "PagBank" or "C6"))
            return "Confira o canal de recebimento e a conta de destino.";
        if ((source is not null || account is not null) && Read("direction") != "Receber")
            return "Canal de recebimento e conta de destino só se aplicam a valores a receber.";
        if (source == "CourtPix" && account is null)
            return "Informe se o Pix da Quadra foi destinado à conta PagBank ou C6.";

        if (Read("direction") == "Receber" && Read("sourceKind") is "reservations" or "enrollments" or "rentalMonths" &&
            (BusinessUnitFor(source) == BusinessUnits.Bar || BusinessAllocationRules.FromLegacy(Read("origin") ?? "").BusinessUnitId == BusinessUnits.Bar ||
             Read("businessUnitId") == BusinessUnits.Bar || Read("allocationScope") == "Shared"))
            return "Uma cobrança vinculada a reserva, matrícula ou mensalista deve permanecer na Quadra.";

        var unit = BusinessUnitFor(source);
        if (unit is null) return null;
        var originAllocation = BusinessAllocationRules.FromLegacy(Read("origin") ?? "");
        if (originAllocation.Scope == "Unit" && originAllocation.BusinessUnitId != unit)
            return "A origem deve corresponder ao canal: maquininha PagBank e PagVendas são do Bar; Pix da Quadra é da Quadra.";
        if ((body.TryGetProperty("allocationScope", out _) || body.TryGetProperty("businessUnitId", out _)) &&
            (Read("allocationScope") != "Unit" || Read("businessUnitId") != unit))
            return "A unidade deve corresponder ao canal: maquininha PagBank e PagVendas são do Bar; Pix da Quadra é da Quadra.";
        return null;
    }
}
