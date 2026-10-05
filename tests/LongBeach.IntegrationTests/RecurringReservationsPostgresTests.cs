using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Operations;
using LongBeach.Contracts.Operations;
using LongBeach.Domain.Auditing;
using LongBeach.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LongBeach.IntegrationTests.OperationalPostgresTests;

namespace LongBeach.IntegrationTests;

public sealed class RecurringReservationsPostgresTests
{
    private const string Path = "/api/v1/operations/reservations/recurring";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static string Today => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3)).ToString("yyyy-MM-dd");
    private static RecurringReservationInput Request(Guid court, decimal amount = 80) => new(Guid.NewGuid(), "Grupo de teste", court, Today, "18:00", "19:00", 3, "Visitante de teste", "", amount, "");
    private static async Task<Guid> Court(HttpClient client)
    {
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/courts/{id}", new { id, name = "Quadra de grupo", status = "Disponível", openingTime = "06:00", closingTime = "23:00" })).StatusCode);
        return id;
    }
    [PostgresFact]
    public async Task Conflict_in_a_later_week_leaves_no_occurrence_operation_or_audit()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Owner");
        var court = await Court(client); var input = Request(court); var blockerId = Guid.NewGuid();
        var blockedDate = DateOnly.ParseExact(input.StartDate, "yyyy-MM-dd").AddDays(7).ToString("yyyy-MM-dd");
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/reservations/{blockerId}", new { id = blockerId, name = "Reserva anterior", courtId = court, date = blockedDate, startTime = "18:00", endTime = "19:00", status = "Confirmada", amount = 10 })).StatusCode);
        var failure = await client.PostAsJsonAsync(Path, input); Assert.Equal(HttpStatusCode.BadRequest, failure.StatusCode);
        Assert.Contains("Semana 2", await failure.Content.ReadAsStringAsync());
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var ids = Enumerable.Range(1, input.Weeks).Select(index => RecurringReservationBatch.OccurrenceId(input.OperationId, index)).Append(input.OperationId).ToArray();
        Assert.False(await db.OperationalRecords.AnyAsync(row => ids.Contains(row.Id)));
        var resourceIds = ids.Select(id => id.ToString()).ToArray(); Assert.False(await db.Set<AuditLog>().AnyAsync(row => resourceIds.Contains(row.ResourceId!)));
    }
    [PostgresFact]
    public async Task Replay_preserves_individual_versions_and_financial_access_with_original_billing_sources()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Owner");
        var input = Request(await Court(client)); var created = await client.PostAsJsonAsync(Path, input); Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var group = JsonSerializer.Deserialize<RecurringReservationResponse>((await Read(created)).GetRawText(), JsonOptions)!;
        Assert.Equal(3, group.Reservations.Count); Assert.All(group.Reservations, row => Assert.Equal(80, row.Amount));
        var first = JsonSerializer.SerializeToNode(group.Reservations[0], JsonOptions)!.AsObject(); first["status"] = "Cancelada";
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/operations/reservations/{group.Reservations[0].Id}", first)).StatusCode);
        var replay = await client.PostAsJsonAsync(Path, input); Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        var current = (await Read(replay)).GetProperty("reservations"); Assert.Equal(2, current[0].GetProperty("version").GetInt32()); Assert.Equal("Cancelada", current[0].GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(Path, input with { GroupTitle = "Outra intenção" })).StatusCode);

        var financeId = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/financeEntries/{financeId}", new { id = financeId, name = "Locação da segunda semana", direction = "Receber", origin = "Locações", amount = 80, dueDate = group.Reservations[1].Date, status = "Pendente", sourceId = group.Reservations[1].Id, sourceKind = "reservations" })).StatusCode);

        client.DefaultRequestHeaders.Authorization = Header(null, "projects:read", "projects:write");
        var redacted = await client.PostAsJsonAsync(Path, input); Assert.Equal(HttpStatusCode.OK, redacted.StatusCode);
        var hiddenRows = (await Read(redacted)).GetProperty("reservations");
        Assert.All(hiddenRows.EnumerateArray(), row => { Assert.False(row.GetProperty("costsVisible").GetBoolean()); Assert.Equal(0, row.GetProperty("amount").GetDecimal()); });
        var staffEdit = JsonNode.Parse(hiddenRows[0].GetRawText())!.AsObject(); staffEdit["name"] = "Cliente corrigido";
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/operations/reservations/{group.Reservations[0].Id}", staffEdit)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Path, input with { OperationId = Guid.NewGuid() })).StatusCode);

        client.DefaultRequestHeaders.Authorization = Header("Owner");
        var visible = (await Read(await client.PostAsJsonAsync(Path, input))).GetProperty("reservations");
        Assert.Equal(80, visible[0].GetProperty("amount").GetDecimal()); Assert.Equal(3, visible[0].GetProperty("version").GetInt32());
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var ids = group.Reservations.Select(item => item.Id).ToArray();
        Assert.Equal(3, await db.OperationalRecords.CountAsync(row => row.Kind == "reservations" && ids.Contains(row.Id)));
        using var billedSource = JsonDocument.Parse((await db.OperationalRecords.SingleAsync(row => row.Id == financeId)).Payload);
        Assert.Equal(group.Reservations[1].Id.ToString(), billedSource.RootElement.GetProperty("sourceId").GetString());
    }
    [PostgresFact]
    public async Task Competing_groups_commit_only_one_complete_schedule_and_identical_retries_do_not_duplicate()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Owner");
        var input = Request(await Court(client), 0); var other = input with { OperationId = Guid.NewGuid(), GroupTitle = "Outro grupo" };
        var attempts = await Task.WhenAll(client.PostAsJsonAsync(Path, input), client.PostAsJsonAsync(Path, other));
        Assert.Single(attempts, response => response.StatusCode == HttpStatusCode.Created); Assert.Single(attempts, response => response.StatusCode == HttpStatusCode.BadRequest);
        var winner = attempts[0].StatusCode == HttpStatusCode.Created ? input : other;
        var replays = await Task.WhenAll(client.PostAsJsonAsync(Path, winner), client.PostAsJsonAsync(Path, winner));
        Assert.All(replays, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        var ids = Enumerable.Range(1, winner.Weeks).Select(index => RecurringReservationBatch.OccurrenceId(winner.OperationId, index)).ToArray();
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        Assert.Equal(3, await db.OperationalRecords.CountAsync(row => ids.Contains(row.Id)));
        Assert.Equal(1, await db.OperationalRecords.CountAsync(row => row.Id == winner.OperationId));
        var resourceIds = ids.Append(winner.OperationId).Select(id => id.ToString()).ToArray(); Assert.Equal(4, await db.Set<AuditLog>().CountAsync(row => resourceIds.Contains(row.ResourceId!)));
    }
}
