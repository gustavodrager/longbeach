using System.Text.Json.Nodes;
using LongBeach.Domain.Inventory;

namespace LongBeach.Application.Inventory;

public static class MaterialRecordRules
{
    public static decimal Number(JsonObject value, string key) => value[key] is JsonValue v && v.TryGetValue<decimal>(out var number)
        ? number : throw new InventoryRuleException($"Informe {key} como número.");
    public static string Text(JsonObject value, string key) => value[key] is JsonValue v && v.TryGetValue<string>(out var text) ? text : "";

    public static void GuardMetadata(JsonObject incoming, string? previousJson, bool hasLedgerHistory = false)
    {
        var previous = previousJson is null ? null : JsonNode.Parse(previousJson)!.AsObject();
        if (previous is not null)
            foreach (var field in new[] { "unitCost", "paymentMethod" })
                if (!incoming.ContainsKey(field) && previous.ContainsKey(field)) incoming[field] = previous[field]?.DeepClone();
        var quantity = StockQuantity.Validate(Number(incoming, "quantity"), true);
        StockQuantity.Validate(Number(incoming, "minimum"), true);
        var unit = MaterialMovement.Text(Text(incoming, "unit"), 20, "Unidade");
        MaterialMovement.Text(Text(incoming, "location"), 160, "Local de armazenamento");
        var nature = Text(incoming, "nature");
        if (nature == "") nature = previous is null ? "Consumable" : Text(previous, "nature") is { Length: > 0 } savedNature ? savedNature : "Unclassified";
        if (nature is not ("Consumable" or "Unclassified" or "Reusable" or "Asset"))
            throw new InventoryRuleException("Finalidade do material inválida.");
        if (quantity != (previous is null ? 0 : Number(previous, "quantity")))
            throw new InventoryRuleException("Use uma entrada, consumo, perda ou contagem para alterar a quantidade. Novos materiais começam zerados.");
        if (previous is not null && !incoming.ContainsKey("movements") && previous.ContainsKey("movements"))
            incoming["movements"] = previous["movements"]?.DeepClone();
        if (!JsonNode.DeepEquals(incoming["movements"] ?? new JsonArray(), previous?["movements"] ?? new JsonArray()))
            throw new InventoryRuleException("O histórico anterior deve ser preservado. Registre uma nova movimentação.");
        // An empty legacy definition can be completed explicitly once, only before any use.
        // An established unit stays fixed even after the balance returns to zero.
        if (previous is not null && unit != Text(previous, "unit").Trim())
        {
            var canCompleteMissingUnit = Text(previous, "unit").Trim().Length == 0
                && quantity == 0 && !hasLedgerHistory
                && (previous["movements"] is null or JsonArray { Count: 0 });
            if (!canCompleteMissingUnit)
                throw new InventoryRuleException(Text(previous, "unit").Trim().Length == 0
                    ? "Material antigo sem unidade e com saldo ou histórico exige reconciliação antes de cadastrar a unidade."
                    : "A unidade de um material existente não pode ser alterada. Cadastre outro material.");
        }
        incoming["unit"] = unit;
        incoming["nature"] = nature;
    }
}
