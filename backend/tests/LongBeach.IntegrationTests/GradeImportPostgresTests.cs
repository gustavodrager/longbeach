using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class GradeImportPostgresTests
{
    [PostgresFact]
    public async Task Grade_is_owner_only_atomic_versioned_and_idempotent_without_financial_postings()
    {
        await using var factory = OperationalPostgresTests.Factory(); using var client = factory.CreateClient();
        await OperationalPostgresTests.Migrate(factory);
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Owner");
        var court = Guid.NewGuid(); var student = Guid.NewGuid(); var teacher = Guid.NewGuid(); var lesson = Guid.NewGuid(); var enrollment = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/courts/{court}", new { id = court, name = "Quadra de conferência", status = "Disponível", openingTime = "06:00", closingTime = "24:00" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/students/{student}", new { id = student, name = "Aluno existente", monthlyAmount = 170 })).StatusCode);
        object Row(string kind, object body, int line) => new { sheetName = "Grade", rowNumber = line, recordType = "reference-data", externalId = $"grade-{kind}-{line}", data = new { schema = "longbeach.class-grade-operations.v1", kind, body } };
        object[] Rows(Guid studentId) => [
            Row("team", new { id = teacher, name = "Professor novo", payAmount = (decimal?)null }, 1),
            Row("classes", new { id = lesson, name = "Sexta 17h", courtId = court, teacherId = teacher, weekDay = 5, startTime = "17:00", endTime = "18:00", startDate = "2026-10-06", capacity = 6, status = "Ativa", studentIds = Array.Empty<Guid>() }, 2),
            Row("enrollments", new { id = enrollment, name = "Aluno existente · Sexta", studentId, classId = lesson, startDate = "2026-10-06", status = "Ativa", monthlyAmount = (decimal?)null }, 3)
        ];
        async Task<Guid> Stage(object[] rows)
        {
            var response = await client.PostAsJsonAsync("/api/v1/imports", new { sourceName = $"grade-{Guid.NewGuid()}.json", sourceSha256 = new string('a', 64), records = rows });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            return (await OperationalPostgresTests.Read(response)).GetProperty("id").GetGuid();
        }
        var invalid = await Stage(Rows(Guid.NewGuid()));
        var bad = await client.GetFromJsonAsync<JsonElement>($"/api/v1/imports/{invalid}/class-grade");
        Assert.False(bad.GetProperty("canApply").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/v1/imports/{invalid}/class-grade/apply", new { confirmationToken = bad.GetProperty("confirmationToken").GetString() })).StatusCode);
        Assert.DoesNotContain((await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/team")).EnumerateArray(), row => row.GetProperty("id").GetGuid() == teacher);
        var batch = await Stage(Rows(student)); var path = $"/api/v1/imports/{batch}/class-grade";
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header(null, "students:write", "students:read");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path + "/apply", new { confirmationToken = "anything" })).StatusCode);
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Owner");
        var preview = await client.GetFromJsonAsync<JsonElement>(path);
        Assert.True(preview.GetProperty("canApply").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path + "/apply", new { confirmationToken = "stale" })).StatusCode);
        var input = new { confirmationToken = preview.GetProperty("confirmationToken").GetString() };
        var concurrent = await Task.WhenAll(client.PostAsJsonAsync(path + "/apply", input), client.PostAsJsonAsync(path + "/apply", input));
        Assert.All(concurrent, result => Assert.Equal(HttpStatusCode.OK, result.StatusCode));
        var saved = (await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/enrollments")).EnumerateArray().Single(row => row.GetProperty("id").GetGuid() == enrollment);
        Assert.Equal(JsonValueKind.Null, saved.GetProperty("monthlyAmount").ValueKind);
        Assert.Equal(batch, saved.GetProperty("importSource").GetProperty("batchId").GetGuid());
        Assert.Equal(1, saved.GetProperty("version").GetInt32());
        var changed = JsonNode.Parse(saved.GetRawText())!.AsObject(); changed["monthlyAmount"] = 190;
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/operations/enrollments/{enrollment}", changed)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(path + "/apply", input)).StatusCode);
        var replayed = (await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/enrollments")).EnumerateArray().Single(row => row.GetProperty("id").GetGuid() == enrollment);
        Assert.Equal(190, replayed.GetProperty("monthlyAmount").GetInt32());
        // An academic editor must preserve an unknown salary rather than replacing it with zero.
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header(null, "employees:read", "employees:write");
        var staff = (await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/team")).EnumerateArray().Single(row => row.GetProperty("id").GetGuid() == teacher);
        var edit = JsonNode.Parse(staff.GetRawText())!.AsObject(); edit["name"] = "Professor corrigido";
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/operations/team/{teacher}", edit)).StatusCode);
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        Assert.Equal(1, await db.AuditLogs.CountAsync(row => row.Action == "ClassGradeApplied" && row.ResourceId == batch.ToString()));
        var person = await db.OperationalRecords.SingleAsync(row => row.Id == teacher);
        Assert.Equal(JsonValueKind.Null, JsonSerializer.Deserialize<JsonElement>(person.Payload).GetProperty("payAmount").ValueKind);
        Assert.DoesNotContain(await db.OperationalRecords.Where(row => row.Kind == "financeEntries").Select(row => row.Payload).ToListAsync(), payload => payload.Contains(enrollment.ToString()));
    }
}
