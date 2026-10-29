using System.Net;
using System.Net.Http.Json;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using LongBeach.Contracts.Customers;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Customers;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class CustomerRegistryPostgresTests
{
    private static CustomerService Service(LongBeachDbContext db) => new(db, TimeProvider.System);
    private static readonly Guid Actor = Guid.Parse("ee84fc77-449d-4394-8487-bdebcfa93a1a");
    private static CreateCustomerInput Input(string name = "Cliente sintético") => new(Guid.NewGuid(), name, "11999990000");
    private static Task<CustomerDto> Create(LongBeachDbContext db, string name = "Cliente sintético") => Service(db).Create(Input(name), Actor, "directory", default);

    [PostgresFact]
    public async Task Registry_tracks_without_saving_preserves_master_and_rejects_implicit_reassignment()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var source = Guid.NewGuid(); var service = Service(isolated.Context);
        await Assert.ThrowsAsync<CustomerRuleException>(() => service.EnsureSourceAsync(new("students", source, null, "Aluno sintético", "11999990000"), default));
        await using var tx = await isolated.Context.Database.BeginTransactionAsync();
        var first = await service.EnsureSourceAsync(new("students", source, null, "Aluno sintético", "11999990000"), default);
        var again = await service.EnsureSourceAsync(new("students", source, null, "Nome antigo", "", AllowIncomplete: true), default);
        Assert.Equal(first, again); Assert.NotEqual(source, first.Id);
        await using (var reader = isolated.NewContext()) Assert.Empty(await reader.Set<Customer>().ToArrayAsync());
        await isolated.Context.SaveChangesAsync(); await tx.CommitAsync();
        var other = await Create(isolated.Context, "Outra pessoa");
        await using var tx2 = await isolated.Context.Database.BeginTransactionAsync();
        var conflict = await Assert.ThrowsAsync<CustomerRuleException>(() => service.EnsureSourceAsync(new("students", source, null, "", "", CustomerId: other.Id), default));
        Assert.Equal(409, conflict.StatusCode); await tx2.RollbackAsync();
        Assert.Equal(first.Id, (await service.GetSourceAsync("students", source, null, default))!.Id);
    }

    [PostgresFact]
    public async Task Concurrent_ensure_and_create_replay_are_unique_but_shared_phone_does_not_merge_people()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var source = Guid.NewGuid();
        async Task<Guid> Ensure()
        {
            await using var db = isolated.NewContext(); await using var tx = await db.Database.BeginTransactionAsync();
            var value = await Service(db).EnsureSourceAsync(new("students", source, null, "Aluno", "11999990000"), default);
            await db.SaveChangesAsync(); await tx.CommitAsync(); return value.Id;
        }
        var ids = await Task.WhenAll(Ensure(), Ensure()); Assert.Equal(ids[0], ids[1]);
        var input = Input();
        async Task<Guid> Replay() { await using var db = isolated.NewContext(); return (await Service(db).Create(input, Actor, "directory", default)).Id; }
        var created = await Task.WhenAll(Replay(), Replay()); Assert.Equal(created[0], created[1]);
        Assert.NotEqual(ids[0], created[0]); Assert.Equal(2, await isolated.Context.Set<Customer>().CountAsync());
        await Assert.ThrowsAsync<CustomerRuleException>(() => Service(isolated.Context).Create(input with { Name = "Alterado" }, Actor, "directory", default));
        var homonym = await Create(isolated.Context, "Aluno"); Assert.NotEqual(ids[0], homonym.Id);
        var lookup = await Service(isolated.Context).Lookup("(11) 99999-0000", default);
        Assert.Equal(3, lookup.Count); Assert.Equal(3, lookup.Select(x => x.Id).Distinct().Count());
        Assert.Equal(3, (await Service(isolated.Context).Lookup("99999-0000", default)).Count);
        Assert.Equal(2, (await Service(isolated.Context).Lookup("Aluno", default)).Count);
    }

    [PostgresFact]
    public async Task Canonical_update_uses_version_and_inactive_customer_keeps_old_sources_but_rejects_new()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var customer = await Create(isolated.Context);
        var source = Guid.NewGuid();
        await using (var tx = await isolated.Context.Database.BeginTransactionAsync())
        { await Service(isolated.Context).EnsureSourceAsync(new("students", source, null, "", "", CustomerId: customer.Id), default); await isolated.Context.SaveChangesAsync(); await tx.CommitAsync(); }
        await Service(isolated.Context).Update(customer.Id, new(customer.Version, "Corrigido", customer.Phone, null, "Inativo"), default);
        Assert.Equal(409, (await Assert.ThrowsAsync<CustomerRuleException>(() => Service(isolated.Context).Update(customer.Id, new(customer.Version, "Stale", customer.Phone, null, "Ativo"), default))).StatusCode);
        await using var next = isolated.NewContext(); await using var tx2 = await next.Database.BeginTransactionAsync();
        Assert.Equal("Corrigido", (await Service(next).EnsureSourceAsync(new("students", source, null, "Snapshot antigo", "", AllowIncomplete: true), default)).Name);
        await Assert.ThrowsAsync<CustomerRuleException>(() => Service(next).EnsureSourceAsync(new("students", Guid.NewGuid(), null, "", "", CustomerId: customer.Id), default));
    }

    [PostgresFact]
    public async Task Explicit_reassignment_and_tombstone_preserve_history_and_never_resurrect_implicitly()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var a = await Create(isolated.Context); var b = await Create(isolated.Context, "Pessoa B"); var source = Guid.NewGuid();
        await using (var tx = await isolated.Context.Database.BeginTransactionAsync())
        {
            await Service(isolated.Context).SetSourceAsync("barTabs", source, null, a.Id, default);
            await Service(isolated.Context).SetSourceAsync("barTabs", source, null, b.Id, default);
            await Service(isolated.Context).SetSourceAsync("barTabs", source, null, null, default);
            await isolated.Context.SaveChangesAsync(); await tx.CommitAsync();
        }
        Assert.Null(await Service(isolated.Context).GetSourceAsync("barTabs", source, null, default));
        Assert.Equal(3, await isolated.Context.Set<CustomerSourceChange>().CountAsync());
        await using var transaction = await isolated.Context.Database.BeginTransactionAsync();
        Assert.Equal(409, (await Assert.ThrowsAsync<CustomerRuleException>(() => Service(isolated.Context).EnsureSourceAsync(new("barTabs", source, null, "", "", CustomerId: a.Id), default))).StatusCode);
    }

    [PostgresFact]
    public async Task Merge_and_undo_preserve_aliases_source_ids_and_user_identity_even_after_same_target_assignment()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var user = User.Create("Conta sintética", "customer@example.invalid", "unused-test-hash"); isolated.Context.Add(user); await isolated.Context.SaveChangesAsync();
        var a = await Create(isolated.Context, "Origem"); var b = await Create(isolated.Context, "Destino"); var service = Service(isolated.Context);
        a = await service.AssignUser(a.Id, new(user.Id, a.Version), default);
        var sourceId = Guid.NewGuid();
        await using (var tx = await isolated.Context.Database.BeginTransactionAsync())
        { await service.EnsureSourceAsync(new("rentalMembers", sourceId, Guid.Parse("a9987c33-bef0-4e40-8b29-b1e68db30120"), "", "", CustomerId: a.Id), default); await isolated.Context.SaveChangesAsync(); await tx.CommitAsync(); }
        var preview = await service.PreviewMerge(new(a.Id, b.Id), default); Assert.True(preview.CanMerge);
        var input = new CustomerMergeInput(Guid.NewGuid(), a.Id, b.Id, preview.SourceVersion, preview.TargetVersion, preview.PreviewToken, "Conferência sintética");
        var merge = await service.Merge(input, Actor, default); Assert.Equal(merge, await service.Merge(input, Actor, default));
        Assert.Equal(b.Id, (await service.ResolveAsync(a.Id, default))!.Id); Assert.Equal(b.Id, (await service.Self(user.Id, default))!.Id);
        Assert.Equal(b.Id, Assert.Single((await service.List("Origem", null, null, null, 1, 20, default)).Items).Id);
        await using (var historyReader = isolated.NewContext())
        {
            var history = Assert.Single(await Service(historyReader).Merges(b.Id, default));
            Assert.Equal(merge.MergeId, history.MergeId); Assert.False(history.Undone);
        }
        var current = await service.Get(b.Id, default); current = await service.AssignUser(b.Id, new(user.Id, current.Version), default);
        var undo = new CustomerUndoInput(Guid.NewGuid(), merge.SourceVersion, current.Version);
        var undone = await service.Undo(merge.MergeId, undo, Actor, default); Assert.True(undone.Undone);
        Assert.Equal(undone, await service.Undo(merge.MergeId, undo, Actor, default));
        Assert.True(Assert.Single(await service.Merges(a.Id, default)).Undone);
        Assert.Equal(a.Id, (await service.Self(user.Id, default))!.Id); Assert.Equal(a.Id, (await service.GetSourceAsync("users", user.Id, null, default))!.Id);
        Assert.Equal(a.Id, (await service.GetSourceAsync("rentalMembers", sourceId, Guid.Parse("a9987c33-bef0-4e40-8b29-b1e68db30120"), default))!.Id);
        Assert.Equal(2, await isolated.Context.Set<Customer>().CountAsync()); Assert.Empty(await isolated.Context.Set<LongBeach.Domain.Billing.BillingAccount>().ToArrayAsync());
    }

    [PostgresFact]
    public async Task Distinct_users_block_merge_and_stale_preview_cannot_apply()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var service = Service(isolated.Context);
        var a = await Create(isolated.Context, "A"); var b = await Create(isolated.Context, "B"); var p = await service.PreviewMerge(new(a.Id, b.Id), default);
        b = await service.Update(b.Id, new(b.Version, "B corrigido", b.Phone, b.Email, "Ativo"), default);
        Assert.Equal(409, (await Assert.ThrowsAsync<CustomerRuleException>(() => service.Merge(new(Guid.NewGuid(), a.Id, b.Id, p.SourceVersion, p.TargetVersion, p.PreviewToken, "Teste"), Actor, default))).StatusCode);
        var u1 = User.Create("Um", "one@example.invalid", "test"); var u2 = User.Create("Dois", "two@example.invalid", "test"); isolated.Context.AddRange(u1, u2); await isolated.Context.SaveChangesAsync();
        await service.AssignUser(a.Id, new(u1.Id, a.Version), default); await service.AssignUser(b.Id, new(u2.Id, b.Version), default);
        Assert.False((await service.PreviewMerge(new(a.Id, b.Id), default)).CanMerge);
    }

    [PostgresFact]
    public async Task Self_get_has_no_write_and_explicit_save_is_idempotent_without_changing_authentication()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var service = Service(isolated.Context);
        var user = User.Create("Nome Google", "login@example.invalid", "test"); user.LinkGoogle("synthetic-subject", user.Email); isolated.Context.Add(user); await isolated.Context.SaveChangesAsync();
        Assert.Null(await service.Self(user.Id, default)); Assert.Empty(await isolated.Context.Set<Customer>().ToArrayAsync());
        var input = new SelfCustomerInput(Guid.NewGuid(), "Contato cadastral", "11999990000");
        var value = await service.SaveSelf(user.Id, input, default); Assert.Equal(value.Id, (await service.SaveSelf(user.Id, input, default)).Id);
        var next = await service.SaveSelf(user.Id, new(Guid.NewGuid(), "Contato atualizado", value.Phone, ExpectedVersion: value.Version), default);
        Assert.Equal(409, (await Assert.ThrowsAsync<CustomerRuleException>(() => service.SaveSelf(user.Id, new(Guid.NewGuid(), "Antigo", value.Phone, ExpectedVersion: value.Version), default))).StatusCode);
        Assert.Equal("Nome Google", (await isolated.Context.Users.SingleAsync()).Name); Assert.Equal("login@example.invalid", (await isolated.Context.Users.SingleAsync()).Email);
        Assert.Equal(next.Id, (await service.GetSourceAsync("users", user.Id, null, default))!.Id);
    }

    [PostgresFact]
    public async Task Self_retry_cannot_disclose_a_former_customer_after_administrative_user_reassignment()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var service = Service(isolated.Context);
        var user = User.Create("Pessoa", "self-reassigned@example.invalid", "test"); isolated.Context.Add(user); await isolated.Context.SaveChangesAsync();
        var input = new SelfCustomerInput(Guid.NewGuid(), "Antigo contato", "11999990000");
        var original = await service.SaveSelf(user.Id, input, default);
        await service.AssignUser(original.Id, new(null, original.Version), default);
        var other = await Create(isolated.Context, "Contato atual");
        other = await service.AssignUser(other.Id, new(user.Id, other.Version), default);
        Assert.Equal(409, (await Assert.ThrowsAsync<CustomerRuleException>(() => service.SaveSelf(user.Id, input, default))).StatusCode);
        Assert.Equal(other.Id, (await service.Self(user.Id, default))!.Id);
        Assert.Equal(other.Id, (await service.GetSourceAsync("users", user.Id, null, default))!.Id);
    }

    [PostgresFact]
    public async Task Backfill_preview_has_no_writes_apply_is_idempotent_and_does_not_guess_shared_contacts()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var first = Guid.NewGuid(); var second = Guid.NewGuid(); var group = Guid.NewGuid(); var member = Guid.NewGuid();
        var payloads = new[] { new OperationalRecord(first, "students", "Aluno A", JsonSerializer.Serialize(new { name = "Aluno A", phone = "" })),
            new OperationalRecord(second, "students", "Aluno B", JsonSerializer.Serialize(new { name = "Aluno B", phone = "11999990000" })),
            new OperationalRecord(group, "rentalGroups", "Grupo", JsonSerializer.Serialize(new { name = "Grupo", members = new[] { new { id = member, name = "Aluno B", phone = "11999990000" } } })) };
        isolated.Context.AddRange(payloads); await isolated.Context.SaveChangesAsync();
        var before = await isolated.Context.OperationalRecords.AsNoTracking().OrderBy(x => x.Id).Select(x => x.Payload).ToArrayAsync();
        var service = Service(isolated.Context); var preview = await service.PreviewBackfill(default);
        Assert.Equal(3, preview.Create); Assert.Equal(1, preview.Incomplete); Assert.Empty(preview.Conflicts); Assert.Empty(await isolated.Context.Set<Customer>().ToArrayAsync());
        var input = new CustomerBackfillInput(Guid.NewGuid(), preview.PreviewToken); var result = await service.ApplyBackfill(input, Actor, default);
        Assert.Equal(3, result.Created); Assert.Equal(result, await service.ApplyBackfill(input, Actor, default));
        var secondPreview = await service.PreviewBackfill(default); Assert.Equal(0, secondPreview.Create); Assert.Equal(3, secondPreview.Existing);
        Assert.Equal(0, (await service.ApplyBackfill(new(Guid.NewGuid(), secondPreview.PreviewToken), Actor, default)).Linked);
        Assert.Equal(before, await isolated.Context.OperationalRecords.AsNoTracking().OrderBy(x => x.Id).Select(x => x.Payload).ToArrayAsync());
        Assert.NotEqual((await service.GetSourceAsync("students", second, null, default))!.Id, (await service.GetSourceAsync("rentalMembers", member, group, default))!.Id);
        Assert.Single((await service.List(null, "Aluno", true, null, 1, 20, default)).Items);
    }

    [PostgresFact]
    public async Task Backfill_uses_only_explicit_people_and_never_confuses_consumer_with_guardian_or_payer()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var studentRole = new Role(SystemRoles.Student); var teacherRole = new Role(SystemRoles.Teacher);
        var studentUser = User.Create("Cliente Google", "student@example.invalid", "test"); studentUser.LinkGoogle("student-subject", studentUser.Email); studentUser.AssignRole(studentRole);
        var teacher = User.Create("Professor", "teacher@example.invalid", "test"); teacher.LinkGoogle("teacher-subject", teacher.Email); teacher.AssignRole(teacherRole);
        var guardian = User.Create("Responsável", "guardian@example.invalid", "test"); guardian.LinkGoogle("guardian-subject", guardian.Email);
        var payer = User.Create("Cliente Bar", "payer@example.invalid", "test");
        var location = new LongBeach.Domain.Inventory.StockLocation("Balcão sintético");
        var payerTab = new LongBeach.Domain.Bar.BarTab(location.Id, Actor, "Mesa com pagador identificado", "Tab");
        var memberTab = new LongBeach.Domain.Bar.BarTab(location.Id, Actor, "Mesa de integrante", "Tab");
        var explicitTab = new LongBeach.Domain.Bar.BarTab(location.Id, Actor, "Identificação já explícita", "Tab");
        var anonymous = new LongBeach.Domain.Bar.BarTab(location.Id, Actor, "Nome livre não é pessoa", "Tab");
        var studentId = Guid.NewGuid(); var groupId = Guid.NewGuid(); var memberId = Guid.NewGuid();
        isolated.Context.AddRange(studentRole, teacherRole, studentUser, teacher, guardian, payer, location, payerTab, memberTab, explicitTab, anonymous,
            new OperationalRecord(studentId, "students", "Aluno dependente", "{\"name\":\"Aluno dependente\",\"phone\":\"\"}"),
            new OperationalRecord(groupId, "rentalGroups", "Grupo sintético", JsonSerializer.Serialize(new { name = "Grupo sintético", members = new[] { new { id = memberId, name = "Consumidor integrante", phone = "31999990000" } } })),
            new OperationalRecord(Guid.NewGuid(), "rentalBarLinks", "Vínculo", JsonSerializer.Serialize(new { tabId = memberTab.Id, rentalGroupId = groupId, memberId })),
            new OperationalRecord(Guid.NewGuid(), "rentalBarLinks", "Vínculo", JsonSerializer.Serialize(new { tabId = explicitTab.Id, rentalGroupId = groupId, memberId })),
            new LongBeach.Domain.Billing.BillingAccount("Quadra", Guid.NewGuid(), guardian.Id, studentId, Actor),
            new LongBeach.Domain.Billing.BillingAccount("Bar", payerTab.Id, payer.Id, null, Actor),
            new LongBeach.Domain.Billing.BillingAccount("Bar", memberTab.Id, payer.Id, null, Actor),
            new LongBeach.Domain.Billing.BillingAccount("Bar", explicitTab.Id, payer.Id, null, Actor));
        await isolated.Context.SaveChangesAsync(); var service = Service(isolated.Context);
        // Contacts may already exist while old Bar records still need only source bridges.
        var own = await service.SaveSelf(studentUser.Id, new(Guid.NewGuid(), studentUser.Name, "11999990000"), default);
        await service.SaveSelf(payer.Id, new(Guid.NewGuid(), payer.Name, "21999990000"), default);
        explicitTab.IdentifyCustomer(own.Id); await isolated.Context.SaveChangesAsync();
        await using (var tx = await isolated.Context.Database.BeginTransactionAsync())
        {
            await service.EnsureSourceAsync(new("students", studentId, null, "Aluno dependente", "", AllowIncomplete: true), default);
            await service.EnsureSourceAsync(new("rentalMembers", memberId, groupId, "Consumidor integrante", "31999990000"), default);
            await isolated.Context.SaveChangesAsync(); await tx.CommitAsync();
        }
        var before = await isolated.Context.OperationalRecords.AsNoTracking().OrderBy(x => x.Id).Select(x => x.Payload).ToArrayAsync();
        var preview = await service.PreviewBackfill(default); Assert.Equal(7, preview.Sources); Assert.Equal(0, preview.Create); Assert.Equal(4, preview.Existing); Assert.Empty(preview.Conflicts);
        var applied = await service.ApplyBackfill(new(Guid.NewGuid(), preview.PreviewToken), Actor, default);
        Assert.Equal(0, applied.Created); Assert.Equal(3, applied.Linked);
        var payerCustomer = (await service.GetSourceAsync("users", payer.Id, null, default))!;
        var memberCustomer = (await service.GetSourceAsync("rentalMembers", memberId, groupId, default))!;
        Assert.NotEqual(payerCustomer.Id, memberCustomer.Id);
        Assert.Equal(payerCustomer.Id, (await service.GetSourceAsync("barTabs", payerTab.Id, null, default))!.Id);
        Assert.Equal(memberCustomer.Id, (await service.GetSourceAsync("barTabs", memberTab.Id, null, default))!.Id);
        Assert.Equal(own.Id, (await service.GetSourceAsync("barTabs", explicitTab.Id, null, default))!.Id);
        Assert.Null(await service.GetSourceAsync("barTabs", anonymous.Id, null, default));
        Assert.Null(await service.Self(guardian.Id, default)); Assert.Null(await service.Self(teacher.Id, default));
        Assert.NotEqual(own.Id, (await service.GetSourceAsync("students", studentId, null, default))!.Id);
        Assert.Equal(4, await isolated.Context.Set<LongBeach.Domain.Billing.BillingAccount>().CountAsync());
        Assert.Null((await isolated.Context.Set<LongBeach.Domain.Bar.BarTab>().AsNoTracking().SingleAsync(x => x.Id == payerTab.Id)).CustomerId);
        var tabsService = new LongBeach.Infrastructure.Bar.BarTabsService(isolated.Context, new DisabledGateway(), TimeProvider.System, new ConfigurationBuilder().Build());
        Assert.Equal(payerCustomer.Id, (await tabsService.Get(payerTab.Id, false, default)).Customer!.Id);
        Assert.Equal(memberCustomer.Id, (await tabsService.Get(memberTab.Id, false, default)).Customer!.Id);
        Assert.Equal(own.Id, (await tabsService.Get(explicitTab.Id, false, default)).Customer!.Id);
        Assert.Equal(before, await isolated.Context.OperationalRecords.AsNoTracking().OrderBy(x => x.Id).Select(x => x.Payload).ToArrayAsync());
    }

    [PostgresFact]
    public async Task Backfill_reports_invalid_unpreservable_contact_and_refuses_partial_apply()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var id = Guid.NewGuid();
        isolated.Context.Add(new OperationalRecord(id, "students", "Origem", JsonSerializer.Serialize(new { name = "Origem", phone = new string('1', 41) }))); await isolated.Context.SaveChangesAsync();
        var service = Service(isolated.Context); var preview = await service.PreviewBackfill(default); Assert.Single(preview.Conflicts);
        Assert.Equal(id, preview.Conflicts[0].SourceId); Assert.DoesNotContain(new string('1', 41), preview.Conflicts[0].Reason);
        Assert.Equal(409, (await Assert.ThrowsAsync<CustomerRuleException>(() => service.ApplyBackfill(new(Guid.NewGuid(), preview.PreviewToken), Actor, default))).StatusCode);
        Assert.Empty(await isolated.Context.Set<Customer>().ToArrayAsync());
    }

    [PostgresFact]
    public async Task Upgrade_preserves_existing_json_and_seeds_only_catalogue_grants_with_immutable_history()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(previousVersion: true);
        var owner = new Role(SystemRoles.Owner); var operations = new Role(SystemRoles.Operations); var viewer = new Role(SystemRoles.Viewer);
        isolated.Context.AddRange(owner, operations, viewer); var id = Guid.NewGuid();
        isolated.Context.Add(new OperationalRecord(id, "students", "Legado", "{\"name\":\"Legado\",\"phone\":\"\",\"monthlyAmount\":123}")); await isolated.Context.SaveChangesAsync();
        var before = (await isolated.Context.OperationalRecords.AsNoTracking().SingleAsync()).Payload;
        await isolated.Context.Database.MigrateAsync(); Assert.Equal(30, (await isolated.Context.Database.GetAppliedMigrationsAsync()).Count());
        Assert.Equal(before, (await isolated.Context.OperationalRecords.AsNoTracking().SingleAsync()).Payload); Assert.Empty(await isolated.Context.Set<Customer>().ToArrayAsync());
        Assert.Equal(3, await isolated.Context.RolePermissions.CountAsync(x => x.RoleId == owner.Id)); Assert.Equal(2, await isolated.Context.RolePermissions.CountAsync(x => x.RoleId == operations.Id));
        Assert.Equal(0, await isolated.Context.RolePermissions.CountAsync(x => x.RoleId == viewer.Id));
        var customer = await Create(isolated.Context); var receipt = await isolated.Context.Set<CustomerOperation>().SingleAsync();
        await using (var downgrade = isolated.NewContext())
        {
            var error = await Assert.ThrowsAnyAsync<Exception>(() => downgrade.GetService<IMigrator>().MigrateAsync("20261027135728_MaterialStockLedger"));
            var databaseError = Assert.IsType<Npgsql.PostgresException>(error.GetBaseException());
            Assert.Equal("55000", databaseError.SqlState);
            Assert.Contains("Customer registry is already in use", databaseError.MessageText);
        }
        await using (var preserved = isolated.NewContext())
        {
            Assert.Equal(customer.Id, (await preserved.Set<Customer>().SingleAsync()).Id);
            Assert.Contains("20261029121159_UnifiedCustomers", await preserved.Database.GetAppliedMigrationsAsync());
            Assert.Single(await preserved.Set<CustomerOperation>().ToArrayAsync());
        }
        Assert.Equal("55000", (await Assert.ThrowsAsync<Npgsql.PostgresException>(() => isolated.Context.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM customer_operations WHERE \"Id\"={receipt.Id}"))).SqlState);
        receipt.MarkUpdated(DateTimeOffset.UtcNow);
        await Assert.ThrowsAsync<CustomerRuleException>(() => isolated.Context.SaveChangesAsync());
    }

    [PostgresFact]
    public async Task Http_scoped_lookup_never_exposes_full_directory_or_foreign_contexts_and_audit_omits_contact()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var customer = await Create(isolated.Context, "Pessoa reservada");
        await using (var tx = await isolated.Context.Database.BeginTransactionAsync())
        { await Service(isolated.Context).EnsureSourceAsync(new("rentalMembers", Guid.NewGuid(), Guid.NewGuid(), "", "", CustomerId: customer.Id), default); await isolated.Context.SaveChangesAsync(); await tx.CommitAsync(); }
        await using var factory = Factory(isolated); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("BarOperator", "bar:sales:operate", "bar:sales:read"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/customers")).StatusCode);
        var lookup = (await client.GetFromJsonAsync<CustomerLookup[]>("/api/v1/customers/lookup?scope=bar&search=Pessoa"))!;
        Assert.Single(lookup); Assert.DoesNotContain(customer.Phone, JsonSerializer.Serialize(lookup));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/customers/{customer.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/customers?scope=students", Input())).StatusCode);
        var createInput = Input("Contato privado");
        var posted = await client.PostAsJsonAsync("/api/v1/customers?scope=bar", createInput); Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
        var created = (await posted.Content.ReadFromJsonAsync<JsonElement>());
        Assert.False(created.TryGetProperty("phone", out _)); Assert.False(created.TryGetProperty("email", out _)); Assert.False(created.TryGetProperty("userId", out _));
        var createdId = created.GetProperty("id").GetGuid();
        await using (var manager = isolated.NewContext())
        {
            var current = await Service(manager).Get(createdId, default);
            await Service(manager).Update(createdId, new(current.Version, current.Name, "21988887777", "private-contact@example.invalid", "Ativo"), default);
        }
        var replay = await client.PostAsJsonAsync("/api/v1/customers?scope=bar", createInput); Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        var replayJson = await replay.Content.ReadAsStringAsync();
        Assert.DoesNotContain("21988887777", replayJson); Assert.DoesNotContain("private-contact@example.invalid", replayJson);
        Assert.DoesNotContain("userId", replayJson); Assert.Contains("phoneHint", replayJson);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("Operations", "customers:read", "customers:write"));
        Assert.Empty((await client.GetFromJsonAsync<CustomerLinkDto[]>($"/api/v1/customers/{customer.Id}/links"))!);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/customers/duplicates")).StatusCode);
        await using var reader = isolated.NewContext(); var audits = await reader.AuditLogs.Where(x => x.Resource.StartsWith("Customer")).Select(x => x.MetadataJson).ToArrayAsync();
        Assert.NotEmpty(audits); Assert.All(audits, json => { Assert.DoesNotContain("Contato privado", json); Assert.DoesNotContain("11999990000", json); Assert.DoesNotContain("ResponseJson", json); });
    }

    [Theory]
    [InlineData("Operations", true)]
    [InlineData("Student", true)]
    public async Task User_association_requires_management_and_users_permission_even_with_customized_claims(string role, bool usersPermission)
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var permissions = new List<string> { "customers:read", "customers:write", "customers:merge" };
        if (usersPermission) permissions.Add("users:manage");
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(role, permissions.ToArray()));
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/customers/{id}/user-candidates?search=Pessoa")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/v1/customers/{id}/user", new CustomerUserInput(Guid.NewGuid(), 1))).StatusCode);
    }

    private static Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> Factory(IsolatedMaterialDatabase isolated) => new LongBeachWebApplicationFactory().WithWebHostBuilder(b =>
        b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:LongBeach"] = isolated.Connection, ["BackgroundJobs:Enabled"] = "false" }))
        .ConfigureServices(s => s.AddDbContext<LongBeachDbContext>(o => o.UseNpgsql(isolated.Connection))));
    private sealed class DisabledGateway : LongBeach.Application.Bar.IPaymentGateway
    {
        public bool Enabled => false;
        public Task<LongBeach.Application.Bar.GatewayPayment> CreatePix(Guid paymentId, Guid operationId, decimal amount, DateTimeOffset expires, LongBeach.Application.Bar.PixCustomer customer, CancellationToken ct) => throw new InvalidOperationException("External payment calls forbidden in customer test.");
        public Task<LongBeach.Application.Bar.GatewayPayment> Get(string orderId, CancellationToken ct) => throw new InvalidOperationException("External payment calls forbidden in customer test.");
        public Task<LongBeach.Application.Bar.GatewayPayment> Refund(string orderId, Guid operationId, decimal amount, CancellationToken ct) => throw new InvalidOperationException("External payment calls forbidden in customer test.");
        public bool VerifyWebhook(byte[] body, IEnumerable<string> signatures) => false;
    }
    private static string Token(string role, params string[] permissions)
    {
        var claims = new[] { new Claim("sub", Actor.ToString()), new Claim(ClaimTypes.Role, role) }.Concat(permissions.Select(p => new Claim("permission", p)));
        var key = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256);
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", claims, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), key));
    }
}
