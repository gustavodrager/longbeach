using System.Text.Json;
using LongBeach.Contracts.Customers;
using LongBeach.Contracts.Portal;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Customers;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Infrastructure.Portal;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace LongBeach.IntegrationTests;

public sealed class CustomerGuardianPostgresTests
{
    private sealed class Clock : TimeProvider { public override DateTimeOffset GetUtcNow() => new(2026, 11, 2, 12, 0, 0, TimeSpan.Zero); }
    private static readonly Clock Time = new();
    private static OperationalRecord Row(Guid id, string kind, object body) => new(id, kind, "Fixture", JsonSerializer.Serialize(body));
    private static CustomerGuardianService Guardians(LongBeachDbContext db) => new(db, Time);
    private static ClientPortalService Portal(LongBeachDbContext db) => new(db, Time, new ConfigurationBuilder().Build());
    private static async Task<User> Account(LongBeachDbContext db, string name, string role = "Student")
    {
        var profile = db.Roles.Local.SingleOrDefault(row => row.Name == role) ?? await db.Roles.SingleOrDefaultAsync(row => row.Name == role) ?? new Role(role);
        var user = User.Create(name, Guid.NewGuid().ToString("N") + "@example.invalid", "fixture-only");
        user.AssignRole(profile); db.Add(user); return user;
    }
    private sealed record Fixture(Customer Child, User Guardian, User Other, Guid Student, Guid Class, Guid Enrollment, Guid Court);
    private static async Task<Fixture> Seed(LongBeachDbContext db)
    {
        var parent = await Account(db, "Responsável sem Google"); var other = await Account(db, "Outra pessoa");
        var child = new Customer("Dependente de teste", "11955550123", null, "fixture"); db.Add(child);
        var student = Guid.NewGuid(); var cls = Guid.NewGuid(); var enrollment = Guid.NewGuid(); var court = Guid.NewGuid(); var teacher = Guid.NewGuid();
        db.AddRange(new CustomerSourceLink("students", student, Guid.Empty, child.Id),
            Row(student, "students", new { id = student, name = child.Name, customerId = child.Id, monthlyAmount = 0 }),
            Row(court, "courts", new { id = court, name = "Quadra de teste", status = "Disponível", scheduleConfirmed = true, openingTime = "06:00", closingTime = "23:00" }),
            Row(teacher, "team", new { id = teacher, name = "Professor de teste", status = "Ativo" }),
            Row(cls, "classes", new { id = cls, name = "Turma do dependente", courtId = court, teacherId = teacher, weekDay = 2, startTime = "18:00", endTime = "19:00", capacity = 8, studentIds = Array.Empty<Guid>(), status = "Ativa" }),
            Row(enrollment, "enrollments", new { id = enrollment, name = "Matrícula do dependente", studentId = student, classId = cls, startDate = "2026-10-01", status = "Ativa" }));
        await db.SaveChangesAsync(); return new(child, parent, other, student, cls, enrollment, court);
    }

