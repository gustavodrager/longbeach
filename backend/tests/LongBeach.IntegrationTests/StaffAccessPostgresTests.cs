using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Contracts.Auth;
using LongBeach.Contracts.Bar;
using LongBeach.Contracts.Staff;
using LongBeach.Contracts.Teaching;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class StaffAccessPostgresTests
{
    private const string PermanentPassword = "StaffPermanentPassword2!";

    [PostgresFact]
    public async Task Import_administration_does_not_restore_an_unselected_destination_operation()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "gestor");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/gestor", new StaffAccessTypeInput("Importar e consultar turmas", ["administration", "classes"], ["administration.operate"], type.Version))).StatusCode);
        var team = Guid.NewGuid(); var created = await Save(owner, team, Member(team, "gestor", "11998880022"));
        using var staff = f.Client(); var first = await Login(staff, "11998880022", created.InitialPassword!); staff.DefaultRequestHeaders.Authorization = new("Bearer", first.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await staff.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, PermanentPassword))).StatusCode);
        var session = await Login(staff, "11998880022", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        var court = Guid.NewGuid(); var teacher = Guid.NewGuid(); var cls = Guid.NewGuid();
        await using (var db = f.Database.NewContext())
        {
            db.AddRange(Row(court, "courts", new { name = "Quadra", status = "Disponível", openingTime = "06:00", closingTime = "24:00" }), Row(teacher, "team", new { name = "Professor", role = "Professor", status = "Ativo", payAmount = (decimal?)null })); await db.SaveChangesAsync();
        }
        var date = DateOnly.FromDateTime(f.Clock.GetUtcNow().UtcDateTime.AddHours(-3));
        var staged = await staff.PostAsJsonAsync("/api/v1/imports", new { sourceName = "classes-fixture.json", sourceSha256 = new string('f', 64), records = new[] { new { sheetName = "Turmas", rowNumber = 1, recordType = "reference-data", externalId = "class-fixture", data = new { schema = "longbeach.class-grade-operations.v1", kind = "classes", body = new { id = cls, name = "Turma importada", courtId = court, teacherId = teacher, weekDay = (int)date.DayOfWeek, startTime = "12:00", endTime = "13:00", startDate = date.AddDays(-7).ToString("yyyy-MM-dd"), capacity = 6, status = "Ativa", studentIds = Array.Empty<Guid>() } } } } });
        Assert.Equal(HttpStatusCode.Created, staged.StatusCode); var batch = (await staged.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var preview = await staff.GetFromJsonAsync<JsonElement>($"/api/v1/imports/{batch}/class-grade"); Assert.True(preview.GetProperty("canApply").GetBoolean());
        var input = new { confirmationToken = preview.GetProperty("confirmationToken").GetString() };
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync($"/api/v1/imports/{batch}/class-grade/apply", input)).StatusCode);
        type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "gestor");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/gestor", new StaffAccessTypeInput(type.Name, type.Menus, ["administration.operate", "classes.operate"], type.Version))).StatusCode);
        session = await Login(staff, "11998880022", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await staff.PostAsJsonAsync($"/api/v1/imports/{batch}/class-grade/apply", input)).StatusCode);
        await using var verify = f.Database.NewContext(); Assert.True(await verify.OperationalRecords.AnyAsync(x => x.Id == cls));
    }

    [PostgresFact]
    public async Task Classes_and_stock_consultations_load_their_dependencies_without_restoring_mutations()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "gestor");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/gestor", new StaffAccessTypeInput("Turmas", ["classes"], [], type.Version))).StatusCode);
        var team = Guid.NewGuid(); var created = await Save(owner, team, Member(team, "gestor", "11998880021"));
        using var staff = f.Client(); var first = await Login(staff, "11998880021", created.InitialPassword!); staff.DefaultRequestHeaders.Authorization = new("Bearer", first.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await staff.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, PermanentPassword))).StatusCode);
        var session = await Login(staff, "11998880021", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        var court = Guid.NewGuid(); var reservation = Guid.NewGuid(); var date = DateOnly.FromDateTime(f.Clock.GetUtcNow().UtcDateTime.AddHours(-3));
        await using (var db = f.Database.NewContext())
        {
            db.AddRange(Row(court, "courts", new { name = "Quadra", status = "Disponível", openingTime = "06:00", closingTime = "24:00", scheduleConfirmed = true }),
                Row(reservation, "reservations", new { name = "Ocupação da quadra", courtId = court, date = date.ToString("yyyy-MM-dd"), startTime = "10:00", endTime = "11:00", status = "Confirmada", customerName = "private-customer", phone = "private-phone", amount = 999, notes = "private-notes" })); await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync($"/api/v1/operations/courts/schedule?date={date:yyyy-MM-dd}")).StatusCode);
        var occupied = await staff.GetAsync("/api/v1/operations/reservations"); Assert.Equal(HttpStatusCode.OK, occupied.StatusCode);
        var json = await occupied.Content.ReadAsStringAsync(); Assert.Equal("Ocupação da quadra", JsonSerializer.Deserialize<JsonElement>(json)[0].GetProperty("name").GetString()); Assert.DoesNotContain("private-", json); Assert.DoesNotContain("amount", json);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PutAsJsonAsync($"/api/v1/operations/reservations/{reservation}", new { id = reservation })).StatusCode);
        type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "gestor");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/gestor", new StaffAccessTypeInput("Estoque consulta", ["stock"], [], type.Version))).StatusCode);
        session = await Login(staff, "11998880021", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        foreach (var url in new[] { "/api/v1/bar/products", "/api/v1/bar/categories", "/api/v1/bar/suppliers", "/api/v1/bar/purchases", "/api/v1/bar/counts", "/api/v1/bar/recipes", "/api/v1/bar/stock/valuation" })
            Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync(url)).StatusCode);
        foreach (var url in new[] { "/api/v1/bar/products", "/api/v1/bar/suppliers", "/api/v1/bar/purchases", "/api/v1/bar/counts" })
            Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync(url, new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.DeleteAsync("/api/v1/bar/products/00000000-0000-4000-8000-000000000001?version=1")).StatusCode);
    }

    [PostgresFact]
    public async Task Requests_consultation_uses_read_grants_without_obtaining_decision_or_academic_writes()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "atendente");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/atendente", new StaffAccessTypeInput("Solicitações", ["agenda.requests"], [], type.Version))).StatusCode);
        var team = Guid.NewGuid(); var created = await Save(owner, team, Member(team, "atendente", "11998880020"));
        using var staff = f.Client(); var first = await Login(staff, "11998880020", created.InitialPassword!); staff.DefaultRequestHeaders.Authorization = new("Bearer", first.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await staff.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, PermanentPassword))).StatusCode);
        var session = await Login(staff, "11998880020", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        Assert.DoesNotContain("students:write", session.User.Permissions); Assert.DoesNotContain("projects:write", session.User.Permissions);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/v1/portal/options")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/v1/portal/requests")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync($"/api/v1/portal/requests/{Guid.NewGuid()}/decision", new { version = 0, action = "Reject", reply = "Sem alteração" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/v1/operations/students")).StatusCode);
    }

    [PostgresFact]
    public async Task A_phone_cannot_take_over_a_legacy_numeric_username()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        await using (var db = f.Database.NewContext())
        {
            var legacy = User.Create("Conta legada fictícia", "legacy-username@example.invalid", "preserved-hash"); db.Add(legacy); await db.SaveChangesAsync();
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE users SET \"Username\"='11998880017',\"NormalizedUsername\"='11998880017' WHERE \"Id\"={legacy.Id}");
        }
        var team = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PutAsJsonAsync($"/api/v1/staff-access/members/{team}", Member(team, "bar", "+55 (11) 99888-0017"))).StatusCode);
        await using var verify = f.Database.NewContext(); Assert.Equal(2, await verify.Users.CountAsync());
        Assert.False(await verify.OperationalRecords.AnyAsync(x => x.Id == team)); Assert.Empty(await verify.Set<StaffMembership>().ToListAsync());
    }

    [PostgresFact]
    public async Task Owner_can_manage_access_without_a_finance_menu_while_hidden_salary_and_notes_are_preserved()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var team = Guid.NewGuid(); var input = Member(team, "bar", "11998880015");
        var original = System.Text.Json.Nodes.JsonNode.Parse(input.Member.GetRawText())!.AsObject(); original["payAmount"] = 350; original["payBasis"] = "Hora"; original["notes"] = "Acordo privado preservado";
        var created = await Save(owner, team, input with { Member = JsonSerializer.SerializeToElement(original) });
        var ownerTeam = Guid.NewGuid(); await Save(owner, ownerTeam, Member(ownerTeam, "gestor", "11998880016", "link", f.OwnerId));
        owner.DefaultRequestHeaders.Authorization = new("Bearer", await f.Token(f.OwnerId));
        var type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "gestor");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/gestor", new StaffAccessTypeInput("Visão geral", ["overview"], [], type.Version))).StatusCode);
        owner.DefaultRequestHeaders.Authorization = new("Bearer", await f.Token(f.OwnerId));
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync("/api/v1/staff-access/context")).StatusCode);
        var rows = (await owner.GetFromJsonAsync<JsonElement[]>("/api/v1/operations/team"))!; var visible = rows.Single(x => x.GetProperty("id").GetGuid() == team);
        Assert.Equal(0, visible.GetProperty("payAmount").GetInt32()); Assert.Equal("", visible.GetProperty("notes").GetString());
        var edited = System.Text.Json.Nodes.JsonNode.Parse(visible.GetRawText())!.AsObject(); edited["name"] = "Nome atualizado";
        var saved = await Save(owner, team, new StaffMemberInput(JsonSerializer.SerializeToElement(edited), new StaffMemberAccessInput("keep", "bar", created.Access.PhoneLogin, Version: created.Access.Version), Guid.NewGuid()));
        Assert.Equal(0, saved.Member.GetProperty("payAmount").GetInt32()); Assert.Equal("", saved.Member.GetProperty("notes").GetString());
        await using var db = f.Database.NewContext(); var actual = JsonSerializer.Deserialize<JsonElement>((await db.OperationalRecords.SingleAsync(x => x.Id == team)).Payload);
        Assert.Equal(350, actual.GetProperty("payAmount").GetInt32()); Assert.Equal("Acordo privado preservado", actual.GetProperty("notes").GetString()); Assert.Equal("Nome atualizado", actual.GetProperty("name").GetString());
    }

    [PostgresFact]
    public async Task Persisted_manager_without_an_explicit_owner_id_cannot_write_team_types_accounts_or_teacher_links()
    {
        await using var f = await Fixture.Create(); Guid manager;
        await using (var db = f.Database.NewContext())
        {
            var user = User.Create("Gestor sem concessão de dono", "other-manager@example.invalid", "fixture-hash");
            user.AssignRole(await db.Roles.SingleAsync(x => x.Name == "Manager")); manager = user.Id; db.Add(user); await db.SaveChangesAsync();
        }
        using var client = f.Client(); client.DefaultRequestHeaders.Authorization = new("Bearer", await f.Token(manager));
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/staff-access/context")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/v1/staff-access/members/{id}", Member(id, "bar", "11998880013"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/v1/operations/team/{id}", new { id, version = 0, name = "Sem dono", status = "Ativo", payAmount = (decimal?)null })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/v1/teaching/access", new TeacherLink(manager, id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/v1/staff-access/types/bar", new StaffAccessTypeInput("Teste", ["bar.tabs"], [], 1))).StatusCode);
        var staged = await client.PostAsJsonAsync("/api/v1/imports", new { sourceName = "team-fixture.json", sourceSha256 = new string('e', 64), records = new[] { new { sheetName = "Equipe", rowNumber = 1, recordType = "reference-data", externalId = "team-fixture", data = new { schema = "longbeach.class-grade-operations.v1", kind = "team", body = new { id, name = "Equipe via importação", payAmount = (decimal?)null } } } } });
        Assert.Equal(HttpStatusCode.Created, staged.StatusCode); var batch = (await staged.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var preview = (await client.GetFromJsonAsync<JsonElement>($"/api/v1/imports/{batch}/class-grade")); Assert.True(preview.GetProperty("canApply").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/v1/imports/{batch}/class-grade/apply", new { confirmationToken = preview.GetProperty("confirmationToken").GetString() })).StatusCode);
        using var actualOwner = f.Client(true);
        Assert.Equal(HttpStatusCode.BadRequest, (await actualOwner.PutAsJsonAsync($"/api/v1/operations/team/{id}", new { id, name = "Injeção inválida", status = "Ativo", payAmount = (decimal?)null, passwordHash = "must-not-persist" })).StatusCode);
        foreach (var body in new object[] {
            new { member = (object?)null, access = new { mode = "create", typeId = "bar", phoneLogin = "11998880023" }, operationId = Guid.NewGuid() },
            new { member = Array.Empty<object>(), access = new { mode = "create", typeId = "bar", phoneLogin = "11998880023" }, operationId = Guid.NewGuid() },
            new { access = new { mode = "create", typeId = "bar", phoneLogin = "11998880023" }, operationId = Guid.NewGuid() }
        }) Assert.Equal(HttpStatusCode.BadRequest, (await actualOwner.PutAsJsonAsync($"/api/v1/staff-access/members/{id}", body)).StatusCode);
        await using var verify = f.Database.NewContext(); Assert.Empty(await verify.Set<StaffMembership>().ToListAsync()); Assert.Empty(await verify.OperationalRecords.Where(x => x.Kind == "team").ToListAsync());
    }

    [PostgresFact]
    public async Task Stock_cost_read_dependency_does_not_grant_foreign_cash_or_financial_administration()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "gestor");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/gestor", new StaffAccessTypeInput("Estoque e próprio caixa", ["stock", "bar.cash"], ["stock.operate", "bar.cash"], type.Version))).StatusCode);
        var team = Guid.NewGuid(); var created = await Save(owner, team, Member(team, "gestor", "11998880014"));
        using var staff = f.Client(); var first = await Login(staff, "11998880014", created.InitialPassword!); staff.DefaultRequestHeaders.Authorization = new("Bearer", first.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await staff.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, PermanentPassword))).StatusCode);
        var session = await Login(staff, "11998880014", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        Assert.Contains("bar:finance:read", session.User.Permissions);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/v1/bar/stock/valuation")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/v1/bar/categories")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/v1/bar/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/v1/billing/accounts")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/v1/received-invoices")).StatusCode);
        await using (var db = f.Database.NewContext())
        {
            var location = await db.Set<StockLocation>().SingleAsync(x => x.Name == "Bar"); await new BarCashService(db).Open(new(Guid.Empty, location.Id, "Fixture", 0, Guid.NewGuid()), f.OwnerId, default);
        }
        Assert.Empty((await staff.GetFromJsonAsync<JsonElement[]>("/api/v1/bar/cash/sessions"))!);
        Assert.Equal("null", await staff.GetStringAsync("/api/v1/bar/cash/current"));
    }

    [PostgresFact]
    public async Task Comandas_cannot_open_immediate_sales_and_selling_cannot_deliver_inside_add_items_without_orders()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "bar");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/bar", new StaffAccessTypeInput("Comandas", ["bar.tabs"], ["bar.tabs"], type.Version))).StatusCode);
        var team = Guid.NewGuid(); var created = await Save(owner, team, Member(team, "bar", "11998880011"));
        using var staff = f.Client(); var first = await Login(staff, "11998880011", created.InitialPassword!); staff.DefaultRequestHeaders.Authorization = new("Bearer", first.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await staff.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, PermanentPassword))).StatusCode);
        var session = await Login(staff, "11998880011", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        Guid location; await using (var db = f.Database.NewContext()) location = (await db.Set<StockLocation>().SingleAsync(x => x.Name == "Bar")).Id;
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync("/api/v1/bar/tabs", new OpenTabInput(Guid.NewGuid(), location, "Venda", "Immediate"))).StatusCode);
        var opened = await staff.PostAsJsonAsync("/api/v1/bar/tabs", new OpenTabInput(Guid.NewGuid(), location, "Comanda")); Assert.Equal(HttpStatusCode.OK, opened.StatusCode);
        var tab = (await opened.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "bar");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/bar", new StaffAccessTypeInput("Vendas", ["bar.sell"], ["bar.sell"], type.Version))).StatusCode);
        session = await Login(staff, "11998880011", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync($"/api/v1/bar/tabs/{tab}/items", new AddTabItemsInput(Guid.NewGuid(), [], Deliver: true))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/v1/operations/rentalGroups")).StatusCode);
        var rentalId = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PutAsJsonAsync($"/api/v1/operations/rentalGroups/{rentalId}",
            new { id = rentalId, name = "Grupo fictício", musicPreferences = new[] { "rock" } })).StatusCode);
        var immediateResponse = await staff.PostAsJsonAsync("/api/v1/bar/tabs", new OpenTabInput(Guid.NewGuid(), location, "Venda preparada", "Immediate"));
        Assert.Equal(HttpStatusCode.OK, immediateResponse.StatusCode);
        var immediate = (await immediateResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Guid preparedId;
        await using (var db = f.Database.NewContext())
        {
            var category = new BarProductCategory("Preparados fictícios");
            var prepared = new BarProduct("PREPARED-PERMISSION", "Preparado", "Preparado", category.Id, "un", "un", 1, 10, 0, 0, false, false, 0);
            prepared.SetPreparation(true); db.AddRange(category, prepared); await db.SaveChangesAsync(); preparedId = prepared.Id;
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync($"/api/v1/bar/tabs/{immediate}/items",
            new AddTabItemsInput(Guid.NewGuid(), [new(preparedId, 1)], Deliver: true))).StatusCode);
        await using var verify = f.Database.NewContext();
        Assert.False(await verify.Set<BarTabItem>().AnyAsync(x => x.TabId == immediate));
    }

    [PostgresFact]
    public async Task Cancellation_requires_explicit_supervision_and_returns_authorized_terminal_state()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "gestor");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/gestor", new StaffAccessTypeInput("Comandas", ["bar.tabs"], ["bar.tabs"], type.Version))).StatusCode);
        var team = Guid.NewGuid(); var created = await Save(owner, team, Member(team, "gestor", "11998880031"));
        using var staff = f.Client(); var first = await Login(staff, "11998880031", created.InitialPassword!); staff.DefaultRequestHeaders.Authorization = new("Bearer", first.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await staff.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, PermanentPassword))).StatusCode);
        var session = await Login(staff, "11998880031", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        Guid location; await using (var db = f.Database.NewContext()) location = (await db.Set<StockLocation>().SingleAsync(x => x.Name == "Bar")).Id;
        var opened = await staff.PostAsJsonAsync("/api/v1/bar/tabs", new OpenTabInput(Guid.NewGuid(), location)); Assert.Equal(HttpStatusCode.OK, opened.StatusCode);
        var tab = (await opened.Content.ReadFromJsonAsync<TabResponse>())!; var input = new TabCancelInput(Guid.NewGuid(), tab.Version, "Cliente desistiu");
        Assert.DoesNotContain("cancel", tab.AllowedActions);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync($"/api/v1/bar/tabs/{tab.Id}/cancel", input)).StatusCode);
        type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "gestor");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/gestor", new StaffAccessTypeInput("Comandas supervisionadas", ["bar.tabs"], ["bar.tabs", "bar.supervise"], type.Version))).StatusCode);
        session = await Login(staff, "11998880031", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        Assert.Contains("cancel", (await staff.GetFromJsonAsync<TabResponse>($"/api/v1/bar/tabs/{tab.Id}"))!.AllowedActions);
        var response = await staff.PostAsJsonAsync($"/api/v1/bar/tabs/{tab.Id}/cancel", input); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cancelled = (await response.Content.ReadFromJsonAsync<TabResponse>())!; Assert.Equal("Cancelled", cancelled.State); Assert.Empty(cancelled.AllowedActions);
        Assert.Equal("Cliente desistiu", Assert.Single(cancelled.History, x => x.Kind == "Cancelled").Reason);
    }

    [PostgresFact]
    public async Task Concurrent_first_password_changes_have_one_winner_and_revoke_both_bootstrap_sessions()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var team = Guid.NewGuid(); var created = await Save(owner, team, Member(team, "bar", "11998880010"));
        using var first = f.Client(); using var second = f.Client();
        var one = await Login(first, "11998880010", created.InitialPassword!);
        var two = await Login(second, "11998880010", created.InitialPassword!);
        first.DefaultRequestHeaders.Authorization = new("Bearer", one.AccessToken); second.DefaultRequestHeaders.Authorization = new("Bearer", two.AccessToken);
        var passwords = new[] { "FirstConcurrentPassword2!", "OtherConcurrentPassword3!" };
        var attempts = await Task.WhenAll(first.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, passwords[0])),
            second.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, passwords[1])));
        Assert.Single(attempts, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(attempts, x => x.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Conflict);
        Assert.Equal(HttpStatusCode.Unauthorized, (await first.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/v1/auth/me")).StatusCode);
        using var login = f.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await login.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest("11998880010", created.InitialPassword))).StatusCode);
        var winningPassword = attempts[0].IsSuccessStatusCode ? passwords[0] : passwords[1];
        var session = await Login(login, "11998880010", winningPassword); Assert.False(session.User.RequiresFirstAccess);
        await using var db = f.Database.NewContext(); var user = await db.Users.Include(x => x.RefreshTokens).SingleAsync(x => x.Id == created.Access.UserId);
        Assert.Equal(2, user.CredentialVersion); Assert.Equal(2, user.RefreshTokens.Count(x => x.RevokedAtUtc != null));
    }

    [PostgresFact]
    public async Task Phone_first_access_has_no_internal_access_until_password_change_then_bar_scope_and_cash_ownership_apply()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var teamId = Guid.NewGuid(); var input = Member(teamId, "bar", "(11) 99888-0001");
        var created = await Save(owner, teamId, input);
        Assert.NotNull(created.InitialPassword); Assert.NotEqual("12345", created.InitialPassword);
        Assert.True(created.Access.RequiresFirstAccess); Assert.Equal("+5511998880001", created.Access.PhoneLogin);
        Assert.InRange(created.InitialPasswordExpiresAtUtc!.Value - f.Clock.GetUtcNow(), TimeSpan.FromHours(23.9), TimeSpan.FromHours(24.1));
        var replay = await Save(owner, teamId, input); Assert.Null(replay.InitialPassword); Assert.Equal(created.Access.UserId, replay.Access.UserId);
        using var bar = f.Client(); var first = await Login(bar, "11998880001", created.InitialPassword!);
        Assert.True(first.User.RequiresLocalPasswordChange); Assert.True(first.User.RequiresFirstAccess); Assert.Empty(first.User.Permissions); Assert.Empty(first.User.Roles);
        bar.DefaultRequestHeaders.Authorization = new("Bearer", first.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, (await bar.GetAsync("/api/v1/bar/catalog")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await bar.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await bar.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, PermanentPassword))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await bar.GetAsync("/api/v1/auth/me")).StatusCode);
        var signedIn = await Login(bar, "+55 (11) 99888-0001", PermanentPassword);
        Assert.Equal(created.Access.UserId, signedIn.User.Id); Assert.Equal(["Operations"], signedIn.User.Roles);
        Assert.Equal("bar", signedIn.User.StaffAccess!.TypeId); Assert.False(signedIn.User.CanManageStaff);
        bar.DefaultRequestHeaders.Authorization = new("Bearer", signedIn.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await bar.GetAsync("/api/v1/bar/catalog")).StatusCode);
        foreach (var url in new[] { "/api/v1/operations/students", "/api/v1/financial-history?month=2026-11", "/api/v1/bar/products", "/api/v1/bar/stock/valuation", "/api/v1/staff-access/context", "/api/v1/me/teaching" })
            Assert.Equal(HttpStatusCode.Forbidden, (await bar.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bar.PostAsJsonAsync($"/api/v1/bar/sales/{Guid.NewGuid()}/refund", new { amount = 1, reason = "teste", operationId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bar.PostAsJsonAsync($"/api/v1/bar/sales/{Guid.NewGuid()}/discount", new { amount = 1, reason = "teste", operationId = Guid.NewGuid() })).StatusCode);
        Guid cashId;
        await using (var db = f.Database.NewContext())
        {
            var location = await db.Set<StockLocation>().SingleAsync(x => x.Name == "Bar");
            cashId = (await new BarCashService(db).Open(new(Guid.Empty, location.Id, "Fixture", 20, Guid.NewGuid()), f.OwnerId, default)).Id;
        }
        Assert.Empty((await bar.GetFromJsonAsync<JsonElement[]>("/api/v1/bar/cash/sessions"))!);
        Assert.Equal("null", await bar.GetStringAsync("/api/v1/bar/cash/current"));
        Assert.Equal(HttpStatusCode.BadRequest, (await bar.PostAsJsonAsync($"/api/v1/bar/cash/sessions/{cashId}/supply", new CashMovementInput(1, "teste", Guid.NewGuid()))).StatusCode);
        await using var verify = f.Database.NewContext();
        var persisted = await verify.Users.SingleAsync(x => x.Id == created.Access.UserId);
        Assert.False(persisted.RequiresFirstAccess); Assert.False(persisted.RequiresLocalPasswordChange);
        Assert.NotEqual(created.InitialPassword, persisted.PasswordHash);
        Assert.Equal(1, await verify.Set<StaffMembership>().CountAsync()); Assert.Equal(1, await verify.Set<StaffAccessOperation>().CountAsync());
        Assert.DoesNotContain(created.InitialPassword!, string.Join("", (await verify.Set<StaffAccessOperation>().ToListAsync()).Select(x => x.RequestHash)));
    }

    [PostgresFact]
    public async Task Type_changes_block_and_reactivation_invalidate_open_sessions_without_restoring_unselected_actions()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var team = Guid.NewGuid(); var created = await Save(owner, team, Member(team, "bar", "11998880002"));
        using var staff = f.Client(); var initial = await Login(staff, "11998880002", created.InitialPassword!);
        staff.DefaultRequestHeaders.Authorization = new("Bearer", initial.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await staff.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, PermanentPassword))).StatusCode);
        var before = await Login(staff, "11998880002", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", before.AccessToken);
        var barType = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "bar");
        var update = await owner.PutAsJsonAsync("/api/v1/staff-access/types/bar", new StaffAccessTypeInput("Recebimento", ["bar.receive"], ["bar.receive"], barType.Version));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await staff.GetAsync("/api/v1/auth/me")).StatusCode);
        var after = await Login(staff, "11998880002", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", after.AccessToken);
        Assert.Equal(["bar.receive"], after.User.StaffAccess!.Menus); Assert.Equal("/atendimento/receber", after.User.StaffAccess.HomePath);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/v1/bar/tabs")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/v1/bar/cash/current")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync("/api/v1/bar/tabs", new { name = "proibido" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync($"/api/v1/bar/tabs/{Guid.NewGuid()}/items", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync("/api/v1/bar/cash/sessions", new { })).StatusCode);
        var status = (await owner.GetFromJsonAsync<StaffMemberAccessStatus>($"/api/v1/staff-access/members/{team}"))!;
        var blocked = await owner.PostAsJsonAsync($"/api/v1/staff-access/members/{team}/block", new StaffMemberCommand(status.Version, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.OK, blocked.StatusCode); status = (await blocked.Content.ReadFromJsonAsync<StaffMemberAccessStatus>())!;
        Assert.False(status.IsActive); Assert.Equal(HttpStatusCode.Unauthorized, (await staff.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await staff.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest("11998880002", PermanentPassword))).StatusCode);
        var active = await owner.PostAsJsonAsync($"/api/v1/staff-access/members/{team}/reactivate", new StaffMemberCommand(status.Version, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.OK, active.StatusCode); Assert.Equal(HttpStatusCode.Unauthorized, (await staff.GetAsync("/api/v1/auth/me")).StatusCode);
        var fresh = await Login(staff, "11998880002", PermanentPassword); staff.DefaultRequestHeaders.Authorization = new("Bearer", fresh.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/v1/auth/me")).StatusCode);
        var generic = await owner.PutAsJsonAsync($"/api/v1/operations/team/{team}", new { id = team, version = 3, name = "Não atômico", status = "Ativo", payAmount = (decimal?)null });
        Assert.Equal(HttpStatusCode.Conflict, generic.StatusCode);
    }

    [PostgresFact]
    public async Task Concurrent_duplicate_phones_commit_exactly_one_person_and_operation_and_replay_has_no_password()
    {
        await using var f = await Fixture.Create(); using var a = f.Client(true); using var b = f.Client(true);
        var team1 = Guid.NewGuid(); var team2 = Guid.NewGuid(); var one = Member(team1, "bar", "11998880003"); var two = Member(team2, "bar", "(11) 99888-0003");
        var responses = await Task.WhenAll(a.PutAsJsonAsync($"/api/v1/staff-access/members/{team1}", one), b.PutAsJsonAsync($"/api/v1/staff-access/members/{team2}", two));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
        var winner = responses[0].IsSuccessStatusCode ? one : two; var team = responses[0].IsSuccessStatusCode ? team1 : team2;
        Assert.Null((await Save(a, team, winner)).InitialPassword);
        Assert.Equal(HttpStatusCode.Conflict, (await a.PutAsJsonAsync($"/api/v1/staff-access/members/{team}", winner with { Access = winner.Access with { PhoneLogin = "11998880004" } })).StatusCode);
        await using var db = f.Database.NewContext();
        Assert.Equal(2, await db.Users.CountAsync()); Assert.Equal(1, await db.OperationalRecords.CountAsync(x => x.Kind == "team"));
        Assert.Equal(1, await db.Set<StaffMembership>().CountAsync()); Assert.Equal(1, await db.Set<StaffAccessOperation>().CountAsync());
    }

    [PostgresFact]
    public async Task Initial_password_expires_after_24_hours_and_reset_is_unique_single_reveal_and_revokes_old_sessions()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true); using var staff = f.Client();
        var team = Guid.NewGuid(); var created = await Save(owner, team, Member(team, "bar", "11998880005"));
        var initial = await Login(staff, "11998880005", created.InitialPassword!); staff.DefaultRequestHeaders.Authorization = new("Bearer", initial.AccessToken);
        f.Clock.Advance(TimeSpan.FromHours(25));
        Assert.Equal(HttpStatusCode.Unauthorized, (await staff.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await staff.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest("11998880005", created.InitialPassword))).StatusCode);
        var command = new StaffMemberCommand(created.Access.Version, Guid.NewGuid());
        var resetResponse = await owner.PostAsJsonAsync($"/api/v1/staff-access/members/{team}/reset", command);
        Assert.Equal(HttpStatusCode.OK, resetResponse.StatusCode); Assert.True(resetResponse.Headers.CacheControl!.NoStore);
        var reset = (await resetResponse.Content.ReadFromJsonAsync<StaffMemberResult>())!;
        Assert.NotNull(reset.InitialPassword); Assert.NotEqual(created.InitialPassword, reset.InitialPassword);
        Assert.Equal(f.Clock.GetUtcNow().AddHours(24), reset.InitialPasswordExpiresAtUtc);
        var replay = await owner.PostAsJsonAsync($"/api/v1/staff-access/members/{team}/reset", command);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode); Assert.Null((await replay.Content.ReadFromJsonAsync<StaffMemberResult>())!.InitialPassword);
        Assert.Equal(HttpStatusCode.Unauthorized, (await staff.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest("11998880005", created.InitialPassword))).StatusCode);
        // The reset credential is valid for authentication even though the fixture clock is ahead of JWT validation's wall clock.
        await using var scope = f.Factory.Services.CreateAsyncScope();
        var session = await scope.ServiceProvider.GetRequiredService<IAuthService>().LoginAsync("11998880005", reset.InitialPassword!, null);
        Assert.True(session.Response.User.RequiresLocalPasswordChange); Assert.Equal(created.Access.UserId, session.Response.User.Id);
        await using var db = f.Database.NewContext();
        var tokens = await db.Users.Include(x => x.RefreshTokens).SingleAsync(x => x.Id == created.Access.UserId);
        Assert.Contains(tokens.RefreshTokens, x => x.RevokedAtUtc != null);
    }

    [PostgresFact]
    public async Task Linking_preserves_existing_google_identity_and_last_owner_and_rejects_conflicting_teacher_identity()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        string hash; string subject;
        await using (var db = f.Database.NewContext())
        {
            var user = await db.Users.SingleAsync(x => x.Id == f.OwnerId); subject = "fixture-google-" + Guid.NewGuid().ToString("N"); user.LinkGoogle(subject, "owner@example.invalid"); hash = user.PasswordHash; await db.SaveChangesAsync();
        }
        var team = Guid.NewGuid(); var linked = await Save(owner, team, Member(team, "gestor", "11998880006", "link", f.OwnerId));
        Assert.Null(linked.InitialPassword); Assert.True(linked.Access.GoogleLinked); Assert.True(linked.Access.IsOwner);
        // Linking invalidates the old owner's session as well; obtain the real current credential version for subsequent commands.
        owner.DefaultRequestHeaders.Authorization = new("Bearer", await f.Token(f.OwnerId));
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsJsonAsync($"/api/v1/staff-access/members/{team}/block", new StaffMemberCommand(linked.Access.Version, Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsJsonAsync($"/api/v1/staff-access/members/{team}/reset", new StaffMemberCommand(linked.Access.Version, Guid.NewGuid()))).StatusCode);
        await using (var db = f.Database.NewContext())
        {
            var user = await db.Users.SingleAsync(x => x.Id == f.OwnerId); Assert.Equal(subject, user.GoogleSubject); Assert.Equal(hash, user.PasswordHash); Assert.False(user.RequiresFirstAccess); Assert.True(user.IsActive);
        }
        Guid teacherId;
        await using (var db = f.Database.NewContext())
        {
            var user = User.Create("Professor legado", "teacher@example.invalid", "existing-hash"); user.AssignRole(await db.Roles.SingleAsync(x => x.Name == "Teacher")); teacherId = user.Id;
            var legacyTeam = Guid.NewGuid(); db.AddRange(user, Row(legacyTeam, "team", new { id = legacyTeam, name = "Professor legado", status = "Ativo" }), Row(Guid.NewGuid(), "teacherLinks", new { userId = teacherId, teamId = legacyTeam })); await db.SaveChangesAsync();
        }
        var otherTeam = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PutAsJsonAsync($"/api/v1/staff-access/members/{otherTeam}", Member(otherTeam, "professor", "11998880007", "link", teacherId))).StatusCode);
        await using var verify = f.Database.NewContext(); Assert.False(await verify.OperationalRecords.AnyAsync(x => x.Id == otherTeam)); Assert.False(await verify.Set<StaffMembership>().AnyAsync(x => x.UserId == teacherId));
    }

    [PostgresFact]
    public async Task Professor_has_only_own_classes_and_presence_while_dependencies_hide_contacts_pay_and_financial_details()
    {
        await using var f = await Fixture.Create(); using var owner = f.Client(true);
        var team = Guid.NewGuid(); var created = await Save(owner, team, Member(team, "professor", "11998880008"));
        using var teacher = f.Client(); var first = await Login(teacher, "11998880008", created.InitialPassword!); teacher.DefaultRequestHeaders.Authorization = new("Bearer", first.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await teacher.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(created.InitialPassword, PermanentPassword))).StatusCode);
        var session = await Login(teacher, "11998880008", PermanentPassword); teacher.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        var date = DateOnly.FromDateTime(f.Clock.GetUtcNow().UtcDateTime.AddHours(-3)); var cls = Guid.NewGuid(); var foreign = Guid.NewGuid(); var student = Guid.NewGuid();
        await using (var db = f.Database.NewContext())
        {
            db.AddRange(Row(cls, "classes", new { name = "Minha turma", teacherId = team, weekDay = (int)date.DayOfWeek, startDate = date.AddDays(-7).ToString("yyyy-MM-dd"), startTime = "08:00", endTime = "09:00", status = "Ativa", capacity = 6 }),
                Row(foreign, "classes", new { name = "Turma de outro professor", teacherId = Guid.NewGuid(), weekDay = (int)date.DayOfWeek, startDate = date.AddDays(-7).ToString("yyyy-MM-dd"), startTime = "10:00", endTime = "11:00", status = "Ativa", capacity = 6 }),
                Row(student, "students", new { name = "Aluno", phone = "private-contact", notes = "private-notes", monthlyAmount = 999 }),
                Row(Guid.NewGuid(), "enrollments", new { classId = cls, studentId = student, startDate = date.AddDays(-7).ToString("yyyy-MM-dd"), status = "Ativa" })); await db.SaveChangesAsync();
        }
        var overview = (await teacher.GetFromJsonAsync<TeachingOverview>("/api/v1/me/teaching"))!; Assert.True(overview.Linked); Assert.Equal(cls, Assert.Single(overview.Classes).Id);
        Assert.Equal(HttpStatusCode.NotFound, (await teacher.GetAsync($"/api/v1/me/teaching/classes/{foreign}?date={date:yyyy-MM-dd}")).StatusCode);
        var rosterResponse = await teacher.GetAsync($"/api/v1/me/teaching/classes/{cls}?date={date:yyyy-MM-dd}"); Assert.Equal(HttpStatusCode.OK, rosterResponse.StatusCode);
        var json = await rosterResponse.Content.ReadAsStringAsync(); Assert.DoesNotContain("private-", json); Assert.DoesNotContain("monthlyAmount", json);
        Assert.Equal(HttpStatusCode.OK, (await teacher.PutAsJsonAsync($"/api/v1/me/teaching/classes/{cls}/presences?date={date:yyyy-MM-dd}", new PresenceInput(student, "Presente", 0))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.GetAsync("/api/v1/operations/students")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.PutAsJsonAsync("/api/v1/teaching/access", new TeacherLink(session.User.Id, Guid.NewGuid()))).StatusCode);
        // A staff member who can operate only the agenda gets selector dependencies, never team salary or contact fields.
        var type = (await owner.GetFromJsonAsync<StaffAccessTypeSummary[]>("/api/v1/staff-access/types"))!.Single(x => x.Id == "atendente");
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync("/api/v1/staff-access/types/atendente", new StaffAccessTypeInput("Agenda", ["agenda"], ["agenda.operate"], type.Version))).StatusCode);
        var helperTeam = Guid.NewGuid(); var helper = await Save(owner, helperTeam, Member(helperTeam, "atendente", "11998880009"));
        using var agenda = f.Client(); var bootstrap = await Login(agenda, "11998880009", helper.InitialPassword!); agenda.DefaultRequestHeaders.Authorization = new("Bearer", bootstrap.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await agenda.PostAsJsonAsync("/api/v1/auth/change-password", new ChangePasswordRequest(helper.InitialPassword, PermanentPassword))).StatusCode);
        var current = await Login(agenda, "11998880009", PermanentPassword); agenda.DefaultRequestHeaders.Authorization = new("Bearer", current.AccessToken);
        var dependency = await agenda.GetAsync("/api/v1/operations/team"); Assert.Equal(HttpStatusCode.OK, dependency.StatusCode); var payload = await dependency.Content.ReadAsStringAsync();
        Assert.DoesNotContain("phone", payload); Assert.DoesNotContain("payAmount", payload); Assert.DoesNotContain("notes", payload);
    }

    private static StaffMemberInput Member(Guid team, string type, string phone, string mode = "create", Guid? userId = null) =>
        new(JsonSerializer.SerializeToElement(new { id = team, version = 0, name = "Equipe fictícia", phone, role = type == "professor" ? "Professor" : "Atendimento", status = "Ativo", payAmount = (decimal?)null, notes = "private-team-notes" }),
            new(mode, type, phone, UserId: userId), Guid.NewGuid());
    private static OperationalRecord Row(Guid id, string kind, object value)
    {
        var payload = System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(value))!.AsObject(); payload["id"] = id.ToString(); payload["version"] = 0;
        var name = payload["name"]?.GetValue<string>() ?? "Fixture"; return new(id, kind, name, payload.ToJsonString());
    }
    private static async Task<StaffMemberResult> Save(HttpClient client, Guid team, StaffMemberInput input)
    {
        var response = await client.PutAsJsonAsync($"/api/v1/staff-access/members/{team}", input); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore); return (await response.Content.ReadFromJsonAsync<StaffMemberResult>())!;
    }
    private static async Task<AuthResponse> Login(HttpClient client, string phone, string password)
    {
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(phone, password)); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }
    private sealed class MutableClock : TimeProvider
    {
        private DateTimeOffset now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan duration) => now += duration;
    }
    private sealed class Fixture(IsolatedMaterialDatabase database, WebApplicationFactory<Program> factory, Guid owner, MutableClock clock) : IAsyncDisposable
    {
        public IsolatedMaterialDatabase Database => database;
        public WebApplicationFactory<Program> Factory => factory;
        public Guid OwnerId => owner;
        public MutableClock Clock => clock;
        public HttpClient Client(bool asOwner = false)
        {
            var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("Origin", "https://longbeach.test");
            if (asOwner) client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(owner, ["Manager"], registerUser: false));
            return client;
        }
        public async Task<string> Token(Guid userId)
        {
            await using var scope = factory.Services.CreateAsyncScope(); var repository = scope.ServiceProvider.GetRequiredService<IUserRepository>();
            var user = (await repository.FindByIdAsync(userId))!; var principal = new TokenPrincipal(user.Id, user.Name, user.Email, user.GetRoleNames(), user.GetPermissionNames(), CredentialVersion: user.CredentialVersion);
            return scope.ServiceProvider.GetRequiredService<ITokenService>().Issue(principal, DateTimeOffset.UtcNow).AccessToken;
        }
        public async ValueTask DisposeAsync() { await factory.DisposeAsync(); await database.DisposeAsync(); }
        public static async Task<Fixture> Create()
        {
            var isolated = await IsolatedMaterialDatabase.Create(); WebApplicationFactory<Program>? factory = null; var clock = new MutableClock();
            try
            {
                var owner = User.Create("Dono fixture", "owner@example.invalid", "existing-owner-password-hash"); owner.AssignRole(new Role("Manager"));
                isolated.Context.Add(owner); isolated.Context.AddRange(new Role("Teacher"), new Role("Operations"), new Role("Student")); await isolated.Context.SaveChangesAsync();
                factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:LongBeach"] = isolated.Connection, ["BackgroundJobs:Enabled"] = "false", ["Authentication:Local:Enabled"] = "true", ["StaffAccess:OwnerUserIds:0"] = owner.Id.ToString()
                })).ConfigureServices(services =>
                {
                    services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(isolated.Connection)); services.AddScoped<IUserRepository, UserRepository>(); services.AddScoped<IAuthService, AuthService>(); services.AddSingleton<TimeProvider>(clock);
                }));
                return new(isolated, factory, owner.Id, clock);
            }
            catch { if (factory is not null) await factory.DisposeAsync(); await isolated.DisposeAsync(); throw; }
        }
    }
}
