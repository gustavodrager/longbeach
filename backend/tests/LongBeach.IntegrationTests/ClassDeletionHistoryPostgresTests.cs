using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Operations;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class ClassDeletionHistoryPostgresTests
{
    private static DateOnly Today => ClassDeletionRules.LocalDate(DateTimeOffset.UtcNow);
    private static WebApplicationFactory<Program> Factory(IsolatedMaterialDatabase isolated) =>
        new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:LongBeach"] = isolated.Connection,
                ["BackgroundJobs:Enabled"] = "false"
            }))
            .ConfigureServices(services =>
            {
                services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(isolated.Connection));
                services.AddScoped<IUserRepository>(provider => new TestSessionUserRepository(new UserRepository(provider.GetRequiredService<LongBeachDbContext>())));
            }));

    private static HttpClient Client(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        return client;
    }

    private static async Task<JsonObject> CreateClass(HttpClient client)
    {
        var courtId = Guid.NewGuid(); var teacherId = Guid.NewGuid(); var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/courts/{courtId}",
            new { id = courtId, name = "Quadra exclusão teste", status = "Disponível", openingTime = "06:00", closingTime = "24:00", scheduleConfirmed = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/team/{teacherId}",
            new { id = teacherId, name = "Professor exclusão teste", payAmount = (decimal?)null })).StatusCode);
        var response = await client.PutAsJsonAsync($"/api/v1/operations/classes/{id}", new
        {
            id, name = "Turma exclusiva de teste", courtId, teacherId, weekDay = (int)Today.DayOfWeek,
            startTime = "18:00", endTime = "19:00", capacity = 6, studentIds = Array.Empty<Guid>(), status = "Ativa"
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    }

    private static Guid Id(JsonObject body) => Guid.Parse(body["id"]!.GetValue<string>());
    private static string Path(Guid id) => $"/api/v1/operations/classes/{id}";
    private static async Task<JsonObject> Delete(HttpClient client, Guid id, int version = 1)
    {
        var response = await client.DeleteAsync(Path(id) + $"?version={version}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    }
    private static async Task<bool> Scheduled(HttpClient client, Guid id, DateOnly day, bool range = false)
    {
        var url = range ? $"/api/v1/operations/courts/schedule-range?from={day:yyyy-MM-dd}&to={day.AddDays(6):yyyy-MM-dd}" : $"/api/v1/operations/courts/schedule?date={day:yyyy-MM-dd}";
        var result = await client.GetFromJsonAsync<JsonElement>(url);
        JsonElement[] days = range ? result.GetProperty("days").EnumerateArray().ToArray() : [result];
        return days.SelectMany(date => date.GetProperty("courts").EnumerateArray())
            .SelectMany(court => court.GetProperty("blocks").EnumerateArray())
            .Any(block => block.GetProperty("sourceId").GetGuid() == id);
    }
    private static async Task<JsonObject> AddRecord(WebApplicationFactory<Program> factory, Guid id, string kind, JsonObject body)
    {
        body["id"] = id.ToString(); body["name"] ??= "Histórico preservado";
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        db.Add(new OperationalRecord(id, kind, body["name"]!.GetValue<string>(), body.ToJsonString()));
        await db.SaveChangesAsync();
        return body;
    }
    private static async Task<JsonObject> Saved(WebApplicationFactory<Program> factory, Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return JsonNode.Parse((await scope.ServiceProvider.GetRequiredService<LongBeachDbContext>().OperationalRecords.AsNoTracking().SingleAsync(row => row.Id == id)).Payload)!.AsObject();
    }

    [PostgresTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Deletion_hides_class_preserves_past_schedule_and_audits_once_on_replay(bool legacyVersionZero)
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = Client(factory);
        var lesson = await CreateClass(client); var id = Id(lesson);
        // Seed an existing class: newly created classes now start today and have no past schedule.
        lesson["startDate"] = Today.AddDays(-14).ToString("yyyy-MM-dd");
        if (legacyVersionZero) lesson.Remove("version");
        {
            await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            (await db.OperationalRecords.SingleAsync(row => row.Id == id)).Update(lesson["name"]!.GetValue<string>(), lesson.ToJsonString());
            await db.SaveChangesAsync();
        }
        Assert.True(await Scheduled(client, id, Today.AddDays(7)));
        var first = await Delete(client, id, legacyVersionZero ? 0 : 1);
        var archived = first["class"]!.AsObject();
        Assert.Equal("Encerrada", archived["status"]!.GetValue<string>());
        Assert.Equal("Ativa", archived["deletedPreviousStatus"]!.GetValue<string>());
        Assert.NotNull(archived["deletedAt"]); Assert.NotNull(archived["deletedBy"]);
        Assert.False(await Scheduled(client, id, Today.AddDays(7)));
        Assert.False(await Scheduled(client, id, Today.AddDays(7), range: true));
        Assert.True(await Scheduled(client, id, Today.AddDays(-7)));
        Assert.True(await Scheduled(client, id, Today.AddDays(-7), range: true));
        var directory = await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/classes");
        Assert.DoesNotContain(directory.EnumerateArray(), row => row.GetProperty("id").GetGuid() == id);
        var history = await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/classes?includeDeleted=true");
        Assert.Contains(history.EnumerateArray(), row => row.GetProperty("id").GetGuid() == id && row.TryGetProperty("deletedAt", out _));
        Assert.True(JsonNode.DeepEquals(first, await Delete(client, id, legacyVersionZero ? 0 : 1)));
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(Path(id), lesson)).StatusCode);
        lesson["version"] = 0;
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(Path(id), lesson)).StatusCode);
        var newId = Guid.NewGuid(); lesson["id"] = newId.ToString();
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync(Path(newId), lesson)).StatusCode);
        await using var auditScope = factory.Services.CreateAsyncScope(); var auditDb = auditScope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var audit = Assert.Single(await auditDb.AuditLogs.Where(row => row.ResourceId == id.ToString() && row.Action == "ClassSoftDeleted").ToListAsync());
        Assert.Equal(archived["deletedBy"]!.GetValue<string>(), audit.ActorUserId?.ToString());
        Assert.Equal(nameof(OperationalRecord), audit.Resource);
        Assert.Contains("classes", audit.MetadataJson); Assert.DoesNotContain("Turma exclusiva", audit.MetadataJson);
        Assert.True(await auditDb.OperationalRecords.AnyAsync(row => row.Id == id));
        Assert.False(await auditDb.AuditLogs.AnyAsync(row => row.ResourceId == id.ToString() && row.Action == "Deleted"));
    }

    [PostgresFact]
    public async Task Newly_created_class_starts_today_without_retroactive_schedule()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = Client(factory);
        var lesson = await CreateClass(client); var id = Id(lesson);
        Assert.Equal(Today.ToString("yyyy-MM-dd"), lesson["startDate"]!.GetValue<string>());
        Assert.False(await Scheduled(client, id, Today.AddDays(-7)));
        Assert.False(await Scheduled(client, id, Today.AddDays(-7), range: true));
        Assert.True(await Scheduled(client, id, Today));
        Assert.True(await Scheduled(client, id, Today.AddDays(7)));
    }

    [PostgresFact]
    public async Task Stale_version_preserves_class_without_a_deletion_event()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = Client(factory);
        var lesson = await CreateClass(client); var id = Id(lesson); lesson["name"] = "Turma corrigida";
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(Path(id), lesson)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync(Path(id) + "?version=1")).StatusCode);
        Assert.True(await Scheduled(client, id, Today.AddDays(7)));
        Assert.Null((await Saved(factory, id))["deletedAt"]);
        await Delete(client, id, 2);
    }

    [PostgresTheory]
    [InlineData("enrollments", "classId", "Encerrada")]
    [InlineData("presences", "classId", "Ausente")]
    [InlineData("reservations", "classId", "Cancelada")]
    [InlineData("financeEntries", "sourceId", "Cancelado")]
    [InlineData("portalRequests", "classId", "Closed")]
    public async Task Every_linked_historical_record_is_preserved_unchanged(string kind, string field, string status)
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = Client(factory);
        var lesson = await CreateClass(client); var id = Id(lesson); var linked = Guid.NewGuid();
        var body = await AddRecord(factory, linked, kind, new JsonObject { [field] = id.ToString("N").ToUpperInvariant(), ["status"] = status });
        await Delete(client, id);
        Assert.True(JsonNode.DeepEquals(body, await Saved(factory, linked)));
    }

    [PostgresTheory]
    [InlineData("[\"8e958963-5bfc-424f-85e4-161a4865d7ee\"]")]
    [InlineData("null")]
    public async Task Legacy_roster_is_archived_without_losing_its_content(string students)
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = Client(factory);
        var lesson = await CreateClass(client); var id = Id(lesson); lesson["studentIds"] = JsonNode.Parse(students);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            (await db.OperationalRecords.SingleAsync(row => row.Id == id)).Update("Turma legada", lesson.ToJsonString()); await db.SaveChangesAsync();
        }
        await Delete(client, id);
        Assert.True(JsonNode.DeepEquals(lesson["studentIds"], (await Saved(factory, id))["studentIds"]));
    }

    [PostgresFact]
    public async Task Active_enrollments_close_atomically_while_payments_and_other_classes_stay_unchanged()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = Client(factory);
        var lesson = await CreateClass(client); var id = Id(lesson); var active = Guid.NewGuid(); var future = Guid.NewGuid(); var other = Guid.NewGuid(); var charge = Guid.NewGuid();
        await AddRecord(factory, active, "enrollments", new JsonObject { ["classId"] = id.ToString(), ["status"] = "Ativa", ["startDate"] = Today.AddDays(-14).ToString("yyyy-MM-dd"), ["version"] = 4, ["monthlyAmount"] = 150 });
        var futureStart = Today.AddDays(7).ToString("yyyy-MM-dd");
        await AddRecord(factory, future, "enrollments", new JsonObject { ["classId"] = id.ToString(), ["status"] = "Ativa", ["startDate"] = futureStart, ["version"] = 1 });
        var unrelated = await AddRecord(factory, other, "enrollments", new JsonObject { ["classId"] = Guid.NewGuid().ToString(), ["status"] = "Ativa", ["startDate"] = futureStart });
        var payment = await AddRecord(factory, charge, "financeEntries", new JsonObject { ["sourceKind"] = "enrollments", ["sourceId"] = active.ToString(), ["status"] = "Pago", ["amount"] = 150 });
        var result = await Delete(client, id);
        Assert.Equal(2, result["enrollments"]!.AsArray().Count);
        var closed = await Saved(factory, active);
        Assert.Equal("Encerrada", closed["status"]!.GetValue<string>());
        Assert.Equal(5, closed["version"]!.GetValue<int>());
        Assert.Equal(Today.ToString("yyyy-MM-dd"), closed["endDate"]!.GetValue<string>());
        Assert.True(closed["closedByClassDeletion"]!.GetValue<bool>());
        Assert.False(closed["cancelledBeforeStart"]!.GetValue<bool>());
        var cancelled = await Saved(factory, future);
        Assert.Equal(futureStart, cancelled["startDate"]!.GetValue<string>());
        Assert.Equal(futureStart, cancelled["endDate"]!.GetValue<string>());
        Assert.True(cancelled["cancelledBeforeStart"]!.GetValue<bool>());
        Assert.True(JsonNode.DeepEquals(payment, await Saved(factory, charge)));
        Assert.True(JsonNode.DeepEquals(unrelated, await Saved(factory, other)));
        closed.Remove("closedByClassDeletion"); closed.Remove("cancelledBeforeStart"); closed["status"] = "Ativa";
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/v1/operations/enrollments/{active}", closed)).StatusCode);
    }

    [PostgresFact]
    public async Task Only_future_reservations_with_an_explicit_class_link_are_cancelled()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = Client(factory);
        var lesson = await CreateClass(client); var id = Id(lesson); var linked = Guid.NewGuid(); var separate = Guid.NewGuid(); var old = Guid.NewGuid();
        JsonObject Reservation(bool link, DateOnly day) => new() { ["date"] = day.ToString("yyyy-MM-dd"), ["startTime"] = "18:00", ["status"] = "Confirmada", ["activityKind"] = "Trial", ["classId"] = link ? id.ToString() : null, ["courtId"] = lesson["courtId"]!.DeepClone(), ["teacherId"] = lesson["teacherId"]!.DeepClone(), ["version"] = 2 };
        await AddRecord(factory, linked, "reservations", Reservation(true, Today.AddDays(7)));
        var independent = await AddRecord(factory, separate, "reservations", Reservation(false, Today.AddDays(7)));
        var past = await AddRecord(factory, old, "reservations", Reservation(true, Today.AddDays(-7)));
        var result = await Delete(client, id);
        Assert.Single(result["reservations"]!.AsArray());
        var cancelled = await Saved(factory, linked);
        Assert.Equal("Cancelada", cancelled["status"]!.GetValue<string>());
        Assert.Equal(3, cancelled["version"]!.GetValue<int>());
        Assert.True(cancelled["cancelledByClassDeletion"]!.GetValue<bool>());
        Assert.True(JsonNode.DeepEquals(independent, await Saved(factory, separate)));
        Assert.True(JsonNode.DeepEquals(past, await Saved(factory, old)));
    }

    [PostgresTheory]
    [InlineData("Creating", false)]
    [InlineData("ACTIVE", false)]
    [InlineData("CancelPending", false)]
    [InlineData("CANCELED", true)]
    [InlineData("EXPIRED", true)]
    [InlineData("Rejected", true)]
    public async Task Only_terminal_subscriptions_allow_deletion_without_calling_a_provider(string state, bool allowed)
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = Client(factory);
        var lesson = await CreateClass(client); var id = Id(lesson); var enrollment = Guid.NewGuid();
        var original = await AddRecord(factory, enrollment, "enrollments", new JsonObject { ["classId"] = id.ToString(), ["status"] = "Ativa", ["startDate"] = Today.AddDays(-7).ToString("yyyy-MM-dd") });
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            var payer = User.Create("Responsável teste", "payer-" + Guid.NewGuid() + "@example.invalid", "test-hash");
            db.Add(payer);
            var user = payer.Id; var account = new BillingAccount("Quadra", Guid.NewGuid(), user, null, user);
            db.Add(account);
            var subscription = new BillingSubscription(account.Id, Guid.NewGuid(), user, "enrollments", enrollment, 150, Today, DateTimeOffset.UtcNow);
            if (state == "Rejected") subscription.Reject("Fixture rejeitada");
            else subscription.Observe(state);
            db.Add(subscription); await db.SaveChangesAsync();
        }
        var response = await client.DeleteAsync(Path(id) + "?version=1");
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Conflict, response.StatusCode);
        if (!allowed)
        {
            Assert.Contains("assinatura", await response.Content.ReadAsStringAsync());
            Assert.Null((await Saved(factory, id))["deletedAt"]);
            Assert.True(JsonNode.DeepEquals(original, await Saved(factory, enrollment)));
        }
    }

    [PostgresTheory]
    [InlineData("deletedAt")]
    [InlineData("deletedBy")]
    [InlineData("deletedEffectiveDate")]
    [InlineData("deletedPreviousStatus")]
    public async Task Client_cannot_forge_deletion_metadata_through_normal_save(string field)
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = Client(factory);
        var lesson = await CreateClass(client); var id = Id(lesson); lesson[field] = "forjado";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(Path(id), lesson)).StatusCode);
        Assert.Null((await Saved(factory, id))[field]);
    }

    [PostgresFact]
    public async Task Concurrent_enrollment_and_deletion_never_leave_active_links_to_a_deleted_class()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = Client(factory);
        var lesson = await CreateClass(client); var id = Id(lesson); var student = Guid.NewGuid(); var enrollment = Guid.NewGuid();
        await AddRecord(factory, student, "students", new JsonObject { ["monthlyAmount"] = 0, ["version"] = 1 });
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<HttpResponseMessage> Remove() { await start.Task; return await client.DeleteAsync(Path(id) + "?version=1"); }
        async Task<HttpResponseMessage> Enroll() { await start.Task; return await client.PutAsJsonAsync($"/api/v1/operations/enrollments/{enrollment}", new { id = enrollment, name = "Matrícula concorrente", studentId = student, classId = id, startDate = Today.AddDays(-7).ToString("yyyy-MM-dd"), status = "Ativa", monthlyAmount = (decimal?)null }); }
        var deletion = Remove(); var registration = Enroll(); start.SetResult(); await Task.WhenAll(deletion, registration);
        Assert.Equal(HttpStatusCode.OK, deletion.Result.StatusCode);
        Assert.Contains(registration.Result.StatusCode, new[] { HttpStatusCode.Created, HttpStatusCode.BadRequest });
        Assert.NotNull((await Saved(factory, id))["deletedAt"]);
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var linked = await db.OperationalRecords.SingleOrDefaultAsync(row => row.Id == enrollment);
        if (linked is not null) Assert.Equal("Encerrada", JsonNode.Parse(linked.Payload)!["status"]!.GetValue<string>());
        Assert.Equal(1, await db.AuditLogs.CountAsync(row => row.ResourceId == id.ToString() && row.Action == "ClassSoftDeleted"));
    }
}
