using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed class ClientAccessMigrationPostgresTests
{
    private const string Previous = "20261101002415_MessagingCentral";
    [PostgresFact]
    public async Task Upgrade_preserves_existing_user_customer_and_refresh_data_and_limits_new_table_privileges()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create();
        var db = isolated.Context;
        await db.GetService<IMigrator>().MigrateAsync(Previous);
        // These roles exist only inside the disposable test container. No hosted grants are executed.
        await db.Database.ExecuteSqlRawAsync("""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='longbeach_runtime') THEN CREATE ROLE longbeach_runtime NOLOGIN; END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='longbeach_whatsapp_runtime') THEN CREATE ROLE longbeach_whatsapp_runtime NOLOGIN; END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='longbeach_whatsapp_bridge') THEN CREATE ROLE longbeach_whatsapp_bridge NOLOGIN; END IF;
            END $$;
            """);
        var user = Guid.NewGuid(); var token = Guid.NewGuid(); var now = DateTimeOffset.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO users ("Id","Name","Email","NormalizedEmail","PasswordHash","IsActive","CreatedAtUtc")
            VALUES ({user},'Cliente fictício','legacy@example.invalid','LEGACY@EXAMPLE.INVALID','preserved-password-hash',true,{now});
            INSERT INTO refresh_tokens ("Id","UserId","FamilyId","TokenHash","CsrfTokenHash","ExpiresAtUtc","Version","CreatedAtUtc")
            VALUES ({token},{user},{token},{new string('a',64)},{new string('b',64)},{now.AddDays(1)},1,{now});
            """);
        var customer = new Customer("Ficha preservada", "11987654321", null, "test"); customer.AssignUser(user);
        db.Add(customer); await db.SaveChangesAsync();
        var userBefore = await db.Database.SqlQueryRaw<string>("SELECT to_jsonb(u)::text AS \"Value\" FROM users u").SingleAsync();
        var refreshBefore = await db.Database.SqlQueryRaw<string>("SELECT to_jsonb(t)::text AS \"Value\" FROM refresh_tokens t").SingleAsync();
        var customerBefore = await db.Database.SqlQueryRaw<string>("SELECT to_jsonb(c)::text AS \"Value\" FROM customers c").SingleAsync();
        await db.GetService<IMigrator>().MigrateAsync();
        Assert.Equal(userBefore, await db.Database.SqlQueryRaw<string>("SELECT (to_jsonb(u)-'CredentialVersion'-'LocalPasswordEnabled'-'PhoneLogin'-'RequiresLocalPasswordChange')::text AS \"Value\" FROM users u").SingleAsync());
        Assert.Equal(refreshBefore, await db.Database.SqlQueryRaw<string>("SELECT (to_jsonb(t)-'CredentialVersion')::text AS \"Value\" FROM refresh_tokens t").SingleAsync());
        Assert.Equal(customerBefore, await db.Database.SqlQueryRaw<string>("SELECT to_jsonb(c)::text AS \"Value\" FROM customers c").SingleAsync());
        var current = await db.Users.SingleAsync(); Assert.True(current.LocalPasswordEnabled); Assert.Equal(0,current.CredentialVersion);
        Assert.Equal(0,(await db.RefreshTokens.SingleAsync()).CredentialVersion);
        foreach (var table in new[] { "client_access_challenges", "customer_guardian_access" })
        {
            foreach (var privilege in new[] { "SELECT", "INSERT", "UPDATE" })
                Assert.True(await db.Database.SqlQuery<bool>($"SELECT has_table_privilege('longbeach_runtime',quote_ident(current_schema())||'.'||quote_ident({table}),{privilege}) AS \"Value\"").SingleAsync());
            foreach (var privilege in new[] { "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER" })
                Assert.False(await db.Database.SqlQuery<bool>($"SELECT has_table_privilege('longbeach_runtime',quote_ident(current_schema())||'.'||quote_ident({table}),{privilege}) AS \"Value\"").SingleAsync());
            foreach (var role in new[] { "longbeach_whatsapp_runtime", "longbeach_whatsapp_bridge" })
                Assert.False(await db.Database.SqlQuery<bool>($"SELECT has_table_privilege({role},quote_ident(current_schema())||'.'||quote_ident({table}),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS \"Value\"").SingleAsync());
            Assert.False(await db.Database.SqlQuery<bool>($"SELECT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl WHERE c.oid=to_regclass(quote_ident(current_schema())||'.'||quote_ident({table})) AND acl.grantee=0) AS \"Value\"").SingleAsync());
        }
    }
    [PostgresTheory]
    [InlineData("credentials")]
    [InlineData("local-method")]
    [InlineData("guardian")]
    [InlineData("consumed-challenge")]
    public async Task Downgrade_refuses_to_erase_credentials_or_guardian_history_after_use(string use)
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var db = isolated.Context;
        var user = User.Create("Teste", "down@example.invalid", "fixture-hash"); db.Add(user);
        if (use == "credentials") user.InvalidateCredentials(DateTimeOffset.UtcNow, null, "Fixture");
        if (use == "local-method") user.DisableLocalPassword("another-fixture-hash");
        if (use is "guardian" or "consumed-challenge")
        {
            var customer = new Customer("Dependente fictício", "11987654321", null, "test"); db.Add(customer);
            if (use == "guardian") db.Add(new CustomerGuardianAccess(customer.Id, user.Id, false));
            else
            {
                var challenge = new ClientAccessChallenge(customer.Id, null, "Activation", new string('c',64), DateTimeOffset.UtcNow.AddDays(1), user.Id, customer.Version, null);
                challenge.Consume(DateTimeOffset.UtcNow); db.Add(challenge);
            }
        }
        await db.SaveChangesAsync();
        var error = await Assert.ThrowsAsync<PostgresException>(() => db.GetService<IMigrator>().MigrateAsync(Previous));
        Assert.Contains("Preserve credentials", error.MessageText);
        // Unused staff tables can roll back; migration 32 still protects used client data.
        Assert.Equal(32, (await db.Database.GetAppliedMigrationsAsync()).Count());
        Assert.Equal(1, await db.Users.CountAsync());
    }
}
