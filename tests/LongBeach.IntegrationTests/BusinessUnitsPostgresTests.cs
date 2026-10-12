using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using LongBeach.Domain.Auditing;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LongBeach.IntegrationTests.OperationalPostgresTests;

namespace LongBeach.IntegrationTests;

public sealed class BusinessUnitsPostgresTests
{
    [PostgresFact]
    public async Task Monthly_review_preserves_classification_from_older_clients_and_rejects_conflicting_area()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory);
        client.DefaultRequestHeaders.Authorization = Header("Owner");
        const string path = "/api/v1/financial-history/monthly-controls/2091-11";
        await using (var scope = factory.Services.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<LongBeachDbContext>().OperationalRecords.Where(x => x.Kind == "monthlyFinanceControls" && x.Name == "2091-11").ExecuteDeleteAsync();
        JsonObject Line(string direction, string scope, string? unit) => new()
        {
            ["id"] = Guid.NewGuid().ToString(), ["label"] = direction + " teste", ["direction"] = direction,
            ["category"] = "Operação", ["costCenter"] = "Arena", ["amountCents"] = 10000,
            ["basis"] = "Informado", ["source"] = "Teste", ["sourceMonth"] = null,
            ["allocationScope"] = scope, ["businessUnitId"] = unit
        };
        var payload = new JsonObject { ["version"] = 0, ["notes"] = "Teste de classificação", ["lines"] = new JsonArray(Line("Receita", "Unit", "bar"), Line("Despesa", "Shared", null)) };
        var response = await client.PutAsJsonAsync(path, payload); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = JsonNode.Parse((await Read(response)).GetRawText())!.AsObject();
        foreach (var node in saved["lines"]!.AsArray()) { node!.AsObject().Remove("allocationScope"); node.AsObject().Remove("businessUnitId"); }
        saved["notes"] = "Revisão por cliente anterior";
        var revised = await client.PutAsJsonAsync(path, saved); Assert.Equal(HttpStatusCode.OK, revised.StatusCode);
        var confirmed = JsonNode.Parse((await Read(revised)).GetRawText())!.AsObject();
        Assert.Equal("bar", confirmed["lines"]![0]!["businessUnitId"]!.GetValue<string>());
        Assert.Equal("Shared", confirmed["lines"]![1]!["allocationScope"]!.GetValue<string>());
        confirmed["lines"]![0]!["costCenter"] = "Escola";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(path, confirmed)).StatusCode);
    }

    [PostgresFact]
    public async Task Classification_is_authorized_versioned_audited_and_preserved_for_old_clients()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory);
        var id = Guid.NewGuid(); var path = $"/api/v1/operations/financeEntries/{id}";
        var payload = new JsonObject { ["id"] = id.ToString(), ["name"] = "Limpeza de teste", ["origin"] = "Arena", ["direction"] = "Pagar", ["amount"] = 100, ["dueDate"] = "2026-10-10", ["status"] = "Pendente", ["allocationScope"] = "Shared", ["businessUnitId"] = null };
        client.DefaultRequestHeaders.Authorization = Header(null, "finance:read");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(path, payload)).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Owner");
        var create = await client.PutAsJsonAsync(path, payload); Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var saved = JsonNode.Parse((await Read(create)).GetRawText())!.AsObject();
        var oldClient = saved.DeepClone().AsObject(); oldClient.Remove("allocationScope"); oldClient.Remove("businessUnitId"); oldClient["name"] = "Limpeza conferida";
        var edit = await client.PutAsJsonAsync(path, oldClient); Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
        var reviewed = JsonNode.Parse((await Read(edit)).GetRawText())!.AsObject();
        Assert.Equal("Shared", reviewed["allocationScope"]!.GetValue<string>()); Assert.Equal(100, reviewed["amount"]!.GetValue<int>());
        saved["allocationScope"] = "Unit"; saved["businessUnitId"] = "bar";
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(path, saved)).StatusCode);
        reviewed["origin"] = "Escola"; reviewed["allocationScope"] = "Unit"; reviewed["businessUnitId"] = "bar";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(path, reviewed)).StatusCode);
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        Assert.Equal(2, await db.Set<AuditLog>().CountAsync(x => x.ResourceId == id.ToString()));
        var audit = await db.Set<AuditLog>().Where(x => x.ResourceId == id.ToString()).ToListAsync();
        Assert.All(audit, x => { Assert.Contains("Shared", x.MetadataJson); Assert.DoesNotContain("Limpeza", x.MetadataJson); });
    }
}
