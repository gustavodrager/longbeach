using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Contracts.Inventory;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Inventory;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class MaterialStockPostgresTests
{
    [PostgresFact]
    public async Task Http_material_flow_protects_metadata_and_financial_fields_and_records_auditable_history()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var id = await Seed(isolated.Context); var actor = Guid.NewGuid();
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(actor, "inventory:read", "inventory:write", "inventory:adjust"));
        var input = Input(1, "Receipt", 1.125m);
        var response = await client.PostAsJsonAsync($"/api/v1/materials/{id}/movements", input);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonElement>());
        Assert.Equal(3.625m, body.GetProperty("material").GetProperty("quantity").GetDecimal());
        Assert.Equal(0, body.GetProperty("material").GetProperty("unitCost").GetDecimal());
        Assert.Equal(actor, body.GetProperty("movement").GetProperty("actorId").GetGuid());
        var updated = JsonNode.Parse(body.GetProperty("material").GetRawText())!.AsObject();
        updated["quantity"] = 90;
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/inventory/{id}", updated)).StatusCode);
        updated["quantity"] = 3.625m; updated["movements"] = new JsonArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/inventory/{id}", updated)).StatusCode);
        updated["movements"] = JsonNode.Parse("""[{"id":"old","kind":"Entrada","quantity":2.5,"occurredAt":"2026-10-01"}]""");
        updated["name"] = "Material renomeado";
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/operations/inventory/{id}", updated)).StatusCode);
        // A lost metadata response may be retried with the original version without a new write.
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/operations/inventory/{id}", updated)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/v1/materials/{id}/movements", Input(3, "Count", 0))).StatusCode);
        var managerId = Guid.NewGuid();
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(managerId, ["Manager"]));
        var count = await client.PostAsJsonAsync($"/api/v1/materials/{id}/movements", Input(3, "Count", 0));
        Assert.Equal(HttpStatusCode.OK, count.StatusCode);
        var history = (await client.GetFromJsonAsync<MaterialHistory>($"/api/v1/materials/{id}/movements"))!;
        Assert.Equal(2, history.Total); Assert.All(history.Items, row => Assert.Equal(row.Kind == "Count" ? managerId : actor, row.ActorId));
        Assert.All(history.Items, row => Assert.True(row.OccurredAt > DateTimeOffset.UtcNow.AddMinutes(-2)));
        await using var db = isolated.NewContext();
        var material = JsonNode.Parse((await db.OperationalRecords.SingleAsync(x => x.Id == id)).Payload)!;
        Assert.Equal(9m, material["unitCost"]!.GetValue<decimal>());
        Assert.Single(material["movements"]!.AsArray());
        Assert.True(await db.AuditLogs.AnyAsync(x => x.Resource == nameof(MaterialMovement) && x.ResourceId == input.OperationId.ToString() && x.ActorUserId == actor));
    }

    [PostgresFact]
    public async Task Retries_return_original_receipt_and_current_material_without_duplicate_or_overwrite()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var id = await Seed(isolated.Context); var actor = Guid.NewGuid(); var input = Input(1, "Consumption", 0.5m);
        await using (var db = isolated.NewContext()) await new MaterialStockService(db).Move(id, input, actor, default);
        await using (var db = isolated.NewContext()) await new MaterialStockService(db).Move(id, Input(2, "Loss", 1), actor, default);
        await using (var db = isolated.NewContext())
        {
            var replay = await new MaterialStockService(db).Move(id, input, actor, default);
            Assert.Equal(2m, replay.Movement.After);
            Assert.Equal(1m, JsonNode.Parse(replay.Payload)!["quantity"]!.GetValue<decimal>());
            Assert.Equal(2, await db.Set<MaterialMovement>().CountAsync(x => x.MaterialId == id));
        }
        await using (var db = isolated.NewContext()) await Assert.ThrowsAsync<InventoryRuleException>(() => new MaterialStockService(db).Move(id, input with { Quantity = 1 }, actor, default));
        await using (var db = isolated.NewContext()) await Assert.ThrowsAsync<InventoryRuleException>(() => new MaterialStockService(db).Move(id, input, Guid.NewGuid(), default));
    }

    [PostgresFact]
    public async Task Concurrent_movements_cannot_overwrite_and_insufficient_stock_is_atomic()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var id = await Seed(isolated.Context); var actor = Guid.NewGuid();
        async Task<bool> Attempt()
        {
            await using var db = isolated.NewContext();
            try { await new MaterialStockService(db).Move(id, Input(1, "Consumption", 2), actor, default); return true; }
            catch (DbUpdateConcurrencyException) { return false; }
        }
        Assert.Single(await Task.WhenAll(Attempt(), Attempt()), success => success);
        await using (var db = isolated.NewContext()) await Assert.ThrowsAsync<InventoryRuleException>(() => new MaterialStockService(db).Move(id, Input(2, "Loss", 1), actor, default));
        await using (var db = isolated.NewContext())
        {
            Assert.Single(await db.Set<MaterialMovement>().Where(x => x.MaterialId == id).ToArrayAsync());
            Assert.Equal(0.5m, JsonNode.Parse((await db.OperationalRecords.SingleAsync(x => x.Id == id)).Payload)!["quantity"]!.GetValue<decimal>());
        }
    }

    [PostgresFact]
    public async Task Database_history_is_immutable_and_reusable_equipment_cannot_be_consumed()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var id = await Seed(isolated.Context, "Reusable"); var actor = Guid.NewGuid(); var input = Input(1, "Receipt", 1);
        await using (var db = isolated.NewContext()) await Assert.ThrowsAsync<InventoryRuleException>(() => new MaterialStockService(db).Move(id, Input(1, "Consumption", 1), actor, default));
        await using (var db = isolated.NewContext()) await new MaterialStockService(db).Move(id, input, actor, default);
        await using (var db = isolated.NewContext())
        {
            var error = await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE material_movements SET \"Reason\"='alterado' WHERE \"Id\"={input.OperationId}"));
            Assert.Equal("55000", error.SqlState);
        }
        await using (var db = isolated.NewContext())
        {
            var error = await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM material_movements WHERE \"Id\"={input.OperationId}"));
            Assert.Equal("55000", error.SqlState);
        }
    }

    [Fact]
    public async Task Materials_require_individual_permissions_and_count_requires_supervision()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var path = $"/api/v1/materials/{Guid.NewGuid()}/movements";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), ["Student"], ["bar:stock:manage"]));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path, Input(1, "Receipt", 1))).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), ["Teacher"], ["inventory:read"]));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path, Input(1, "Receipt", 1))).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), ["Teacher"], ["inventory:write"]));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path, Input(1, "Receipt", 1))).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(Guid.NewGuid(), "inventory:read", "inventory:write"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path, Input(1, "Count", 0))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path, new { operationId = Guid.NewGuid(), expectedVersion = 1, kind = "Receipt", reason = "Teste", destination = "Limpeza" })).StatusCode);
    }

    [PostgresFact]
    public async Task History_is_paginated_and_new_movements_do_not_expand_the_legacy_json()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var id = await Seed(isolated.Context); var actor = Guid.NewGuid();
        for (var version = 1; version <= 55; version++)
        {
            await using var db = isolated.NewContext();
            await new MaterialStockService(db).Move(id, Input(version, "Receipt", 0.001m), actor, default);
        }
        await using var check = isolated.NewContext(); var service = new MaterialStockService(check);
        var first = await service.History(id, 1, default); var second = await service.History(id, 2, default);
        Assert.Equal(55, first.Total); Assert.Equal(50, first.Items.Count); Assert.Equal(5, second.Items.Count);
        Assert.Empty(first.Items.Select(x => x.Id).Intersect(second.Items.Select(x => x.Id)));
        var payload = JsonNode.Parse((await check.OperationalRecords.SingleAsync(x => x.Id == id)).Payload)!;
        Assert.Single(payload["movements"]!.AsArray()); Assert.Equal(2.555m, payload["quantity"]!.GetValue<decimal>());
    }

    [PostgresFact]
    public async Task Reused_context_refreshes_after_lock_and_preserves_pending_edits_and_current_replay()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var id = await Seed(isolated.Context); var actor = Guid.NewGuid();
        await using var cached = isolated.NewContext();
        var record = await cached.OperationalRecords.SingleAsync(x => x.Id == id);
        var first = Input(1, "Receipt", 1);
        await using (var writer = isolated.NewContext()) await new MaterialStockService(writer).Move(id, first, actor, default);
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => new MaterialStockService(cached).Move(id, Input(1, "Loss", 1), actor, default));
        var replay = await new MaterialStockService(cached).Move(id, first, actor, default);
        Assert.Equal(3.5m, JsonNode.Parse(replay.Payload)!["quantity"]!.GetValue<decimal>());
        Assert.Equal(3.5m, replay.Movement.After);
        record.Update("Edição pendente", record.Payload);
        await Assert.ThrowsAsync<InventoryRuleException>(() => new MaterialStockService(cached).Move(id, Input(2, "Receipt", 1), actor, default));
        Assert.Equal("Edição pendente", record.Name);
        await using var check = isolated.NewContext();
        Assert.Equal(1, await check.Set<MaterialMovement>().CountAsync());
        Assert.Equal("Material de teste", (await check.OperationalRecords.SingleAsync(x => x.Id == id)).Name);
    }

    [PostgresFact]
    public async Task Same_operation_in_parallel_applies_once_and_cross_material_reuse_is_rejected()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var id = await Seed(isolated.Context); var otherId = await Seed(isolated.Context); var actor = Guid.NewGuid();
        var input = Input(1, "Receipt", 0.125m);
        async Task<MaterialOperationResult> Attempt()
        {
            await using var db = isolated.NewContext();
            return await new MaterialStockService(db).Move(id, input, actor, default);
        }
        var results = await Task.WhenAll(Attempt(), Attempt());
        Assert.All(results, result => Assert.Equal(2.625m, result.Movement.After));
        await using var check = isolated.NewContext();
        Assert.Single(await check.Set<MaterialMovement>().ToListAsync());
        await Assert.ThrowsAsync<InventoryRuleException>(() => new MaterialStockService(check).Move(otherId, input, actor, default));
    }

    [PostgresFact]
    public async Task Ef_history_cannot_be_updated_or_deleted()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var id = await Seed(isolated.Context); var actor = Guid.NewGuid();
        await using (var writer = isolated.NewContext()) await new MaterialStockService(writer).Move(id, Input(1, "Receipt", 1), actor, default);
        await using (var editor = isolated.NewContext())
        {
            var movement = await editor.Set<MaterialMovement>().SingleAsync();
            editor.Entry(movement).Property(x => x.Reason).CurrentValue = "Tentativa de alteração";
            await Assert.ThrowsAsync<InventoryRuleException>(() => editor.SaveChangesAsync());
        }
        await using (var deleter = isolated.NewContext())
        {
            deleter.Remove(await deleter.Set<MaterialMovement>().SingleAsync());
            await Assert.ThrowsAsync<InventoryRuleException>(() => deleter.SaveChangesAsync());
        }
        await using var check = isolated.NewContext();
        Assert.Equal("Conferência de teste", (await check.Set<MaterialMovement>().SingleAsync()).Reason);
    }

    [PostgresFact]
    public async Task Upgrade_from_27_preserves_existing_json_balances_and_history_without_inventing_movements()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(previousVersion: true);
        var id = await Seed(isolated.Context);
        var unclassifiedId = await Seed(isolated.Context, "Unclassified");
        var original = await isolated.Context.OperationalRecords.AsNoTracking().OrderBy(x => x.Id).Select(x => x.Payload).ToArrayAsync();
        Assert.Equal(27, (await isolated.Context.Database.GetAppliedMigrationsAsync()).Count());
        await isolated.Context.Database.MigrateAsync();
        Assert.Contains("20261027135728_MaterialStockLedger", await isolated.Context.Database.GetAppliedMigrationsAsync());
        Assert.Empty(await isolated.Context.Set<MaterialMovement>().ToListAsync());
        Assert.Equal(original, await isolated.Context.OperationalRecords.AsNoTracking().OrderBy(x => x.Id).Select(x => x.Payload).ToArrayAsync());
        Assert.False(isolated.Context.Database.HasPendingModelChanges());
        await using var writer = isolated.NewContext();
        var result = await new MaterialStockService(writer).Move(id, Input(1, "Receipt", 0.5m), Guid.NewGuid(), default);
        Assert.Equal(2.5m, result.Movement.Before);
        Assert.Single(JsonNode.Parse(result.Payload)!["movements"]!.AsArray());
        await Assert.ThrowsAsync<InventoryRuleException>(() => new MaterialStockService(writer).Move(unclassifiedId, Input(1, "Consumption", 1), Guid.NewGuid(), default));
    }

    [PostgresFact]
    public async Task Http_reports_conflict_and_old_finance_claims_cannot_expand_operations_profile()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var id = await Seed(isolated.Context); var actor = Guid.NewGuid();
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(actor, "inventory:read", "inventory:write"));
        var staleMetadata = JsonNode.Parse((await isolated.Context.OperationalRecords.AsNoTracking().SingleAsync(x => x.Id == id)).Payload)!.AsObject();
        staleMetadata["name"] = "Formulário antigo";
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/v1/materials/{id}/movements", Input(1, "Receipt", 1))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/v1/operations/inventory/{id}", staleMetadata)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/v1/materials/{id}/movements", Input(1, "Receipt", 1))).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(actor, "inventory:read", "finance:read"));
        var materials = await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/inventory");
        var material = materials.EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
        Assert.False(material.GetProperty("costsVisible").GetBoolean());
        Assert.Equal(0m, material.GetProperty("unitCost").GetDecimal());
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/v1/materials/{id}/movements", Input(2, "Receipt", 1))).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), ["Manager"]));
        materials = await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/inventory");
        material = materials.EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
        Assert.True(material.GetProperty("costsVisible").GetBoolean()); Assert.Equal(9m, material.GetProperty("unitCost").GetDecimal());
    }

    [PostgresFact]
    public async Task Metadata_and_movement_share_the_same_lock_and_cannot_overwrite_each_other()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var id = await Seed(isolated.Context); var actor = Guid.NewGuid();
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(actor, "inventory:read", "inventory:write"));
        var payload = JsonNode.Parse((await isolated.Context.OperationalRecords.SingleAsync(x => x.Id == id)).Payload)!.AsObject();
        payload["name"] = "Metadados atualizados";
        await using var movementWriter = isolated.NewContext();
        var put = client.PutAsJsonAsync($"/api/v1/operations/inventory/{id}", payload);
        var move = Task.Run(async () =>
        {
            try { await new MaterialStockService(movementWriter).Move(id, Input(1, "Receipt", 1), actor, default); return true; }
            catch (DbUpdateConcurrencyException) { return false; }
        });
        var response = await put; var moved = await move;
        Assert.True(moved ? response.StatusCode == HttpStatusCode.Conflict : response.StatusCode == HttpStatusCode.OK);
        await using var reader = isolated.NewContext();
        var saved = JsonNode.Parse((await reader.OperationalRecords.SingleAsync(x => x.Id == id)).Payload)!;
        Assert.Equal(2, saved["version"]!.GetValue<int>());
        Assert.Equal(moved ? 3.5m : 2.5m, saved["quantity"]!.GetValue<decimal>());
        Assert.Equal(moved ? "Material de teste" : "Metadados atualizados", saved["name"]!.GetValue<string>());
        Assert.Equal(moved ? 1 : 0, await reader.Set<MaterialMovement>().CountAsync());
    }

    [PostgresFact]
    public async Task Missing_legacy_unit_is_completed_explicitly_only_once_without_balance_or_any_history()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var actor = Guid.NewGuid();
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(actor, ["Manager"]));
        foreach (var (quantity, legacyHistory, allowed) in new[] { (0m, false, true), (1m, false, false), (0m, true, false) })
        {
            var id = await Seed(isolated.Context);
            var record = await isolated.Context.OperationalRecords.SingleAsync(x => x.Id == id);
            var legacy = JsonNode.Parse(record.Payload)!.AsObject();
            legacy.Remove("unit"); legacy["quantity"] = quantity;
            if (!legacyHistory) legacy["movements"] = new JsonArray();
            record.Update(record.Name, legacy.ToJsonString()); await isolated.Context.SaveChangesAsync();
            // Reading the old row must not invent a unit.
            var listed = await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/inventory");
            Assert.False(listed.EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id).TryGetProperty("unit", out _));
            var input = legacy.DeepClone().AsObject(); input["unit"] = "litro";
            var response = await client.PutAsJsonAsync($"/api/v1/operations/inventory/{id}", input);
            Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.BadRequest, response.StatusCode);
            await using var reader = isolated.NewContext();
            var saved = JsonNode.Parse((await reader.OperationalRecords.SingleAsync(x => x.Id == id)).Payload)!.AsObject();
            Assert.Equal(quantity, saved["quantity"]!.GetValue<decimal>());
            Assert.Equal(legacyHistory ? 1 : 0, saved["movements"]!.AsArray().Count);
            Assert.Equal(9m, saved["unitCost"]!.GetValue<decimal>());
            if (!allowed) { Assert.False(saved.ContainsKey("unit")); continue; }
            Assert.Equal("litro", saved["unit"]!.GetValue<string>());
            Assert.Equal(2, saved["version"]!.GetValue<int>());
            input = saved.DeepClone().AsObject(); input["unit"] = "caixa";
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/inventory/{id}", input)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/v1/materials/{id}/movements", Input(2, "Receipt", 1))).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/v1/materials/{id}/movements", Input(3, "Count", 0))).StatusCode);
            // Simulate a unit erased outside the protected flow after legitimate receipts.
            await using (var outside = isolated.NewContext())
            {
                var used = await outside.OperationalRecords.SingleAsync(x => x.Id == id);
                var erased = JsonNode.Parse(used.Payload)!.AsObject(); erased.Remove("unit");
                used.Update(used.Name, erased.ToJsonString()); await outside.SaveChangesAsync();
                input = erased.DeepClone().AsObject(); input["unit"] = "litro";
            }
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/inventory/{id}", input)).StatusCode);
            await using var check = isolated.NewContext();
            Assert.Equal(2, await check.Set<MaterialMovement>().CountAsync(x => x.MaterialId == id));
            Assert.False(JsonNode.Parse((await check.OperationalRecords.SingleAsync(x => x.Id == id)).Payload)!.AsObject().ContainsKey("unit"));
        }
    }

    private static MaterialMovementInput Input(int version, string kind, decimal quantity) => new(Guid.NewGuid(), version, kind, quantity, "Conferência de teste", "Equipe de limpeza");
    private static async Task<Guid> Seed(LongBeachDbContext db, string nature = "Consumable")
    {
        var id = Guid.NewGuid();
        var payload = JsonSerializer.Serialize(new { id, version = 1, name = "Material de teste", nature, category = "Limpeza", unit = "litro", quantity = 2.5m, minimum = 1m, location = "Depósito", unitCost = 9m, paymentMethod = "Pix", notes = "", movements = new[] { new { id = "old", kind = "Entrada", quantity = 2.5m, occurredAt = "2026-10-01" } } });
        db.Add(new OperationalRecord(id, "inventory", "Material de teste", payload)); await db.SaveChangesAsync(); return id;
    }
    private static Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> Factory(IsolatedMaterialDatabase isolated) =>
        new LongBeachWebApplicationFactory().WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
        { ["ConnectionStrings:LongBeach"] = isolated.Connection, ["BackgroundJobs:Enabled"] = "false" }))
        .ConfigureServices(s => s.AddDbContext<LongBeachDbContext>(o => o.UseNpgsql(isolated.Connection))));
    private static string Token(Guid actor, params string[] permissions) =>
        ProfileAuthorizationTests.Token(actor, ["Operations"], permissions);
}
