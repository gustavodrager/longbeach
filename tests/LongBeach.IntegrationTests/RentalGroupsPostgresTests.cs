using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Operations;
using LongBeach.Domain.Auditing;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LongBeach.IntegrationTests.OperationalPostgresTests;
namespace LongBeach.IntegrationTests;

public sealed class RentalGroupsPostgresTests
{
    private static async Task<JsonObject> Setup(HttpClient client, string policy = "Incluído", decimal? amount = 400)
    {
        var court = Guid.NewGuid(); var group = Guid.NewGuid(); var member = Guid.NewGuid();
        var savedCourt = await client.PutAsJsonAsync($"/api/v1/operations/courts/{court}", new { id = court, name = "Quadra mensalistas teste", status = "Disponível", openingTime = "06:00", closingTime = "24:00", operatingDays = new[] { 1, 2, 3, 4, 5 } });
        Assert.Equal(HttpStatusCode.Created, savedCourt.StatusCode);
        var body = JsonSerializer.SerializeToNode(new { id = group, name = "Turma mensalista teste", courtId = court, weekDay = 5, startTime = "22:00", endTime = "24:00", startDate = "2026-10-01", endDate = "", status = "Ativo", capacity = 12, organizerId = member, backupId = "", members = new[] { new { id = member, name = "Integrante de teste", phone = "", status = "Ativo" } }, monthlyAmount = amount, extraAmount = (decimal?)100, fifthPolicy = policy, dueDay = 31, sport = "Futevôlei", notes = "" })!.AsObject();
        var response = await client.PutAsJsonAsync($"/api/v1/operations/rentalGroups/{group}", body); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    }
    private static string GroupPath(JsonObject group) => $"/api/v1/rentals/groups/{group["id"]}";
    [PostgresFact]
    public async Task Five_Fridays_midnight_month_generates_once_and_replay_preserves_changes_and_single_charge()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Owner"); var group = await Setup(client, "Extra"); var path = GroupPath(group);
        var preview = await Read(await client.GetAsync(path + "/months/2026-10/preview")); Assert.Equal(5, preview.GetProperty("dates").GetArrayLength()); Assert.Equal(500, preview.GetProperty("amount").GetDecimal()); Assert.Empty(preview.GetProperty("errors").EnumerateArray());
        var request = new { month = "2026-10", groupVersion = 1, createCharge = true };
        var attempts = await Task.WhenAll(client.PostAsJsonAsync(path + "/months", request), client.PostAsJsonAsync(path + "/months", request)); Assert.All(attempts, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var cycle = await Read(attempts[0]); var cycleId = cycle.GetProperty("id").GetGuid();
        var reservations = (await Read(await client.GetAsync("/api/v1/operations/reservations"))).EnumerateArray().Where(r => RentalGroupRules.Id(r, "rentalGroupId") == Guid.Parse(group["id"]!.ToString())).ToArray(); Assert.Equal(5, reservations.Length); Assert.All(reservations, r => { Assert.Equal(0, r.GetProperty("amount").GetDecimal()); Assert.Equal("24:00", r.GetProperty("endTime").GetString()); });
        var edit = JsonNode.Parse(reservations[0].GetRawText())!.AsObject(); edit["status"] = "Cancelada"; var reservationPath = $"/api/v1/operations/reservations/{edit["id"]}";
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(reservationPath, edit)).StatusCode);
        edit["rentalGroupId"] = Guid.NewGuid().ToString(); Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(reservationPath, edit)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(path + "/months", request)).StatusCode);
        var entries = (await Read(await client.GetAsync("/api/v1/operations/financeEntries"))).EnumerateArray().Where(e => RentalGroupRules.Id(e, "sourceId") == cycleId).ToArray(); var charge = Assert.Single(entries); Assert.Equal(500, charge.GetProperty("amount").GetDecimal()); Assert.Equal("Pendente", charge.GetProperty("status").GetString());
        var duplicate = JsonNode.Parse(charge.GetRawText())!.AsObject(); duplicate["id"] = Guid.NewGuid().ToString(); duplicate["version"] = 0; Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/financeEntries/{duplicate["id"]}", duplicate)).StatusCode);
        var unlink = JsonNode.Parse(charge.GetRawText())!.AsObject(); unlink.Remove("sourceId"); Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/financeEntries/{unlink["id"]}", unlink)).StatusCode);
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>(); Assert.True(await db.Set<AuditLog>().AnyAsync(a => a.ResourceId == cycleId.ToString()));
        Assert.Equal("Cancelada", JsonDocument.Parse((await db.OperationalRecords.SingleAsync(r => r.Id == Guid.Parse(edit["id"]!.ToString()))).Payload).RootElement.GetProperty("status").GetString());
    }
    [PostgresFact]
    public async Task Later_conflict_blocks_entire_month_and_fifth_policy_requires_confirmation()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Owner"); var group = await Setup(client, "A confirmar"); var path = GroupPath(group);
        var id = Guid.NewGuid(); Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/reservations/{id}", new { id, name = "Horário já ocupado", courtId = group["courtId"]!.ToString(), date = "2026-10-30", startTime = "23:00", endTime = "24:00", amount = 0, status = "Confirmada" })).StatusCode);
        var preview = await Read(await client.GetAsync(path + "/months/2026-10/preview")); Assert.Contains(preview.GetProperty("warnings").EnumerateArray(), e => e.GetString()!.Contains("Quinto")); Assert.Contains(preview.GetProperty("errors").EnumerateArray(), e => e.GetString()!.Contains("2026-10-30"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path + "/months", new { month = "2026-10", groupVersion = 1, createCharge = true })).StatusCode);
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>(); var groupId = Guid.Parse(group["id"]!.ToString()); Assert.False(await db.OperationalRecords.AnyAsync(r => r.Id == RentalGroupRules.StableId("month", groupId, "2026-10"))); Assert.False(await db.OperationalRecords.AnyAsync(r => r.Id == RentalGroupRules.StableId("reservation", groupId, "2026-10-02")));
    }
    [PostgresFact]
    public async Task Permissions_hide_price_preserve_unknown_and_forbid_student_or_staff_billing_and_forged_cycles()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Owner"); var group = await Setup(client, amount: null); var path = GroupPath(group);
        client.DefaultRequestHeaders.Authorization = Header(null, "projects:read", "projects:write");
        var hidden = (await Read(await client.GetAsync("/api/v1/operations/rentalGroups"))).EnumerateArray().Single(r => RentalGroupRules.Id(r) == Guid.Parse(group["id"]!.ToString())); Assert.Equal(JsonValueKind.Null, hidden.GetProperty("monthlyAmount").ValueKind);
        var edit = JsonNode.Parse(hidden.GetRawText())!.AsObject(); edit["name"] = "Nome corrigido"; Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/operations/rentalGroups/{group["id"]}", edit)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path + "/months", new { month = "2026-11", groupVersion = 2, createCharge = true })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(path + "/months", new { month = "2026-11", groupVersion = 2, createCharge = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path + "/bar?month=2026-11")).StatusCode);
        var cycleId = Guid.NewGuid(); Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/rentalMonths/{cycleId}", new { id = cycleId, name = "Ciclo forjado" })).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Owner"); var saved = (await Read(await client.GetAsync("/api/v1/operations/rentalGroups"))).EnumerateArray().Single(r => RentalGroupRules.Id(r) == Guid.Parse(group["id"]!.ToString())); Assert.Equal(JsonValueKind.Null, saved.GetProperty("monthlyAmount").ValueKind);
        client.DefaultRequestHeaders.Authorization = Header("Student"); Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path + "/months/2026-11/preview")).StatusCode);
    }
    [PostgresFact]
    public async Task Roster_history_stale_edits_and_attendance_are_validated()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Owner"); var group = await Setup(client); var id = group["id"]!.ToString();
        var edit = group.DeepClone().AsObject(); edit["members"] = new JsonArray(); Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/rentalGroups/{id}", edit)).StatusCode);
        edit = group.DeepClone().AsObject(); edit["version"] = 0; edit["name"] = "Alterado sem versão"; Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/v1/operations/rentalGroups/{id}", edit)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(GroupPath(group) + "/months", new { month = "2026-11", groupVersion = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(GroupPath(group) + "/months", new { month = "2026-10", groupVersion = 1 })).StatusCode);
        var first = RentalGroupRules.StableId("reservation", Guid.Parse(id), "2026-10-02"); var presenceId = Guid.NewGuid(); var body = new { id = presenceId, name = "Presença mensalista", rentalGroupId = id, reservationId = first, memberId = group["organizerId"]!.ToString(), status = "Presente" };
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/rentalAttendances/{presenceId}", body)).StatusCode);
        var duplicate = Guid.NewGuid(); Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/rentalAttendances/{duplicate}", body with { id = duplicate })).StatusCode);
        var invalid = Guid.NewGuid(); Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/rentalAttendances/{invalid}", body with { id = invalid, memberId = Guid.NewGuid().ToString() })).StatusCode);
        var futureMonth = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(2).ToString("yyyy-MM");
        var futureResponse = await client.PostAsJsonAsync(GroupPath(group) + "/months", new { month = futureMonth, groupVersion = 1 }); Assert.Equal(HttpStatusCode.OK, futureResponse.StatusCode);
        var futureDate = (await Read(futureResponse)).GetProperty("dates")[0].GetString()!;
        var futureId = Guid.NewGuid(); var futureReservation = RentalGroupRules.StableId("reservation", Guid.Parse(id), futureDate);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/rentalAttendances/{futureId}", body with { id = futureId, reservationId = futureReservation })).StatusCode);
    }
    [PostgresFact]
    public async Task Bar_links_are_unique_and_totals_follow_real_consumption_payments_and_refunds()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Owner"); var group = await Setup(client); var path = GroupPath(group); await client.PostAsJsonAsync(path + "/months", new { month = "2026-10", groupVersion = 1 });
        var tabId = Guid.Empty;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>(); var location = new StockLocation("Local teste " + Guid.NewGuid()); var tab = new BarTab(location.Id, Guid.NewGuid(), "Comanda teste", "Tab"); tabId = tab.Id;
            var payment = new BarTabPayment(tab.Id, Guid.NewGuid(), "test-only", 40, "CardManual", null, null, null, null); payment.ConfirmManual(DateTimeOffset.UtcNow); payment.Refund(10);
            var category = new BarProductCategory("Categoria teste " + Guid.NewGuid());
            var product = new BarProduct(Guid.NewGuid().ToString(), "Produto teste", "Produto", category.Id, "un", "un", 1, 25, 10, 0, false, false, 0);
            var item = new BarTabItem(tab.Id, product, 2, null, false); item.Accept(DateTimeOffset.UtcNow); item.Fulfill(DateTimeOffset.UtcNow); tab.Adjust(5);
            var rejected = new BarTabItem(tab.Id, product, 1, null, false); rejected.Reject("Não consumido");
            db.AddRange(location, category, product, tab, item, rejected, payment); await db.SaveChangesAsync();
        }
        var reservation = RentalGroupRules.StableId("reservation", Guid.Parse(group["id"]!.ToString()), "2026-10-02"); var body = new { reservationId = reservation, memberId = group["organizerId"]!.ToString() };
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync(path + $"/bar/{tabId}", body)).StatusCode); Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync(path + $"/bar/{tabId}", body)).StatusCode);
        var report = await Read(await client.GetAsync(path + "/bar?month=2026-10")); var tabRow = Assert.Single(report.EnumerateArray()); Assert.Equal(30, tabRow.GetProperty("paid").GetDecimal()); Assert.Equal(45, tabRow.GetProperty("total").GetDecimal()); Assert.Equal(15, tabRow.GetProperty("due").GetDecimal()); Assert.Equal(tabId, tabRow.GetProperty("tabId").GetGuid());
        var other = await Setup(client); await client.PostAsJsonAsync(GroupPath(other) + "/months", new { month = "2026-10", groupVersion = 1 }); var otherReservation = RentalGroupRules.StableId("reservation", Guid.Parse(other["id"]!.ToString()), "2026-10-02");
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(GroupPath(other) + $"/bar/{tabId}", new { reservationId = otherReservation })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync(path + $"/bar/{tabId}?version=0")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(path + $"/bar/{tabId}?version=1")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(path + $"/bar/{tabId}?version=1")).StatusCode);
        Assert.Empty((await Read(await client.GetAsync(path + "/bar?month=2026-10"))).EnumerateArray());
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync(GroupPath(other) + $"/bar/{tabId}", new { reservationId = otherReservation })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync(path + $"/bar/{tabId}?version=1")).StatusCode);
    }
}
