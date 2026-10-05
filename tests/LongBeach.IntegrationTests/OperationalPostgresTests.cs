using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Domain.Auditing;
using LongBeach.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class OperationalPostgresTests
{
    [PostgresFact]
    public async Task Acknowledged_edits_replay_once_reject_stale_versions_and_preserve_restricted_salary()
    {
        await using var factory = Factory(); using var client = factory.CreateClient();
        await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Owner");
        var id = Guid.NewGuid(); var path = $"/api/v1/operations/team/{id}";
        var original = new { id, name = "Professora de teste", payAmount = 180, payBasis = "Hora", paymentFrequency = "Mensal", paymentDay = "10", notes = "Acordo privado de R$ 180 por hora" };
        var created = await client.PutAsJsonAsync(path, original);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(1, (await Read(created)).GetProperty("version").GetInt32());
        var replay = await client.PutAsJsonAsync(path, original);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(1, (await Read(replay)).GetProperty("version").GetInt32());
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            var audit = Assert.Single(await db.Set<AuditLog>().Where(row => row.ResourceId == id.ToString()).ToListAsync());
            Assert.DoesNotContain("180", audit.MetadataJson);
        }

        client.DefaultRequestHeaders.Authorization = Header(null, "employees:read", "employees:write");
        var staff = (await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/team")).EnumerateArray().Single(row => row.GetProperty("id").GetGuid() == id);
        Assert.False(staff.GetProperty("costsVisible").GetBoolean());
        Assert.Equal(0, staff.GetProperty("payAmount").GetInt32());
        Assert.Equal("", staff.GetProperty("notes").GetString());
        var edit = JsonNode.Parse(staff.GetRawText())!.AsObject(); edit["name"] = "Nome corrigido";
        var updated = await client.PutAsJsonAsync(path, edit);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal(2, (await Read(updated)).GetProperty("version").GetInt32());

        client.DefaultRequestHeaders.Authorization = Header("Owner");
        var confirmed = (await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/team")).EnumerateArray().Single(row => row.GetProperty("id").GetGuid() == id);
        Assert.Equal(180, confirmed.GetProperty("payAmount").GetInt32());
        Assert.Equal(original.notes, confirmed.GetProperty("notes").GetString());
        var stale = JsonNode.Parse(confirmed.GetRawText())!.AsObject(); stale["version"] = 1; stale["name"] = "Edição desatualizada";
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(path, stale)).StatusCode);
    }

    [PostgresFact]
    public async Task Shared_court_capacity_rejects_concurrent_bookings_and_exposes_no_school_identity_to_reception()
    {
        await using var factory = Factory(); using var client = factory.CreateClient();
        await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Owner");
        var courtId = Guid.NewGuid(); var teacherId = Guid.NewGuid(); var classId = Guid.NewGuid();
        var date = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3)).AddDays(1);
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/courts/{courtId}", new { id = courtId, name = "Quadra de teste", status = "Disponível", openingTime = "06:00", closingTime = "23:00" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/team/{teacherId}", new { id = teacherId, name = "Professor privado", payAmount = 100 })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/classes/{classId}", new { id = classId, name = "Turma privada", courtId, teacherId, weekDay = (int)date.DayOfWeek, startTime = "18:00", endTime = "19:00", capacity = 4, studentIds = Array.Empty<Guid>(), status = "Ativa" })).StatusCode);
        Task<HttpResponseMessage> Reserve(string begin, string end)
        {
            var id = Guid.NewGuid();
            return client.PutAsJsonAsync($"/api/v1/operations/reservations/{id}", new { id, name = "Reserva de teste", courtId, date = date.ToString("yyyy-MM-dd"), startTime = begin, endTime = end, customerName = "Visitante privado", amount = 80, status = "Confirmada" });
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await Reserve("18:30", "19:30")).StatusCode);
        var parallel = await Task.WhenAll(Reserve("19:00", "20:00"), Reserve("19:00", "20:00"));
        Assert.Single(parallel, response => response.StatusCode == HttpStatusCode.Created);
        Assert.Single(parallel, response => response.StatusCode == HttpStatusCode.BadRequest);

        client.DefaultRequestHeaders.Authorization = Header(null, "projects:read");
        var schedule = await client.GetFromJsonAsync<JsonElement>($"/api/v1/operations/courts/schedule?date={date:yyyy-MM-dd}");
        var court = schedule.GetProperty("courts").EnumerateArray().Single(row => row.GetProperty("courtId").GetGuid() == courtId);
        Assert.Equal(60, court.GetProperty("classMinutes").GetInt32());
        Assert.Equal(60, court.GetProperty("reservedMinutes").GetInt32());
        Assert.Equal(900, court.GetProperty("availableMinutes").GetInt32());
        var classBlock = court.GetProperty("blocks").EnumerateArray().Single(row => row.GetProperty("source").GetString() == "Aula");
        Assert.Equal(JsonValueKind.Null, classBlock.GetProperty("sourceId").ValueKind);
        Assert.DoesNotContain("privad", court.GetRawText());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/operations/classes")).StatusCode);
    }

    internal static WebApplicationFactory<Program> Factory() => new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
        .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:LongBeach"] = Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL") }))
        .ConfigureServices(services => services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")))));
    internal static async Task Migrate(WebApplicationFactory<Program> factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<LongBeachDbContext>().Database.MigrateAsync();
    }
    internal static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.Clone();
    }
    internal static AuthenticationHeaderValue Header(string? role, params string[] permissions)
    {
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim> { new("sub", Guid.NewGuid().ToString()) };
        claims.AddRange(permissions.Select(permission => new Claim("permission", permission)));
        if (role is not null) claims.Add(new Claim(ClaimTypes.Role, role));
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", claims, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), credentials));
        return new("Bearer", token);
    }
}
