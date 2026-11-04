using LongBeach.Application.Staff;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed class StaffAccessMigrationPostgresTests
{
    private const string Previous = "20261102163528_ClientIndividualAccess";

    [PostgresFact]
    public async Task Upgrade_preserves_existing_credentials_seeds_the_catalog_and_limits_table_privileges()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var db = isolated.Context;
        await db.GetService<IMigrator>().MigrateAsync(Previous);
        // These roles are synthetic and are confined to the disposable PostgreSQL test container.
        await db.Database.ExecuteSqlRawAsync("""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='longbeach_runtime') THEN CREATE ROLE longbeach_runtime NOLOGIN; END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='longbeach_whatsapp_runtime') THEN CREATE ROLE longbeach_whatsapp_runtime NOLOGIN; END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='longbeach_whatsapp_bridge') THEN CREATE ROLE longbeach_whatsapp_bridge NOLOGIN; END IF;
            END $$;
            """);
        var userId = Guid.NewGuid(); var token = Guid.NewGuid(); var now = DateTimeOffset.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO users ("Id","Name","Email","NormalizedEmail","PasswordHash","IsActive","CreatedAtUtc")
            VALUES ({userId},'Equipe fictícia','existing-staff@example.invalid','EXISTING-STAFF@EXAMPLE.INVALID','preserved-password-hash',true,{now});
            INSERT INTO refresh_tokens ("Id","UserId","FamilyId","TokenHash","CsrfTokenHash","ExpiresAtUtc","Version","CreatedAtUtc")
            VALUES ({token},{userId},{token},{new string('c',64)},{new string('d',64)},{now.AddDays(1)},1,{now});
            """);
        var before = await db.Database.SqlQueryRaw<string>("SELECT to_jsonb(u)::text AS \"Value\" FROM users u").SingleAsync();
        var refreshBefore = await db.Database.SqlQueryRaw<string>("SELECT to_jsonb(t)::text AS \"Value\" FROM refresh_tokens t").SingleAsync();
        await db.GetService<IMigrator>().MigrateAsync();
        Assert.Equal(before, await db.Database.SqlQueryRaw<string>("SELECT (to_jsonb(u)-'PhoneLogin'-'RequiresLocalPasswordChange')::text AS \"Value\" FROM users u").SingleAsync());
        Assert.Equal(refreshBefore, await db.Database.SqlQueryRaw<string>("SELECT to_jsonb(t)::text AS \"Value\" FROM refresh_tokens t").SingleAsync());
        Assert.False(db.Database.HasPendingModelChanges());
        var types = await db.Set<StaffAccessType>().OrderBy(x => x.Code).ToListAsync(); Assert.Equal(4, types.Count);
        foreach (var type in types)
        {
            var expected = StaffAccessCatalog.Default(type.Code); Assert.Equal(expected.Id, type.Id); Assert.Equal(expected.Role, type.Role);
            Assert.Equal(expected.Menus, type.Menus); Assert.Equal(expected.Actions, type.Actions); Assert.Equal(1, type.Version);
        }
        Assert.Empty(await db.Set<StaffMembership>().ToListAsync()); Assert.Empty(await db.Set<StaffAccessOperation>().ToListAsync());
        foreach (var table in new[] { "staff_access_types", "staff_memberships", "staff_access_operations" })
        {
            foreach (var privilege in new[] { "SELECT", "INSERT" })
                Assert.True(await db.Database.SqlQuery<bool>($"SELECT has_table_privilege('longbeach_runtime',quote_ident(current_schema())||'.'||quote_ident({table}),{privilege}) AS \"Value\"").SingleAsync());
            Assert.Equal(table != "staff_access_operations", await db.Database.SqlQuery<bool>($"SELECT has_table_privilege('longbeach_runtime',quote_ident(current_schema())||'.'||quote_ident({table}),'UPDATE') AS \"Value\"").SingleAsync());
            foreach (var privilege in new[] { "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER" })
                Assert.False(await db.Database.SqlQuery<bool>($"SELECT has_table_privilege('longbeach_runtime',quote_ident(current_schema())||'.'||quote_ident({table}),{privilege}) AS \"Value\"").SingleAsync());
            foreach (var role in new[] { "longbeach_whatsapp_runtime", "longbeach_whatsapp_bridge" })
                Assert.False(await db.Database.SqlQuery<bool>($"SELECT has_table_privilege({role},quote_ident(current_schema())||'.'||quote_ident({table}),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS \"Value\"").SingleAsync());
            Assert.False(await db.Database.SqlQuery<bool>($"SELECT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl WHERE c.oid=to_regclass(quote_ident(current_schema())||'.'||quote_ident({table})) AND acl.grantee=0) AS \"Value\"").SingleAsync());
        }
    }

    [PostgresTheory]
    [InlineData("phone")]
    [InlineData("first-access")]
    [InlineData("type")]
    [InlineData("membership")]
    public async Task Downgrade_refuses_to_erase_staff_scopes_or_login_credentials(string state)
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var db = isolated.Context;
        var user = state == "first-access" ? User.CreateForStaffFirstAccess("Equipe fictícia", "fixture.staff", null, "temporary-hash", DateTimeOffset.UtcNow.AddHours(24))
            : User.Create("Equipe fictícia", "staff-down@example.invalid", "fixture-hash"); db.Add(user);
        if (state == "phone") user.SetPhoneLogin("11998880012");
        var type = await db.Set<StaffAccessType>().SingleAsync(x => x.Code == "bar");
        if (state == "type") type.Update("Comandas", ["bar.tabs"], []);
        if (state == "membership")
        {
            var team = Guid.NewGuid(); db.Add(new OperationalRecord(team, "team", "Equipe fictícia", "{}"));
            var membership = new StaffMembership(user.Id, team, type); user.AttachStaffMembership(membership); db.Add(membership);
        }
        await db.SaveChangesAsync();
        var error = await Assert.ThrowsAsync<PostgresException>(() => db.GetService<IMigrator>().MigrateAsync(Previous));
        Assert.Contains("Preserve scoped authorizations", error.MessageText);
        Assert.Contains("20261104173051_StaffIndividualAccess", await db.Database.GetAppliedMigrationsAsync()); Assert.Equal(1, await db.Users.CountAsync());
        Assert.Equal(state == "membership" ? 1 : 0, await db.Set<StaffMembership>().CountAsync());
    }
}
