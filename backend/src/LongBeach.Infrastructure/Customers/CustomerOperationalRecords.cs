using System.Text.Json.Nodes;
using LongBeach.Application.Customers;
using LongBeach.Domain.Customers;

namespace LongBeach.Infrastructure.Customers;

/// <summary>Contact projections only. These links never authorize a portal or financial account.</summary>
public static class CustomerOperationalRecords
{
    public static async Task PrepareWriteAsync(ICustomerRegistry registry, string kind, Guid id,
        JsonObject incoming, string? savedJson, CancellationToken ct, bool imported = false, bool allowReassignment = false)
    {
        var previous = savedJson is null ? null : JsonNode.Parse(savedJson)!.AsObject();
        if (kind == "students")
        {
            if (previous is null && Selected(incoming) is Guid selected && registry is ICustomers directory)
            {
                var links = await directory.Links(selected, ct);
                if (links.Any(link => link.Kind == "students" && link.SourceId != id))
                    throw new CustomerRuleException("Este cliente já possui ficha de aluno. Abra a ficha existente em Alunos para preservar as matrículas.", 409);
            }
            var contact = await Ensure(registry, new("students", id, null, Text(incoming, "name"),
                Text(incoming, "phone"), CustomerId: Selected(incoming), AllowIncomplete: imported || previous is not null), allowReassignment, ct);
            Apply(incoming, contact, "name");
        }
        else if (kind == "rentalGroups" && incoming["members"] is JsonArray members)
        {
            var oldIds = (previous?["members"] as JsonArray ?? []).OfType<JsonObject>()
                .Select(member => Text(member, "id")).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var member in members.OfType<JsonObject>())
            {
                if (!Guid.TryParse(Text(member, "id"), out var memberId) || memberId == Guid.Empty)
                    throw new CustomerRuleException("Confira a identificação do integrante.");
                var contact = await Ensure(registry, new("rentalMembers", memberId, id, Text(member, "name"),
                    Text(member, "phone"), CustomerId: Selected(member), AllowIncomplete: imported || oldIds.Contains(memberId.ToString())), allowReassignment, ct);
                Apply(member, contact, "name");
            }
        }
        else if (kind == "reservations")
        {
            var selected = Selected(incoming);
            var existing = await registry.GetSourceAsync("reservations", id, null, ct);
            // A free-form group/mesa label is not a person. Only an explicit customer, a
            // previous identity, or a complete named contact creates a cadastral link.
            if (selected is null && existing is null && (Text(incoming, "rentalGroupId") != "" || Text(incoming, "customerName").Trim() == "" || Text(incoming, "phone").Trim() == "")) return;
            var contact = await Ensure(registry, new("reservations", id, null, Text(incoming, "customerName"),
                Text(incoming, "phone"), CustomerId: selected, AllowIncomplete: imported || previous is not null), allowReassignment, ct);
            Apply(incoming, contact, "customerName");
        }
    }

    private static async Task<CustomerContact> Ensure(ICustomerRegistry registry, CustomerSourceInput input, bool allowReassignment, CancellationToken ct)
    {
        if (allowReassignment && input.CustomerId is Guid id && await registry.GetSourceAsync(input.Kind, input.SourceId, input.ParentId, ct) is { } before)
        {
            var selected = await registry.ResolveAsync(id, ct) ?? throw new CustomerRuleException("Cliente não encontrado.", 404);
            if (selected.Id != before.Id)
                return (await registry.SetSourceAsync(input.Kind, input.SourceId, input.ParentId, selected.Id, ct))!;
        }
        return await registry.EnsureSourceAsync(input, ct);
    }

    public static async Task<string> ProjectAsync(ICustomerRegistry registry, string kind, Guid id, string json, CancellationToken ct)
    {
        if (kind is not ("students" or "rentalGroups" or "reservations")) return json;
        var body = JsonNode.Parse(json)!.AsObject();
        if (kind == "rentalGroups")
        {
            // A legacy group may have no roster yet. The group itself is not a person.
            if (body["members"] is JsonArray members)
            {
                foreach (var member in members.OfType<JsonObject>())
                {
                    if (!Guid.TryParse(Text(member, "id"), out var memberId)) continue;
                    var contact = await registry.GetSourceAsync("rentalMembers", memberId, id, ct);
                    if (contact is not null) Apply(member, contact, "name");
                }
            }
        }
        else
        {
            var contact = await registry.GetSourceAsync(kind, id, null, ct);
            if (contact is not null) Apply(body, contact, kind == "students" ? "name" : "customerName");
        }
        return body.ToJsonString();
    }

    private static void Apply(JsonObject body, CustomerContact contact, string nameKey)
    {
        body["customerId"] = contact.Id.ToString();
        body[nameKey] = contact.Name;
        body["phone"] = contact.Phone;
    }
    private static Guid? Selected(JsonObject body)
    {
        if (body["customerId"] is null || Text(body, "customerId") == "") return null;
        return Guid.TryParse(Text(body, "customerId"), out var id) && id != Guid.Empty
            ? id : throw new CustomerRuleException("Escolha um cliente cadastrado válido.");
    }
    private static string Text(JsonObject value, string key) => value[key]?.ToString() ?? "";
}