    [PostgresFact]
    public async Task Grant_and_revoke_control_school_agenda_even_when_old_portal_and_billing_links_remain()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); await using var db = isolated.NewContext(); var f = await Seed(db);
        var portal = Portal(db); await portal.Link(new(f.Guardian.Id, "students", f.Student), default);
        var billing = new BillingAccount("Quadra", Guid.NewGuid(), f.Guardian.Id, f.Student, f.Other.Id);
        db.Add(billing); await db.SaveChangesAsync(); Assert.NotEmpty(await portal.Agenda(f.Guardian.Id, default));
        var granted = await Guardians(db).Set(f.Child.Id, f.Guardian.Id, new(true, 0), f.Other.Id, default);
        Assert.Equal(1, granted.Version); Assert.True(granted.IsGranted);
        var agenda = await portal.Agenda(f.Guardian.Id, default); Assert.NotEmpty(agenda);
        Assert.Empty(await portal.Agenda(f.Other.Id, default));
        var request = await portal.Request(f.Guardian.Id, new(Guid.NewGuid(), "Cancellation", agenda.First(row => row.CanChange).Key, "", "", "", null, "Pedido antes da revogação"), default);
        var revoked = await Guardians(db).Set(f.Child.Id, f.Guardian.Id, new(false, 1), f.Other.Id, default);
        Assert.False(revoked.IsGranted); Assert.Equal(2, revoked.Version);
        Assert.Empty(await portal.Agenda(f.Guardian.Id, default));
        Assert.DoesNotContain((await portal.Profile(f.Guardian.Id, default)).Links, row => row.Kind == "students" && row.SourceId == f.Student);
        await Assert.ThrowsAsync<BarRuleException>(() => portal.Decide(request.Id, new(1, "Confirmed", "Conferido", null, null, null, null, null, 0), default));
        Assert.Equal(f.Guardian.Id, (await db.Set<BillingAccount>().SingleAsync(row => row.Id == billing.Id)).UserId);
        Assert.True(await db.OperationalRecords.AnyAsync(row => row.Kind == "portalLinks"));
        Assert.Equal(2, (await Guardians(db).List(f.Child.Id, default)).Single().Version);
        var stale = await Assert.ThrowsAsync<CustomerRuleException>(() => Guardians(db).Set(f.Child.Id, f.Guardian.Id, new(true, 1), f.Other.Id, default));
        Assert.Equal(409, stale.StatusCode); Assert.Empty(await portal.Agenda(f.Guardian.Id, default));
    }

    [PostgresFact]
    public async Task A_grant_adds_only_the_dependent_students_and_an_absent_pair_cannot_reuse_billing_access()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); await using var db = isolated.NewContext(); var f = await Seed(db);
        var unrelated = await Seed(db);
        db.Add(new BillingAccount("Quadra", Guid.NewGuid(), f.Other.Id, f.Student, f.Other.Id)); await db.SaveChangesAsync();
        await Guardians(db).Set(unrelated.Child.Id, unrelated.Guardian.Id, new(true, 0), f.Other.Id, default);
        await Guardians(db).Set(f.Child.Id, f.Guardian.Id, new(true, 0), f.Other.Id, default);
        var agenda = await Portal(db).Agenda(f.Guardian.Id, default); Assert.NotEmpty(agenda); Assert.All(agenda, row => Assert.Equal(f.Class, row.SourceId));
        Assert.Empty(await Portal(db).Agenda(f.Other.Id, default));
        Assert.False(await db.Set<BillingAccount>().AnyAsync(row => row.UserId == f.Guardian.Id));
        Assert.Null((await db.Set<Customer>().SingleAsync(row => row.Id == f.Child.Id)).UserId);
        Assert.Null(f.Guardian.GoogleSubject);
    }

    [PostgresFact]
    public async Task Revocation_blocks_rescheduled_child_reservations_even_through_confirmed_request_history()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); await using var db = isolated.NewContext(); var f = await Seed(db);
        await Guardians(db).Set(f.Child.Id, f.Guardian.Id, new(true, 0), f.Other.Id, default);
        var reservation = Guid.NewGuid(); var request = Guid.NewGuid();
        db.Add(new CustomerSourceLink("reservations", reservation, Guid.Empty, f.Child.Id));
        db.Add(Row(reservation, "reservations", new { id = reservation, name = "Aula remarcada", customerId = f.Child.Id, courtId = f.Court, date = "2026-11-03", startTime = "20:00", endTime = "21:00", status = "Confirmada" }));
        db.Add(Row(request, "portalRequests", new PortalRequest(request, f.Guardian.Id, f.Guardian.Name, "Reschedule", "class:" + f.Enrollment + ":2026-11-03", "2026-11-03", "20:00", "21:00", f.Court, "Fixture", "Confirmed", "Fixture", 1, Time.GetUtcNow(), Time.GetUtcNow(), ReservationId: reservation)));
        await db.SaveChangesAsync(); Assert.Contains(await Portal(db).Agenda(f.Guardian.Id, default), row => row.SourceId == reservation);
        await Guardians(db).Set(f.Child.Id, f.Guardian.Id, new(false, 1), f.Other.Id, default);
        Assert.DoesNotContain(await Portal(db).Agenda(f.Guardian.Id, default), row => row.SourceId == reservation);
        Assert.True(await db.OperationalRecords.AnyAsync(row => row.Id == reservation));
        Assert.Single(await Portal(db).Requests(f.Guardian.Id, default));
    }

    [PostgresFact]
    public async Task Canonical_aliases_keep_the_original_pair_and_revoked_pairs_stay_authoritative()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); await using var db = isolated.NewContext(); var f = await Seed(db);
        await Guardians(db).Set(f.Child.Id, f.Guardian.Id, new(true, 0), f.Other.Id, default);
        var canonical = new Customer("Dependente canônico", "11955550124", null, "fixture"); db.Add(canonical); f.Child.MergeInto(canonical.Id); await db.SaveChangesAsync();
        var before = await db.Set<CustomerGuardianAccess>().SingleAsync();
        Assert.Equal(canonical.Id, (await Guardians(db).List(canonical.Id, default)).Single().CustomerId);
        Assert.NotEmpty(await Portal(db).Agenda(f.Guardian.Id, default));
        await Guardians(db).Set(canonical.Id, f.Guardian.Id, new(false, 1), f.Other.Id, default);
        Assert.Equal(before.Id, (await db.Set<CustomerGuardianAccess>().SingleAsync()).Id);
        Assert.Equal(f.Child.Id, before.CustomerId); Assert.False(before.IsGranted);
        Assert.Empty(await Portal(db).Agenda(f.Guardian.Id, default));
    }

    [PostgresFact]
    public async Task Own_accounts_cannot_become_dependents_and_controlled_dependents_cannot_gain_own_accounts()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); await using var db = isolated.NewContext(); var f = await Seed(db);
        f.Child.AssignUser(f.Other.Id); await db.SaveChangesAsync();
        var invalid = await Assert.ThrowsAsync<CustomerRuleException>(() => Guardians(db).Set(f.Child.Id, f.Guardian.Id, new(true, 0), f.Other.Id, default));
        Assert.Equal(409, invalid.StatusCode);
        f.Child.AssignUser(null); await db.SaveChangesAsync();
        await Guardians(db).Set(f.Child.Id, f.Guardian.Id, new(false, 0), f.Other.Id, default);
        var customer = await db.Set<Customer>().AsNoTracking().SingleAsync(row => row.Id == f.Child.Id);
        var assign = await Assert.ThrowsAsync<CustomerRuleException>(() => new CustomerService(db, Time).AssignUser(customer.Id, new(f.Other.Id, customer.Version), default));
        Assert.Equal(409, assign.StatusCode); Assert.Null((await db.Set<Customer>().AsNoTracking().SingleAsync(row => row.Id == customer.Id)).UserId);
    }

    [PostgresFact]
    public async Task Imported_conflicting_alias_pairs_fail_closed_and_require_explicit_reconciliation()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); await using var db = isolated.NewContext(); var f = await Seed(db);
        var canonical = new Customer("Destino importado", "11955550128", null, "fixture"); db.Add(canonical);
        db.AddRange(new CustomerGuardianAccess(f.Child.Id, f.Guardian.Id, true), new CustomerGuardianAccess(canonical.Id, f.Guardian.Id, false));
        f.Child.MergeInto(canonical.Id); db.Add(new BillingAccount("Quadra", Guid.NewGuid(), f.Guardian.Id, f.Student, f.Other.Id)); await db.SaveChangesAsync();
        Assert.Empty(await Portal(db).Agenda(f.Guardian.Id, default));
        var pair = Assert.Single(await Guardians(db).List(canonical.Id, default)); Assert.False(pair.IsGranted); Assert.Equal(0, pair.Version);
        var error = await Assert.ThrowsAsync<CustomerRuleException>(() => Guardians(db).Set(canonical.Id, f.Guardian.Id, new(true, 0), f.Other.Id, default)); Assert.Equal(409, error.StatusCode);
        Assert.Equal(2, await db.Set<CustomerGuardianAccess>().CountAsync());
    }

    [PostgresFact]
    public async Task Own_account_candidates_accept_completed_local_logins_without_exposing_reserved_addresses()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); await using var db = isolated.NewContext(); var f = await Seed(db);
        f.Guardian.SetUsername("responsavel.local"); await db.SaveChangesAsync();
        var candidates = await new CustomerService(db, Time).UserCandidates(f.Child.Id, "responsavel.local", default);
        var account = Assert.Single(candidates); Assert.Equal(f.Guardian.Id, account.Id); Assert.Equal("Usuário: responsavel.local", account.EmailHint);
        var pending = User.CreateForFirstAccess("Responsável pendente", "responsavel.pendente", "fixture-only", Time.GetUtcNow().AddDays(1));
        var inactive = await Account(db, "Responsável inativo"); inactive.SetUsername("responsavel.inativo"); inactive.Deactivate(); db.Add(pending); await db.SaveChangesAsync();
        Assert.DoesNotContain(await new CustomerService(db, Time).UserCandidates(f.Child.Id, "responsavel.", default), row => row.Id == pending.Id || row.Id == inactive.Id);
    }

    [PostgresFact]
    public async Task Unsafe_merges_are_rejected_and_an_uncontrolled_alias_can_be_merged_without_losing_access()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); await using var db = isolated.NewContext(); var f = await Seed(db);
        var otherChild = new Customer("Outro dependente", "11955550125", null, "fixture");
        var adult = new Customer("Adulto com conta", "11955550126", null, "fixture"); adult.AssignUser(f.Other.Id);
        var alias = new Customer("Alias sem conta", "11955550127", null, "fixture"); db.AddRange(otherChild, adult, alias); await db.SaveChangesAsync();
        await Guardians(db).Set(f.Child.Id, f.Guardian.Id, new(true, 0), f.Other.Id, default);
        await Guardians(db).Set(otherChild.Id, f.Other.Id, new(true, 0), f.Other.Id, default);
        var customers = new CustomerService(db, Time);
        foreach (var target in new[] { otherChild.Id, adult.Id })
        {
            var preview = await customers.PreviewMerge(new(f.Child.Id, target), default); Assert.False(preview.CanMerge);
            var denied = await Assert.ThrowsAsync<CustomerRuleException>(() => customers.Merge(new(Guid.NewGuid(), preview.SourceId, preview.TargetId, preview.SourceVersion, preview.TargetVersion, preview.PreviewToken, "Fixture"), f.Other.Id, default)); Assert.Equal(409, denied.StatusCode);
        }
        var safe = await customers.PreviewMerge(new(alias.Id, f.Child.Id), default); Assert.True(safe.CanMerge);
        await customers.Merge(new(Guid.NewGuid(), safe.SourceId, safe.TargetId, safe.SourceVersion, safe.TargetVersion, safe.PreviewToken, "Fixture"), f.Other.Id, default);
        Assert.Single(await Guardians(db).List(alias.Id, default)); Assert.NotEmpty(await Portal(db).Agenda(f.Guardian.Id, default));
    }

    [PostgresFact]
    public async Task Candidates_and_grants_accept_completed_password_accounts_and_preserve_inactive_revocation()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); await using var db = isolated.NewContext(); var f = await Seed(db);
        var staff = await Account(db, "Responsável Professor", "Teacher");
        var pending = User.CreateForFirstAccess("Responsável pendente", "pendente" + Guid.NewGuid().ToString("N"), "fixture-only", Time.GetUtcNow().AddDays(1));
        pending.AssignRole(db.Roles.Local.Single(row => row.Name == "Student")); db.Add(pending);
        var inactive = await Account(db, "Responsável inativo"); inactive.Deactivate(); await db.SaveChangesAsync();
        var candidates = await Guardians(db).Candidates(f.Child.Id, "Responsável", default);
        Assert.Contains(candidates, row => row.Id == f.Guardian.Id); Assert.Contains(candidates, row => row.Id == staff.Id);
        Assert.DoesNotContain(candidates, row => row.Id == pending.Id || row.Id == inactive.Id);
        Assert.All(candidates, row => Assert.DoesNotContain(".invalid", row.EmailHint));
        await Guardians(db).Set(f.Child.Id, staff.Id, new(true, 0), f.Other.Id, default);
        Assert.NotEmpty(await Portal(db).Agenda(staff.Id, default));
        foreach (var user in new[] { pending, inactive })
            await Assert.ThrowsAsync<CustomerRuleException>(() => Guardians(db).Set(f.Child.Id, user.Id, new(true, 0), f.Other.Id, default));
        staff.Deactivate(); await db.SaveChangesAsync(); Assert.Empty(await Portal(db).Agenda(staff.Id, default));
        await Guardians(db).Set(f.Child.Id, staff.Id, new(false, 1), f.Other.Id, default);
        Assert.False((await Guardians(db).List(f.Child.Id, default)).Single().IsGranted);
    }
}
