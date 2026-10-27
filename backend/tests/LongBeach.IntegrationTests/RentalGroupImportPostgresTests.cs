using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LongBeach.IntegrationTests.OperationalPostgresTests;
namespace LongBeach.IntegrationTests;
public sealed class RentalGroupImportPostgresTests
{
    [PostgresFact]
    public async Task Import_reconciles_pending_roster_and_replays_without_duplicate_bookings_or_money()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory);
        client.DefaultRequestHeaders.Authorization = Header("Owner"); var court = Guid.NewGuid(); var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/courts/{court}", new { id = court, name = "Quadra importação mensalistas", status = "Disponível", openingTime = "06:00", closingTime = "24:00" })).StatusCode);
        var body = new { id, name = $"Mensalista importado {id}", courtId = court, weekDay = 5, startTime = "20:00", endTime = "22:00", startDate = "2026-10-01", endDate = "", status = "Ativo", capacity = (int?)null, dueDay = (int?)null, members = Array.Empty<object>(), organizerId = "", backupId = "", sport = "", monthlyAmount = 500, extraAmount = (decimal?)null, fifthPolicy = "A confirmar", notes = "" };
        async Task<Guid> Stage(object payload) => (await Read(await client.PostAsJsonAsync("/api/v1/imports", new { sourceName = $"mensalistas-{Guid.NewGuid()}.json", sourceSha256 = new string('b', 64), records = new[] { new { sheetName = "Confirmação", rowNumber = 1, recordType = "reference-data", externalId = "grupo-1", data = new { schema = "longbeach.rental-groups.v1", kind = "rentalGroups", body = payload } } } }))).GetProperty("id").GetGuid();
        var batch = await Stage(body); var path = $"/api/v1/imports/{batch}/rental-groups";
        client.DefaultRequestHeaders.Authorization = Header(null, "projects:read", "projects:write");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path + "/apply", new { confirmationToken = "x" })).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Owner");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/v1/imports/{batch}/class-grade")).StatusCode);
        var preview = await Read(await client.GetAsync(path)); Assert.True(preview.GetProperty("canApply").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path + "/apply", new { confirmationToken = "stale" })).StatusCode);
        var input = new { confirmationToken = preview.GetProperty("confirmationToken").GetString() };
        var results = await Task.WhenAll(client.PostAsJsonAsync(path + "/apply", input), client.PostAsJsonAsync(path + "/apply", input));
        Assert.All(results, result => Assert.Equal(HttpStatusCode.OK, result.StatusCode));
        var saved = (await Read(await client.GetAsync("/api/v1/operations/rentalGroups"))).EnumerateArray().Single(row => row.GetProperty("id").GetGuid() == id);
        Assert.Empty(saved.GetProperty("members").EnumerateArray()); Assert.Equal(JsonValueKind.Null, saved.GetProperty("dueDay").ValueKind);
        Assert.Equal(batch, saved.GetProperty("importSource").GetProperty("batchId").GetGuid());
        var duplicate = await Stage(body with { id = Guid.NewGuid() });
        Assert.False((await Read(await client.GetAsync($"/api/v1/imports/{duplicate}/rental-groups"))).GetProperty("canApply").GetBoolean());
        var rentalPath = $"/api/v1/rentals/groups/{id}/months";
        var month = await Read(await client.GetAsync(rentalPath + "/2026-10/preview"));
        Assert.Empty(month.GetProperty("errors").EnumerateArray()); Assert.Equal(5, month.GetProperty("dates").GetArrayLength());
        Assert.Equal(JsonValueKind.Null, month.GetProperty("amount").ValueKind); Assert.Equal("", month.GetProperty("dueDate").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(rentalPath, new { month = "2026-10", groupVersion = 1, createCharge = true })).StatusCode);
        // Four meetings have a known amount, but an unknown due day must still block billing.
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(rentalPath, new { month = "2026-11", groupVersion = 1, createCharge = true })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(rentalPath, new { month = "2026-10", groupVersion = 1, createCharge = false })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(path + "/apply", input)).StatusCode);
        var meetings = (await Read(await client.GetAsync("/api/v1/operations/reservations"))).EnumerateArray().Where(row => row.TryGetProperty("rentalGroupId", out var g) && g.GetGuid() == id).ToArray();
        Assert.Equal(5, meetings.Length); Assert.All(meetings, row => Assert.Equal(body.name, row.GetProperty("customerName").GetString()));
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        Assert.Equal(1, await db.AuditLogs.CountAsync(row => row.Action == "RentalGroupsImported" && row.ResourceId == batch.ToString()));
        Assert.DoesNotContain(await db.OperationalRecords.Where(row => row.Kind == "financeEntries").Select(row => row.Payload).ToListAsync(), payload => payload.Contains(id.ToString()));
        // Edits survive import retries and existing roster cannot be deleted.
        var edit = JsonNode.Parse(saved.GetRawText())!.AsObject(); edit["notes"] = "Acordo atualizado";
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/operations/rentalGroups/{id}", edit)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(path + "/apply", input)).StatusCode);
        var rowAfter = await db.OperationalRecords.AsNoTracking().SingleAsync(row => row.Id == id);
        Assert.Contains("Acordo atualizado", rowAfter.Payload);
    }
}
