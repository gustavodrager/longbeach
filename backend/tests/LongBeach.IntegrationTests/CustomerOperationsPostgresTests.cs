using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Contracts.Customers;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Customers;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class CustomerOperationsPostgresTests
{
    [PostgresFact]
    public async Task Listing_legacy_groups_without_roster_preserves_all_groups_without_creating_customer_identity()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        var missingId = Guid.NewGuid(); var nullId = Guid.NewGuid(); var normalId = Guid.NewGuid(); var memberId = Guid.NewGuid();
        var missingRoster = JsonSerializer.Serialize(new { id = missingId, name = "Grupo legado sem integrantes", version = 1 });
        var nullRoster = JsonSerializer.Serialize(new { id = nullId, name = "Grupo legado com lista pendente", version = 1, members = (object?)null });
        var normalRoster = JsonSerializer.Serialize(new { id = normalId, name = "Grupo com integrante", version = 1,
            members = new[] { new { id = memberId, name = "Integrante sintético", phone = "", status = "Ativo" } } });
        db.AddRange(
            new OperationalRecord(missingId, "rentalGroups", "Grupo legado sem integrantes", missingRoster),
            new OperationalRecord(nullId, "rentalGroups", "Grupo legado com lista pendente", nullRoster),
            new OperationalRecord(normalId, "rentalGroups", "Grupo com integrante", normalRoster));
        await db.SaveChangesAsync();
        var before = (await db.OperationalRecords.AsNoTracking().Select(row => row.Payload).ToListAsync()).Order().ToArray();
        await using var factory = Factory(db);
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Owner");

        var response = await client.GetAsync("/api/v1/operations/rentalGroups");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = await OperationalPostgresTests.Read(response);
        Assert.Equal(JsonValueKind.Array, rows.ValueKind);
        Assert.Equal(3, rows.GetArrayLength());
        var missing = rows.EnumerateArray().Single(row => row.GetProperty("id").GetGuid() == missingId);
        var pending = rows.EnumerateArray().Single(row => row.GetProperty("id").GetGuid() == nullId);
        var normal = rows.EnumerateArray().Single(row => row.GetProperty("id").GetGuid() == normalId);
        Assert.False(missing.TryGetProperty("members", out _));
        Assert.Equal(JsonValueKind.Null, pending.GetProperty("members").ValueKind);
        var member = Assert.Single(normal.GetProperty("members").EnumerateArray());
        Assert.Equal(memberId, member.GetProperty("id").GetGuid());
        Assert.Equal("Integrante sintético", member.GetProperty("name").GetString());
        Assert.False(member.TryGetProperty("customerId", out _));
        Assert.Empty(await db.Set<LongBeach.Domain.Customers.Customer>().AsNoTracking().ToListAsync());
        Assert.Empty(await db.Set<LongBeach.Domain.Customers.CustomerSourceLink>().AsNoTracking().ToListAsync());
        Assert.Equal(before,
            (await db.OperationalRecords.AsNoTracking().Select(row => row.Payload).ToListAsync()).Order().ToArray());
    }

    [PostgresFact]
    public async Task One_customer_is_used_by_school_two_groups_and_reservations_without_changing_month_snapshots()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        await using var factory = Factory(db);
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Owner");
        var registry = new CustomerService(db, TimeProvider.System);
        var customer = await registry.Create(new(Guid.NewGuid(), "Pessoa sintética compartilhada", "11987654321"), Guid.NewGuid(), "staff", default);
        var courtId = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Created, (await client.PutAsJsonAsync($"/api/v1/operations/courts/{courtId}", new { id = courtId, name = "Quadra sintética", status = "Disponível", openingTime = "06:00", closingTime = "24:00" })).StatusCode);
        var studentId = Guid.NewGuid();
        var student = await client.PutAsJsonAsync($"/api/v1/operations/students/{studentId}", new { id = studentId, name = "Nome local antigo", phone = "", monthlyAmount = 0, status = "Ativo", customerId = customer.Id });
        Assert.Equal(HttpStatusCode.Created, student.StatusCode);
        Assert.Equal(customer.Name, (await OperationalPostgresTests.Read(student)).GetProperty("name").GetString());
        var duplicateStudentId = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/v1/operations/students/{duplicateStudentId}",
            new { id = duplicateStudentId, name = "Segunda ficha indevida", monthlyAmount = 0, customerId = customer.Id })).StatusCode);
        var memberId = Guid.NewGuid(); var groups = new[] { Guid.NewGuid(), Guid.NewGuid() };
        for (var index = 0; index < groups.Length; index++)
        {
            var groupId = groups[index];
            var group = await client.PutAsJsonAsync($"/api/v1/operations/rentalGroups/{groupId}", new
            {
                id = groupId, name = "Grupo sintético " + index, sport = "Futevôlei", courtId, weekDay = index + 1,
                startTime = "06:00", endTime = "07:00", startDate = "2026-11-01", endDate = "", status = "Ativo",
                capacity = 6, organizerId = memberId, backupId = "", monthlyAmount = (decimal?)null, dueDay = (int?)null,
                fifthPolicy = "Incluído", extraAmount = (decimal?)null, notes = "",
                members = new[] { new { id = memberId, name = "Referência antiga", phone = "", status = "Ativo", customerId = customer.Id } }
            });
            Assert.Equal(HttpStatusCode.Created, group.StatusCode);
            var body = await OperationalPostgresTests.Read(group);
            Assert.Equal(customer.Id, body.GetProperty("members")[0].GetProperty("customerId").GetGuid());
        }
        // Member IDs may repeat across groups. The group is part of source identity.
        Assert.Equal(customer.Id, (await registry.GetSourceAsync("rentalMembers", memberId, groups[0], default))!.Id);
        Assert.Equal(customer.Id, (await registry.GetSourceAsync("rentalMembers", memberId, groups[1], default))!.Id);
        var monthId = Guid.NewGuid();
        var snapshot = JsonSerializer.Serialize(new { id = monthId, name = "Competência histórica", members = new[] { new { id = memberId, name = customer.Name } } });
        db.Add(new OperationalRecord(monthId, "rentalMonths", "Competência histórica", snapshot)); await db.SaveChangesAsync();
        snapshot = (await db.OperationalRecords.AsNoTracking().SingleAsync(x => x.Id == monthId)).Payload;
        var reservation = Guid.NewGuid();
        var booked = await client.PutAsJsonAsync($"/api/v1/operations/reservations/{reservation}", new
        { id = reservation, name = "Reserva sintética", courtId, date = "2026-11-08", startTime = "09:00", endTime = "10:00", status = "Confirmada", amount = 0, customerName = "", phone = "", customerId = customer.Id });
        Assert.Equal(HttpStatusCode.Created, booked.StatusCode);
        var updated = await registry.Update(customer.Id, new(customer.Version, "Nome canônico atualizado", "11911112222", null, "Ativo"), default);
        var students = await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/students");
        Assert.Equal(updated.Name, students.EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == studentId).GetProperty("name").GetString());
        var rentals = await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/rentalGroups");
        Assert.All(rentals.EnumerateArray(), row => Assert.Equal(updated.Phone, row.GetProperty("members")[0].GetProperty("phone").GetString()));
        var bookings = await client.GetFromJsonAsync<JsonElement>("/api/v1/operations/reservations");
        Assert.Equal(updated.Name, bookings.EnumerateArray().Single().GetProperty("customerName").GetString());
        Assert.Equal(snapshot, (await db.OperationalRecords.AsNoTracking().SingleAsync(x => x.Id == monthId)).Payload);
        Assert.Empty(await db.OperationalRecords.Where(x => x.Kind == "financeEntries").ToListAsync());
        Assert.Empty(await db.Set<LongBeach.Domain.Billing.BillingAccount>().ToListAsync());
        Assert.Equal(new[] { "Aluno", "Mensalista" }, (await registry.Get(customer.Id, default)).Profiles);
    }

    [PostgresFact]
    public async Task New_student_needs_phone_but_existing_incomplete_student_can_be_edited_without_losing_identity()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        await using var factory = Factory(db); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Owner");
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/students/{id}", new { id, name = "Aluno sem telefone", phone = "", monthlyAmount = 0 })).StatusCode);
        Assert.Empty(await db.OperationalRecords.Where(x => x.Kind == "students").ToListAsync());
        Assert.Empty(await db.Set<LongBeach.Domain.Customers.Customer>().ToListAsync());
        var old = new JsonObject { ["id"] = id.ToString(), ["version"] = 1, ["name"] = "Aluno legado", ["phone"] = "", ["monthlyAmount"] = 0, ["status"] = "Ativo" };
        db.Add(new OperationalRecord(id, "students", "Aluno legado", old.ToJsonString())); await db.SaveChangesAsync();
        old["status"] = "Pausado";
        var changed = await client.PutAsJsonAsync($"/api/v1/operations/students/{id}", old);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var saved = await OperationalPostgresTests.Read(changed); var customerId = saved.GetProperty("customerId").GetGuid();
        var customer = await new CustomerService(db, TimeProvider.System).Get(customerId, default);
        Assert.True(customer.Incomplete); Assert.Equal("Ativo", customer.Status);
        Assert.Equal("Pausado", saved.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/operations/students/{id}", saved)).StatusCode);
        Assert.Single(await db.Set<LongBeach.Domain.Customers.Customer>().ToListAsync());
    }

    [PostgresFact]
    public async Task Recurring_contact_is_registered_once_and_old_operation_replay_remains_valid()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        await using var factory = Factory(db); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Owner");
        var courtId = Guid.NewGuid();
        await client.PutAsJsonAsync($"/api/v1/operations/courts/{courtId}", new { id = courtId, name = "Quadra recorrente", status = "Disponível", openingTime = "06:00", closingTime = "24:00" });
        var request = new LongBeach.Contracts.Operations.RecurringReservationInput(Guid.NewGuid(), "Grupo semanal", courtId, "2026-11-02", "10:00", "11:00", 3, "Contato sintético", "11987654321");
        var response = await client.PostAsJsonAsync("/api/v1/operations/reservations/recurring", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var saved = await OperationalPostgresTests.Read(response);
        var customer = Assert.Single(await db.Set<LongBeach.Domain.Customers.Customer>().ToListAsync());
        Assert.All(saved.GetProperty("reservations").EnumerateArray(), row => Assert.Equal(customer.Id, row.GetProperty("customerId").GetGuid()));
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/operations/reservations/recurring", request)).StatusCode);
        Assert.Single(await db.Set<LongBeach.Domain.Customers.Customer>().ToListAsync());
    }

    [PostgresFact]
    public async Task Legacy_school_ids_resolving_to_one_customer_cannot_duplicate_new_enrollments_or_attendance()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var registry = new CustomerService(db, TimeProvider.System);
        var customer = await registry.Create(new(Guid.NewGuid(), "Cliente com fichas legadas", "11987654321"), Guid.NewGuid(), "staff", default);
        var firstStudent = Guid.NewGuid(); var secondStudent = Guid.NewGuid(); var classId = Guid.NewGuid();
        await using (var tx = await db.Database.BeginTransactionAsync())
        {
            await registry.EnsureSourceAsync(new("students", firstStudent, null, "", "", CustomerId: customer.Id), default);
            await registry.EnsureSourceAsync(new("students", secondStudent, null, "", "", CustomerId: customer.Id), default);
            await db.SaveChangesAsync(); await tx.CommitAsync();
        }
        var enrollmentId = Guid.NewGuid(); var presenceId = Guid.NewGuid();
        var records = new[]
        {
            new OperationalRecord(enrollmentId, "enrollments", "Matrícula histórica", JsonSerializer.Serialize(new { id = enrollmentId, classId, studentId = firstStudent, status = "Ativa" })),
            new OperationalRecord(presenceId, "presences", "Presença histórica", JsonSerializer.Serialize(new { id = presenceId, classId, studentId = firstStudent, date = "2026-11-02", status = "Presente" }))
        };
        await using var transaction = await db.Database.BeginTransactionAsync();
        var body = JsonSerializer.SerializeToElement(new { classId, studentId = secondStudent, status = "Ativa" });
        var duplicate = await Assert.ThrowsAsync<LongBeach.Domain.Customers.CustomerRuleException>(() =>
            CustomerSchoolIdentityGuard.CheckAsync(db, registry, "enrollments", Guid.NewGuid(), body, records, default));
        Assert.Equal(409, duplicate.StatusCode);
        var presence = JsonSerializer.SerializeToElement(new { classId, studentId = secondStudent, date = "2026-11-02", status = "Ausente" });
        Assert.Equal(409, (await Assert.ThrowsAsync<LongBeach.Domain.Customers.CustomerRuleException>(() =>
            CustomerSchoolIdentityGuard.CheckAsync(db, registry, "presences", Guid.NewGuid(), presence, records, default))).StatusCode);
        await CustomerSchoolIdentityGuard.CheckAsync(db, registry, "presences", Guid.NewGuid(),
            JsonSerializer.SerializeToElement(new { classId, studentId = secondStudent, date = "2026-11-03", status = "Presente" }), records, default);
        await CustomerSchoolIdentityGuard.CheckAsync(db, registry, "enrollments", enrollmentId,
            JsonSerializer.SerializeToElement(new { classId, studentId = firstStudent, status = "Ativa" }), records, default);
    }

    private static Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> Factory(LongBeachDbContext db) =>
        new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:LongBeach"] = db.Database.GetConnectionString() }))
            .ConfigureServices(services => services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(db.Database.GetConnectionString()))));
}
