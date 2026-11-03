using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Contracts.Customers;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Customers;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Infrastructure.Teaching;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class CustomerProfilesPostgresTests
{
    [PostgresFact]
    public async Task Bar_only_filter_excludes_other_links_and_never_classifies_contact_origin_or_account_as_activity()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var db = isolated.Context;
        var onlyBar = new Customer("Somente consumo", "11999990001", null, "directory");
        var barStudent = new Customer("Consumo e aulas", "11999990002", null, "directory");
        var barMonthly = new Customer("Consumo e mensalista", "11999990003", null, "directory");
        var unclassified = new Customer("Origem bar sem consumo", "11999990004", null, "bar");
        var alias = new Customer("Contato anterior", "11999990001", null, "directory");
        alias.MergeInto(onlyBar.Id);
        db.AddRange(onlyBar, barStudent, barMonthly, unclassified, alias);
        db.AddRange(
            new CustomerSourceLink("barTabs", Guid.NewGuid(), Guid.Empty, onlyBar.Id),
            new CustomerSourceLink("barSales", Guid.NewGuid(), Guid.Empty, alias.Id),
            new CustomerSourceLink("barTabs", Guid.NewGuid(), Guid.Empty, barStudent.Id),
            new CustomerSourceLink("students", Guid.NewGuid(), Guid.Empty, barStudent.Id),
            new CustomerSourceLink("barTabs", Guid.NewGuid(), Guid.Empty, barMonthly.Id),
            new CustomerSourceLink("rentalMembers", Guid.NewGuid(), Guid.NewGuid(), barMonthly.Id));
        await db.SaveChangesAsync();
        var beforeSources = await db.Set<CustomerSourceLink>().CountAsync();
        var registry = new CustomerService(db, TimeProvider.System);

        var only = await registry.List(null, "SomenteBar", null, null, 1, 20, default);
        Assert.Equal(onlyBar.Id, Assert.Single(only.Items).Id);
        Assert.Equal(["Bar"], only.Items[0].Profiles);
        Assert.Empty((await registry.Get(unclassified.Id, default)).Profiles);
        Assert.Equal(["Aluno", "Bar"], (await registry.Get(barStudent.Id, default)).Profiles);
        Assert.Equal(["Bar", "Mensalista"], (await registry.Get(barMonthly.Id, default)).Profiles);
        Assert.Equal(3, (await registry.List(null, "Bar", null, null, 1, 20, default)).Total);
        Assert.Equal(onlyBar.Id, Assert.Single((await registry.List("Contato anterior", "SomenteBar", null, null, 1, 20, default)).Items).Id);
        Assert.Equal(beforeSources, await db.Set<CustomerSourceLink>().CountAsync());
        Assert.Empty(await db.Set<CustomerOperation>().ToArrayAsync());
    }

    [PostgresFact]
    public async Task Avulso_comes_from_explicit_court_rentals_or_single_lessons_and_never_from_trials_blocks_or_rescheduled_classes()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var db = isolated.Context;
        var expected = new List<Guid>();
        Customer AddReservation(string name, string status = "Confirmada", string activity = "", string teacher = "", string monthly = "", bool record = true, bool linked = true)
        {
            var customer = new Customer(name, "11999990001", null, "directory");
            var id = Guid.NewGuid(); db.Add(customer);
            db.Add(new CustomerSourceLink("reservations", id, Guid.Empty, linked ? customer.Id : null));
            if (record) db.Add(new OperationalRecord(id, "reservations", name, JsonSerializer.Serialize(new
            { id, name, customerId = customer.Id, status, activityKind = activity, teacherId = teacher, rentalGroupId = monthly })));
            return customer;
        }
        var rental = AddReservation("Aluguel pontual"); expected.Add(rental.Id);
        expected.Add(AddReservation("Aluguel concluído", "Concluída").Id);
        expected.Add(AddReservation("Cliente chegou", "Chegou").Id);
        expected.Add(AddReservation("Aula pontual", activity: "SingleLesson", teacher: Guid.NewGuid().ToString()).Id);
        var trial = AddReservation("Experimental", activity: "Trial", teacher: Guid.NewGuid().ToString());
        AddReservation("Mensalista", monthly: Guid.NewGuid().ToString());
        AddReservation("Cancelada", "Cancelada");
        AddReservation("Bloqueio", "Bloqueio");
        AddReservation("Aula com professor sem tipo explícito", teacher: Guid.NewGuid().ToString());
        AddReservation("Aula avulsa sem professor", activity: "SingleLesson");
        AddReservation("Vínculo sem registro", record: false);
        AddReservation("Vínculo removido", linked: false);
        var rescheduled = AddReservation("Remarcação de aula legada");
        db.Add(new CustomerSourceLink("students", Guid.NewGuid(), Guid.Empty, rescheduled.Id));
        var rescheduledId = db.Set<CustomerSourceLink>().Local.Single(row => row.CustomerId == rescheduled.Id && row.Kind == "reservations").SourceId;
        db.Add(new OperationalRecord(Guid.NewGuid(), "portalRequests", "Remarcação confirmada", JsonSerializer.Serialize(new
        { kind = "Reschedule", appointmentKey = $"class:{Guid.NewGuid()}:2026-11-03", reservationId = rescheduledId, status = "Confirmed" })));
        db.Add(new CustomerSourceLink("barTabs", Guid.NewGuid(), Guid.Empty, rental.Id));
        db.Add(new CustomerSourceLink("rentalMembers", Guid.NewGuid(), Guid.NewGuid(), rental.Id));
        db.Add(new CustomerSourceLink("students", Guid.NewGuid(), Guid.Empty, rental.Id));
        db.Add(new CustomerSourceLink("barTabs", Guid.NewGuid(), Guid.Empty, trial.Id));
        var onlyBar = new Customer("Só bar", "11999990001", null, "directory"); db.Add(onlyBar);
        db.Add(new CustomerSourceLink("barTabs", Guid.NewGuid(), Guid.Empty, onlyBar.Id));
        await db.SaveChangesAsync();
        var registry = new CustomerService(db, TimeProvider.System);

        var matches = await registry.List(null, "Avulso", null, null, 1, 100, default);
        Assert.Equal(expected.Order(), matches.Items.Select(row => row.Id).Order());
        Assert.Equal(["Aluno", "Avulso", "Bar", "Mensalista"], (await registry.Get(rental.Id, default)).Profiles);
        Assert.Equal(["Aluno"], (await registry.Get(rescheduled.Id, default)).Profiles);
        Assert.Equal(onlyBar.Id, Assert.Single((await registry.List(null, "SomenteBar", null, null, 1, 100, default)).Items).Id);

        // Local changes in a transaction must override the persisted link, not resurrect its old activity.
        await using var transaction = await db.Database.BeginTransactionAsync();
        var link = db.Set<CustomerSourceLink>().Local.Single(row => row.CustomerId == rental.Id && row.Kind == "reservations");
        link.Replace(null);
        Assert.DoesNotContain("Avulso", (await registry.Get(rental.Id, default)).Profiles);
        await transaction.RollbackAsync();
    }

    [PostgresFact]
    public async Task Staff_can_register_a_single_lesson_for_an_existing_customer_and_only_its_teacher_can_see_it()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var db = isolated.Context; var registry = new CustomerService(db, TimeProvider.System);
        var customer = new Customer("Cliente da aula", "11999990001", null, "directory"); db.Add(customer);
        var court = Guid.NewGuid(); var teacher = Guid.NewGuid(); var otherTeacher = Guid.NewGuid();
        var user = Guid.NewGuid(); var otherUser = Guid.NewGuid();
        db.AddRange(
            Record(court, "courts", new { id = court, name = "Quadra", status = "Disponível", openingTime = "06:00", closingTime = "24:00" }),
            Record(teacher, "team", new { id = teacher, name = "Professor da aula", status = "Ativo" }),
            Record(otherTeacher, "team", new { id = otherTeacher, name = "Outro professor", status = "Ativo" }),
            Record(Guid.NewGuid(), "teacherLinks", new { userId = user, teamId = teacher }),
            Record(Guid.NewGuid(), "teacherLinks", new { userId = otherUser, teamId = otherTeacher }));
        await db.SaveChangesAsync();
        await using var factory = Factory(isolated);
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        var id = Guid.NewGuid();
        var input = JsonSerializer.SerializeToNode(new { id, name = "Aula avulsa", customerId = customer.Id, courtId = court, teacherId = teacher,
            date = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3)).AddDays(1).ToString("yyyy-MM-dd"), startTime = "10:00", endTime = "11:00",
            status = "Confirmada", amount = 0, activityKind = "SingleLesson", customerName = "Contato não deve criar outra pessoa", phone = "11999990002" })!.AsObject();
        var missing = (JsonObject)input.DeepClone(); missing.Remove("customerId");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/reservations/{id}", missing)).StatusCode);
        Assert.Equal(1, await db.Set<Customer>().CountAsync());
        Assert.Empty(await db.OperationalRecords.Where(row => row.Kind == "reservations").ToArrayAsync());
        var unknown = (JsonObject)input.DeepClone(); unknown["customerId"] = Guid.NewGuid().ToString();
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"/api/v1/operations/reservations/{id}", unknown)).StatusCode);
        Assert.Equal(1, await db.Set<Customer>().CountAsync());

        var created = await client.PutAsJsonAsync($"/api/v1/operations/reservations/{id}", input);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var saved = await created.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(customer.Id, saved.GetProperty("customerId").GetGuid());
        Assert.Equal("SingleLesson", saved.GetProperty("activityKind").GetString());
        Assert.Equal("Cliente da aula", saved.GetProperty("customerName").GetString());
        Assert.Equal(["Avulso"], (await registry.Get(customer.Id, default)).Profiles);
        var filtered = await client.GetFromJsonAsync<CustomerPage>("/api/v1/customers?profile=Avulso");
        Assert.Equal(customer.Id, Assert.Single(filtered!.Items).Id);
        var teaching = new TeachingService(db, TimeProvider.System);
        Assert.Equal(id, Assert.Single((await teaching.Overview(user, default)).Appointments!).Id);
        Assert.Empty((await teaching.Overview(otherUser, default)).Appointments!);
        Assert.Empty(await db.OperationalRecords.Where(row => row.Kind == "classes" || row.Kind == "enrollments").ToArrayAsync());
        Assert.Empty(await db.Set<LongBeach.Domain.Billing.BillingAccount>().ToArrayAsync());

        // Changing an ordinary booking between rental and an explicit single lesson replaces its metadata.
        var asRental = JsonNode.Parse(saved.GetRawText())!.AsObject(); asRental.Remove("activityKind"); asRental.Remove("teacherId");
        var converted = await client.PutAsJsonAsync($"/api/v1/operations/reservations/{id}", asRental);
        Assert.Equal(HttpStatusCode.OK, converted.StatusCode);
        var rental = await converted.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(rental.TryGetProperty("activityKind", out _)); Assert.False(rental.TryGetProperty("teacherId", out _));
        var asLesson = JsonNode.Parse(rental.GetRawText())!.AsObject(); asLesson["activityKind"] = "SingleLesson"; asLesson["teacherId"] = teacher.ToString();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/operations/reservations/{id}", asLesson)).StatusCode);
        Assert.Equal(1, await db.Set<Customer>().CountAsync());
    }

    [PostgresFact]
    public async Task Direct_api_cannot_convert_trials_or_rescheduled_classes_into_avulso_rentals_or_single_lessons()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var db = isolated.Context; var customer = new Customer("Aluno com remarcação", "11999990001", null, "directory"); db.Add(customer);
        var teacher = Guid.NewGuid(); var court = Guid.NewGuid();
        db.AddRange(
            Record(court, "courts", new { id = court, name = "Quadra", status = "Disponível", openingTime = "06:00", closingTime = "24:00" }),
            Record(teacher, "team", new { id = teacher, name = "Professor", status = "Ativo" }),
            new CustomerSourceLink("students", Guid.NewGuid(), Guid.Empty, customer.Id));
        var trial = Guid.NewGuid(); var rescheduled = Guid.NewGuid();
        foreach (var id in new[] { trial, rescheduled })
        {
            var body = JsonSerializer.SerializeToNode(new { id, version = 1, name = "Compromisso de aula", customerId = customer.Id, customerName = customer.Name,
                phone = customer.Phone, courtId = court, date = "2026-10-05", startTime = "10:00", endTime = "11:00", status = "Confirmada", amount = 0 })!.AsObject();
            if (id == trial) { body["activityKind"] = "Trial"; body["teacherId"] = teacher.ToString(); }
            else db.Add(Record(Guid.NewGuid(), "portalRequests", new { kind = "Reschedule", appointmentKey = $"class:{Guid.NewGuid()}:2026-10-04", reservationId = id }));
            db.Add(new OperationalRecord(id, "reservations", "Compromisso de aula", body.ToJsonString()));
            db.Add(new CustomerSourceLink("reservations", id, Guid.Empty, customer.Id));
        }
        await db.SaveChangesAsync();
        await using var factory = Factory(isolated);
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        foreach (var id in new[] { trial, rescheduled })
        {
            var original = (await db.OperationalRecords.AsNoTracking().SingleAsync(row => row.Id == id)).Payload;
            var asLesson = JsonNode.Parse(original)!.AsObject(); asLesson["activityKind"] = "SingleLesson"; asLesson["teacherId"] = teacher.ToString();
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/reservations/{id}", asLesson)).StatusCode);
            if (id == trial)
            {
                var asRental = JsonNode.Parse(original)!.AsObject(); asRental.Remove("activityKind"); asRental.Remove("teacherId");
                Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/operations/reservations/{id}", asRental)).StatusCode);
            }
            Assert.Equal(original, (await db.OperationalRecords.AsNoTracking().SingleAsync(row => row.Id == id)).Payload);
        }
        Assert.Equal(["Aluno"], (await new CustomerService(db, TimeProvider.System).Get(customer.Id, default)).Profiles);
    }

    private static Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> Factory(IsolatedMaterialDatabase isolated) =>
        new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
                { ["ConnectionStrings:LongBeach"] = isolated.Connection, ["BackgroundJobs:Enabled"] = "false" }))
            .ConfigureServices(services => services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(isolated.Connection))));

    private static OperationalRecord Record(Guid id, string kind, object body) => new(id, kind, kind, JsonSerializer.Serialize(body));
}
