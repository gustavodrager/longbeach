using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LongBeach.IntegrationTests.OperationalPostgresTests;

namespace LongBeach.IntegrationTests;

public sealed class FinancialReceiptsPostgresTests
{
    [PostgresFact]
    public async Task Receipt_classification_is_persisted_preserved_authorized_and_audited_without_marking_paid()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory);
        var id = Guid.NewGuid(); var path = $"/api/v1/operations/financeEntries/{id}";
        var input = Entry(id); input["receiptSource"] = "CourtPix"; input["receivingAccount"] = "C6";
        client.DefaultRequestHeaders.Authorization = Header(null, "finance:read");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(path, input)).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Owner");
        var create = await client.PutAsJsonAsync(path, input); Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var saved = JsonNode.Parse((await Read(create)).GetRawText())!.AsObject();
        Assert.Equal("Unit", saved["allocationScope"]!.GetValue<string>());
        Assert.Equal("quadra", saved["businessUnitId"]!.GetValue<string>());
        Assert.Equal("Pendente", saved["status"]!.GetValue<string>());
        Assert.Equal(120, saved["amount"]!.GetValue<int>());
        Assert.False(saved.ContainsKey("paidDate"));

        var oldClient = saved.DeepClone().AsObject(); oldClient["name"] = "Descrição corrigida";
        foreach (var key in new[] { "receiptSource", "receivingAccount", "allocationScope", "businessUnitId" }) oldClient.Remove(key);
        var edit = await client.PutAsJsonAsync(path, oldClient); Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
        var revised = JsonNode.Parse((await Read(edit)).GetRawText())!.AsObject();
        Assert.Equal("CourtPix", revised["receiptSource"]!.GetValue<string>());
        Assert.Equal("C6", revised["receivingAccount"]!.GetValue<string>());
        Assert.Equal("quadra", revised["businessUnitId"]!.GetValue<string>());
        saved["receivingAccount"] = "PagBank";
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(path, saved)).StatusCode);

        revised["direction"] = "Pagar";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(path, revised)).StatusCode);
        revised["receiptSource"] = null; revised["receivingAccount"] = null;
        var clear = await client.PutAsJsonAsync(path, revised); Assert.Equal(HttpStatusCode.OK, clear.StatusCode);
        var cleared = await Read(clear);
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("receiptSource").ValueKind);
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("receivingAccount").ValueKind);

        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var audits = await db.AuditLogs.Where(row => row.ResourceId == id.ToString()).ToListAsync();
        Assert.Equal(3, audits.Count);
        Assert.Contains(audits, row => row.MetadataJson.Contains("CourtPix") && row.MetadataJson.Contains("C6"));
        Assert.All(audits, row => { Assert.DoesNotContain("Descrição", row.MetadataJson); Assert.DoesNotContain("privada", row.MetadataJson); });
    }

    [PostgresFact]
    public async Task Terminal_and_pagvendas_allocate_bar_while_unknown_pix_or_bank_alone_stays_unclassified()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory);
        client.DefaultRequestHeaders.Authorization = Header("Owner");
        foreach (var source in new[] { "PagBankTerminal", "PagVendas" })
        {
            var id = Guid.NewGuid(); var input = Entry(id); input["receiptSource"] = source;
            var response = await client.PutAsJsonAsync($"/api/v1/operations/financeEntries/{id}", input);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var saved = await Read(response);
            Assert.Equal("bar", saved.GetProperty("businessUnitId").GetString());
            Assert.False(saved.TryGetProperty("receivingAccount", out _));
            Assert.Equal("Pendente", saved.GetProperty("status").GetString());
            var contradictory = JsonNode.Parse(saved.GetRawText())!.AsObject(); contradictory["origin"] = "Escola";
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/financeEntries/{id}", contradictory)).StatusCode);
        }
        var unknownId = Guid.NewGuid(); var unknown = Entry(unknownId); unknown["name"] = "Pix sem origem conferida"; unknown["receivingAccount"] = "PagBank";
        var genericResponse = await client.PutAsJsonAsync($"/api/v1/operations/financeEntries/{unknownId}", unknown);
        Assert.Equal(HttpStatusCode.Created, genericResponse.StatusCode);
        var generic = await Read(genericResponse);
        Assert.False(generic.TryGetProperty("allocationScope", out _));
        Assert.False(generic.TryGetProperty("businessUnitId", out _));
        Assert.False(generic.TryGetProperty("receiptSource", out _));
    }

    private static JsonObject Entry(Guid id) => new()
    {
        ["id"] = id.ToString(), ["name"] = "Descrição privada de teste", ["origin"] = "Arena",
        ["direction"] = "Receber", ["amount"] = 120, ["dueDate"] = "2026-10-14", ["status"] = "Pendente"
    };
}
