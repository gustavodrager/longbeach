using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class ClassDeletionPostgresTests
{
    // These cases intentionally exercise legacy/incomplete records. Keep every
    // fixture in its own disposable schema so other domains never read them.
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

    private static async Task<JsonObject> CreateClass(HttpClient client)
    {
        var courtId = Guid.NewGuid(); var teacherId = Guid.NewGuid(); var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/courts/{courtId}",
            new { id = courtId, name = "Quadra exclusão teste", status = "Disponível", openingTime = "06:00", closingTime = "24:00", scheduleConfirmed = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/team/{teacherId}",
            new { id = teacherId, name = "Professor exclusão teste", payAmount = (decimal?)null })).StatusCode);
        var response = await client.PutAsJsonAsync($"/api/v1/operations/classes/{id}", new
        {
            id, name = "Turma exclusiva de teste", courtId, teacherId, weekDay = 1,
            startTime = "18:00", endTime = "19:00", capacity = 6, studentIds = Array.Empty<Guid>(), status = "Ativa"
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    }

    private static async Task<bool> Scheduled(HttpClient client, Guid id, bool range = false)
    {
        var url = range ? "/api/v1/operations/courts/schedule-range?from=2026-11-02&to=2026-11-08" : "/api/v1/operations/courts/schedule?date=2026-11-02";
        var result = await client.GetFromJsonAsync<JsonElement>(url);
        JsonElement[] days = range ? result.GetProperty("days").EnumerateArray().ToArray() : [result];
        return days.SelectMany(day => day.GetProperty("courts").EnumerateArray())
            .SelectMany(court => court.GetProperty("blocks").EnumerateArray())
            .Any(block => block.GetProperty("sourceId").GetGuid() == id);
    }

    private static async Task AddRecord(WebApplicationFactory<Program> factory, Guid id, string kind, JsonObject body)
    {
        body["id"] = id.ToString(); body["name"] ??= "Histórico preservado";
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        db.Add(new OperationalRecord(id, kind, body["name"]!.GetValue<string>(), body.ToJsonString()));
        await db.SaveChangesAsync();
    }

    [PostgresTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Empty_class_deletion_updates_both_schedules_audits_once_and_retires_its_id(bool legacyVersionZero)
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        var actor = Guid.NewGuid(); client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(actor, ["Manager"]));
        var lesson = await CreateClass(client); var id = Guid.Parse(lesson["id"]!.GetValue<string>());
        if (legacyVersionZero)
        {
            lesson.Remove("version");
            await using var editScope = factory.Services.CreateAsyncScope();
            var editDb = editScope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            (await editDb.OperationalRecords.SingleAsync(row => row.Id == id)).Update(lesson["name"]!.GetValue<string>(), lesson.ToJsonString());
            await editDb.SaveChangesAsync();
        }
        Assert.True(await Scheduled(client, id)); Assert.True(await Scheduled(client, id, range: true));
        var path = $"/api/v1/operations/classes/{id}";
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(path + $"?version={(legacyVersionZero ? 0 : 1)}")).StatusCode);
        Assert.False(await Scheduled(client, id)); Assert.False(await Scheduled(client, id, range: true));
        var directory = await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/classes");
        Assert.DoesNotContain(directory.EnumerateArray(), row => row.GetProperty("id").GetGuid() == id);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(path + "?version=1")).StatusCode);
        // Both current forms and legacy version-zero forms must fail after deletion.
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(path, lesson)).StatusCode);
        lesson["version"] = 0;
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(path, lesson)).StatusCode);
        lesson["id"] = Guid.NewGuid().ToString();
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/classes/{lesson["id"]}", lesson)).StatusCode);

        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var audit = Assert.Single(await db.AuditLogs.Where(row => row.ResourceId == id.ToString() && row.Action == "Deleted").ToListAsync());
        Assert.Equal(actor, audit.ActorUserId); Assert.Equal(nameof(OperationalRecord), audit.Resource);
        Assert.Contains("classes", audit.MetadataJson); Assert.DoesNotContain("Turma exclusiva", audit.MetadataJson);
        Assert.False(await db.OperationalRecords.AnyAsync(row => row.Id == id));
    }

    [PostgresFact]
    public async Task Stale_version_preserves_class_and_schedule_without_a_delete_audit()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        var lesson = await CreateClass(client); var id = Guid.Parse(lesson["id"]!.GetValue<string>()); var path = $"/api/v1/operations/classes/{id}";
        lesson["name"] = "Turma corrigida";
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(path, lesson)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync(path + "?version=1")).StatusCode);
        Assert.True(await Scheduled(client, id));
        await using (var scope = factory.Services.CreateAsyncScope())
            Assert.False(await scope.ServiceProvider.GetRequiredService<LongBeachDbContext>().AuditLogs.AnyAsync(row => row.ResourceId == id.ToString() && row.Action == "Deleted"));
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(path + "?version=2")).StatusCode);
    }

    [PostgresTheory]
    [InlineData("enrollments", "classId", "Ativa")]
    [InlineData("enrollments", "classId", "Encerrada")]
    [InlineData("presences", "classId", "Ausente")]
    [InlineData("reservations", "classId", "Cancelada")]
    [InlineData("financeEntries", "sourceId", "Cancelado")]
    [InlineData("portalRequests", "classId", "Closed")]
    public async Task Any_linked_history_blocks_deletion_without_changing_or_deleting_records(string kind, string field, string status)
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        var lesson = await CreateClass(client); var id = Guid.Parse(lesson["id"]!.GetValue<string>()); var linked = Guid.NewGuid();
        // Seed legacy relations directly: even cancelled, closed or imported data is history.
        var body = new JsonObject { [field] = id.ToString("N").ToUpperInvariant(), ["status"] = status };
        await AddRecord(factory, linked, kind, body);
        var response = await client.DeleteAsync($"/api/v1/operations/classes/{id}?version=1");
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode); Assert.Contains("Encerre a turma", await response.Content.ReadAsStringAsync());
        Assert.True(await Scheduled(client, id));
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        Assert.True(JsonNode.DeepEquals(body, JsonNode.Parse((await db.OperationalRecords.SingleAsync(row => row.Id == linked)).Payload)));
        Assert.True(await db.OperationalRecords.AnyAsync(row => row.Id == id));
        Assert.False(await db.AuditLogs.AnyAsync(row => row.ResourceId == id.ToString() && row.Action == "Deleted"));
    }

    [PostgresFact]
    public async Task Legacy_roster_cannot_be_deleted_even_without_enrollment_records()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        var lesson = await CreateClass(client); var id = Guid.Parse(lesson["id"]!.GetValue<string>());
        lesson["studentIds"] = new JsonArray(Guid.NewGuid().ToString());
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            (await db.OperationalRecords.SingleAsync(row => row.Id == id)).Update("Turma legada", lesson.ToJsonString()); await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/v1/operations/classes/{id}?version=1")).StatusCode);
        Assert.True(await Scheduled(client, id));
    }

    [PostgresFact]
    public async Task Concurrent_enrollment_and_delete_never_leave_a_student_in_a_missing_class()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        var lesson = await CreateClass(client); var id = Guid.Parse(lesson["id"]!.GetValue<string>()); var student = Guid.NewGuid(); var enrollment = Guid.NewGuid();
        await AddRecord(factory, student, "students", new JsonObject { ["monthlyAmount"] = 0, ["version"] = 1 });
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<HttpResponseMessage> Delete() { await start.Task; return await client.DeleteAsync($"/api/v1/operations/classes/{id}?version=1"); }
        async Task<HttpResponseMessage> Enroll() { await start.Task; return await client.PutAsJsonAsync($"/api/v1/operations/enrollments/{enrollment}", new { id = enrollment, name = "Matrícula concorrente", studentId = student, classId = id, startDate = "2026-11-02", status = "Ativa", monthlyAmount = (decimal?)null }); }
        var deletion = Delete(); var registration = Enroll(); start.SetResult(); await Task.WhenAll(deletion, registration);
        if (deletion.Result.StatusCode == HttpStatusCode.NoContent) Assert.Equal(HttpStatusCode.BadRequest, registration.Result.StatusCode);
        else { Assert.Equal(HttpStatusCode.Conflict, deletion.Result.StatusCode); Assert.Equal(HttpStatusCode.Created, registration.Result.StatusCode); }
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var hasClass = await db.OperationalRecords.AnyAsync(row => row.Id == id); var hasEnrollment = await db.OperationalRecords.AnyAsync(row => row.Id == enrollment);
        Assert.True(!hasEnrollment || hasClass);
        Assert.Equal(hasClass ? 0 : 1, await db.AuditLogs.CountAsync(row => row.ResourceId == id.ToString() && row.Action == "Deleted"));
    }

    [PostgresFact]
    public async Task Persisted_role_change_and_blocking_restrict_delete_on_the_same_token()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        var lesson = await CreateClass(client); var id = Guid.Parse(lesson["id"]!.GetValue<string>());
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        async Task<Role> Role(string name) => await db.Roles.SingleOrDefaultAsync(row => row.Name == name) ?? new Role(name);
        var user = User.Create("Gestor de teste", $"{Guid.NewGuid():N}@example.test", "fixture-hash"); user.AssignRole(await Role("Manager")); db.Add(user); await db.SaveChangesAsync();
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(user.Id, ["Manager"], registerUser: false));
        // A stale version proves the manager reaches the deletion guard without removing it.
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/v1/operations/classes/{id}?version=0")).StatusCode);
        user.SetRole(await Role("Operations")); await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync($"/api/v1/operations/classes/{id}?version=1")).StatusCode);
        user.Deactivate(); await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.DeleteAsync($"/api/v1/operations/classes/{id}?version=1")).StatusCode);
        Assert.True(await db.OperationalRecords.AnyAsync(row => row.Id == id));
        Assert.False(await db.AuditLogs.AnyAsync(row => row.ResourceId == id.ToString() && row.Action == "Deleted"));
    }
}
