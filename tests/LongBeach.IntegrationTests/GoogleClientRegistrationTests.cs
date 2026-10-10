using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using LongBeach.Application.Auth;
using LongBeach.Contracts.Auth;
using LongBeach.Contracts.Portal;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class GoogleClientRegistrationTests
{
    private static readonly RsaSecurityKey Key = new(RSA.Create(2048)) { KeyId = "test-only-google-key" };
    private const string Audience = "local-test.apps.googleusercontent.com";
    private static WebApplicationFactory<Program> Factory(bool registration = true, string allowed = "") =>
        OperationalPostgresTests.Factory().WithWebHostBuilder(builder => builder
            .UseSetting("Authentication:Google:Enabled", "true")
            .UseSetting("Authentication:Google:ClientId", Audience)
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:Google:Enabled"] = "true",
                ["Authentication:Google:ClientId"] = Audience,
                ["Authentication:Google:ClientRegistrationEnabled"] = registration.ToString(),
                ["Authentication:Google:AllowedEmail"] = allowed
            }))
            .ConfigureServices(services =>
            {
                services.AddScoped<IAuthService, AuthService>();
                services.PostConfigure<JwtBearerOptions>("Google", options =>
                {
                    // Exercise the real JWT handler offline, with a signing key only this test owns.
                    options.Configuration = new OpenIdConnectConfiguration { Issuer = "https://accounts.google.com" };
                    options.Configuration.SigningKeys.Add(Key);
                    options.ConfigurationManager = new Microsoft.IdentityModel.Protocols.StaticConfigurationManager<OpenIdConnectConfiguration>(options.Configuration);
                });
            }));

    private static string Credential(string subject, string email, string verified = "true", string audience = Audience,
        string issuer = "https://accounts.google.com", bool expired = false, SecurityKey? key = null) =>
        new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(issuer, audience,
            [new("sub", subject), new("email", email), new("email_verified", verified), new("name", "Cliente Google teste"),
             new(ClaimTypes.Role, "Owner"), new("permission", "users:manage")],
            DateTime.UtcNow.AddHours(-2), expired ? DateTime.UtcNow.AddHours(-1) : DateTime.UtcNow.AddMinutes(5),
            new SigningCredentials(key ?? Key, SecurityAlgorithms.RsaSha256)));

    private static async Task Prepare(WebApplicationFactory<Program> factory)
    {
        await OperationalPostgresTests.Migrate(factory);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        if (!await db.Roles.AnyAsync(r => r.Name == SystemRoles.Student))
        {
            db.Roles.Add(new Role(SystemRoles.Student));
            await db.SaveChangesAsync();
        }
    }

    private static Task<HttpResponseMessage> SignIn(HttpClient client, string credential) =>
        client.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/google")
        { Headers = { Authorization = new AuthenticationHeaderValue("Bearer", credential) } });

    [PostgresFact]
    public async Task New_client_is_audited_has_no_staff_permissions_and_returns_without_duplicates()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Prepare(factory);
        var subject = Guid.NewGuid().ToString(); var email = $"{subject}@example.invalid";
        var response = await SignIn(client, Credential(subject, email));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        var session = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.Equal([SystemRoles.Student], session.User.Roles); Assert.Empty(session.User.Permissions);
        Assert.True(session.User.GoogleLinked); Assert.False(session.User.RequiresFirstAccess);
        var again = await SignIn(client, Credential(subject, email));
        Assert.Equal(session.User.Id, (await again.Content.ReadFromJsonAsync<AuthResponse>())!.User.Id);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        Assert.True((await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me"))!.GoogleLinked);
        var profile = await client.GetFromJsonAsync<PortalProfile>("/api/v1/me/portal/profile");
        Assert.Empty(profile!.Links);
        foreach (var path in new[] { "/api/v1/operations/students", "/api/v1/portal/candidates", "/api/v1/me/teaching", "/api/v1/bar/tabs" })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        Assert.Equal(1, await db.Users.CountAsync(u => u.GoogleSubject == subject));
        var audit = await db.AuditLogs.SingleAsync(a => a.Resource == "User" && a.ResourceId == session.User.Id.ToString() && a.Action == "Added");
        Assert.Contains("[REDACTED]", audit.MetadataJson);
        Assert.DoesNotContain(session.AccessToken, audit.MetadataJson);
        Assert.DoesNotContain(await db.OperationalRecords.Where(r => r.Kind == "portalLinks").ToListAsync(), r => r.Payload.Contains(session.User.Id.ToString()));
    }

    [PostgresFact]
    public async Task Concurrent_first_sign_ins_create_one_identity()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Prepare(factory);
        var subject = Guid.NewGuid().ToString(); var credential = Credential(subject, $"{subject}@example.invalid");
        var responses = await Task.WhenAll(SignIn(client, credential), SignIn(client, credential));
        foreach (var response in responses) Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var sessions = await Task.WhenAll(responses.Select(r => r.Content.ReadFromJsonAsync<AuthResponse>()));
        Assert.Equal(sessions[0]!.User.Id, sessions[1]!.User.Id);
    }

    [PostgresFact]
    public async Task Invalid_google_tokens_never_create_accounts()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Prepare(factory);
        var subject = Guid.NewGuid().ToString(); var email = $"{subject}@example.invalid";
        using var rogueRsa = RSA.Create(2048);
        foreach (var token in new[] { Credential(subject, email, verified: "false"), Credential(subject, email, audience: "other-client"),
            Credential(subject, email, issuer: "https://untrusted.invalid"), Credential(subject, email, expired: true),
            Credential(subject, email, key: new RsaSecurityKey(rogueRsa) { KeyId = "rogue" }), Credential("", email) })
        {
            var response = await SignIn(client, token);
            Assert.Contains(response.StatusCode, new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden });
        }
        await using var scope = factory.Services.CreateAsyncScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<LongBeachDbContext>().Users.AnyAsync(u => u.NormalizedEmail == User.NormalizeEmail(email)));
    }

    [PostgresFact]
    public async Task Email_collision_and_inactive_or_pending_accounts_are_not_linked_or_reactivated()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Prepare(factory);
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var existing = User.Create("Existing", $"{Guid.NewGuid()}@example.invalid", "test-hash");
        var inactive = User.Create("Inactive", $"{Guid.NewGuid()}@example.invalid", "test-hash"); inactive.LinkGoogle(Guid.NewGuid().ToString(), inactive.Email); inactive.Deactivate();
        var pending = User.CreateForFirstAccess("Pending", "test-" + Guid.NewGuid().ToString("N"), "test-hash", DateTimeOffset.UtcNow.AddDays(1));
        var linked = User.Create("Linked", $"{Guid.NewGuid()}@example.invalid", "test-hash"); linked.LinkGoogle(Guid.NewGuid().ToString(), linked.Email);
        db.AddRange(existing, inactive, pending, linked); await db.SaveChangesAsync();
        foreach (var (subject, email) in new[] { (Guid.NewGuid().ToString(), existing.Email), (inactive.GoogleSubject!, inactive.Email),
            (Guid.NewGuid().ToString(), pending.Email), (Guid.NewGuid().ToString(), linked.Email) })
            Assert.Equal(HttpStatusCode.Unauthorized, (await SignIn(client, Credential(subject, email))).StatusCode);
        await db.Entry(existing).ReloadAsync(); await db.Entry(inactive).ReloadAsync(); await db.Entry(pending).ReloadAsync();
        Assert.Null(existing.GoogleSubject); Assert.False(inactive.IsActive); Assert.True(pending.RequiresFirstAccess);
    }

    [PostgresFact]
    public async Task Disabling_registration_blocks_new_accounts_but_preserves_linked_and_authorized_staff()
    {
        var staffEmail = $"{Guid.NewGuid()}@example.invalid";
        await using var factory = Factory(false, staffEmail); using var client = factory.CreateClient(); await Prepare(factory);
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var manager = await db.Roles.SingleOrDefaultAsync(r => r.Name == SystemRoles.Manager) ?? new Role(SystemRoles.Manager);
        var staff = User.Create("Manager", staffEmail, "test-hash"); staff.AssignRole(manager);
        var returning = User.Create("Returning", $"{Guid.NewGuid()}@example.invalid", "test-hash"); returning.LinkGoogle(Guid.NewGuid().ToString(), returning.Email);
        db.AddRange(staff, returning); await db.SaveChangesAsync();
        var subject = Guid.NewGuid().ToString();
        Assert.Equal(HttpStatusCode.Unauthorized, (await SignIn(client, Credential(subject, $"{subject}@example.invalid"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SignIn(client, Credential(returning.GoogleSubject!, returning.Email))).StatusCode);
        var response = await SignIn(client, Credential(Guid.NewGuid().ToString(), staffEmail));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains(SystemRoles.Manager, (await response.Content.ReadFromJsonAsync<AuthResponse>())!.User.Roles);
        Assert.False(await db.Users.AnyAsync(u => u.GoogleSubject == subject));
        // Registration can be rolled back without an email allowlist or locking out clients.
        await using var closedFactory = Factory(false);
        using var closedClient = closedFactory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await SignIn(closedClient, Credential(returning.GoogleSubject!, returning.Email))).StatusCode);
    }

    [Fact]
    public async Task Public_options_fail_closed_when_google_is_disabled()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/v1/auth/options");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        var options = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(System.Text.Json.JsonValueKind.Null, options.GetProperty("googleClientId").ValueKind);
        Assert.False(options.GetProperty("clientRegistrationEnabled").GetBoolean());
    }

    [PostgresFact]
    public async Task Google_client_sees_existing_records_only_after_management_links_them()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        using var otherClient = factory.CreateClient();
        using var management = factory.CreateClient();
        await Prepare(factory);
        var subject = Guid.NewGuid().ToString();
        var email = $"{subject}@example.invalid";
        var session = (await (await SignIn(client, Credential(subject, email))).Content.ReadFromJsonAsync<AuthResponse>())!;
        var otherSubject = Guid.NewGuid().ToString();
        var other = (await (await SignIn(otherClient, Credential(otherSubject, $"{otherSubject}@example.invalid"))).Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        otherClient.DefaultRequestHeaders.Authorization = new("Bearer", other.AccessToken);
        management.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header(SystemRoles.Owner);

        var student = Guid.NewGuid(); var group = Guid.NewGuid(); var reservation = Guid.NewGuid();
        var groupReservation = Guid.NewGuid(); var lesson = Guid.NewGuid(); var enrollment = Guid.NewGuid();
        var date = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(-3)).DateTime).AddDays(2);
        OperationalRecord Record(Guid id, string kind, object payload)
        {
            var data = JsonSerializer.SerializeToNode(payload)!.AsObject();
            data["id"] = id;
            data["name"] = "Cliente Google teste";
            return new(id, kind, "Cliente Google teste", data.ToJsonString());
        }
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        db.AddRange(
            Record(student, "students", new { name = session.User.Name, email }),
            Record(group, "rentalGroups", new { name = session.User.Name }),
            Record(reservation, "reservations", new { date = date.ToString("yyyy-MM-dd"), startTime = "10:00", endTime = "11:00", status = "Confirmada", customerName = session.User.Name }),
            Record(groupReservation, "reservations", new { rentalGroupId = group, date = date.ToString("yyyy-MM-dd"), startTime = "11:00", endTime = "12:00", status = "Confirmada" }),
            Record(lesson, "classes", new { weekDay = (int)date.DayOfWeek, startDate = date.ToString("yyyy-MM-dd"), startTime = "08:00", endTime = "09:00", status = "Ativa" }),
            Record(enrollment, "enrollments", new { studentId = student, classId = lesson, startDate = date.ToString("yyyy-MM-dd"), status = "Ativa" }));
        await db.SaveChangesAsync();

        Assert.Empty((await client.GetFromJsonAsync<PortalProfile>("/api/v1/me/portal/profile"))!.Links);
        Assert.Empty((await client.GetFromJsonAsync<PortalAppointment[]>("/api/v1/me/portal/agenda"))!);
        foreach (var (kind, id) in new[] { ("students", student), ("rentalGroups", group), ("reservations", reservation) })
        {
            var input = new LinkInput(session.User.Id, kind, id);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/portal/links", input)).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await management.PostAsJsonAsync("/api/v1/portal/links", input)).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await management.PostAsJsonAsync("/api/v1/portal/links", input)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await management.PostAsJsonAsync("/api/v1/portal/links", input with { UserId = other.User.Id })).StatusCode);
        }

        var profile = (await client.GetFromJsonAsync<PortalProfile>("/api/v1/me/portal/profile"))!;
        Assert.Equal(3, profile.Links.Count);
        var agenda = (await client.GetFromJsonAsync<PortalAppointment[]>("/api/v1/me/portal/agenda"))!;
        Assert.Contains(agenda, a => a.SourceId == lesson && a.Kind == "Aula");
        Assert.Contains(agenda, a => a.SourceId == reservation);
        Assert.Contains(agenda, a => a.SourceId == groupReservation);
        Assert.All(agenda, a => Assert.Contains(a.SourceId, new[] { lesson, reservation, groupReservation }));
        Assert.Empty((await otherClient.GetFromJsonAsync<PortalAppointment[]>("/api/v1/me/portal/agenda"))!);
        Assert.Empty((await otherClient.GetFromJsonAsync<PortalProfile>("/api/v1/me/portal/profile"))!.Links);
        var target = agenda.First(a => a.SourceId == reservation);
        Assert.Equal(HttpStatusCode.BadRequest, (await otherClient.PostAsJsonAsync("/api/v1/me/portal/requests",
            new RequestInput(Guid.NewGuid(), "Cancellation", target.Key, "", "", "", null, "Pedido de teste"))).StatusCode);

        var returning = (await (await SignIn(client, Credential(subject, email))).Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.Equal(session.User.Id, returning.User.Id);
        Assert.Equal([SystemRoles.Student], returning.User.Roles);
        Assert.Empty(returning.User.Permissions);
        client.DefaultRequestHeaders.Authorization = new("Bearer", returning.AccessToken);
        Assert.Equal(3, (await client.GetFromJsonAsync<PortalProfile>("/api/v1/me/portal/profile"))!.Links.Count);
        var links = (await db.OperationalRecords.Where(r => r.Kind == "portalLinks").ToListAsync())
            .Where(r => JsonDocument.Parse(r.Payload).RootElement.GetProperty("userId").GetGuid() == session.User.Id).ToArray();
        Assert.Equal(3, links.Length);
        foreach (var link in links)
            Assert.Single(await db.AuditLogs.Where(a => a.ResourceId == link.Id.ToString() && a.Action == "Added").ToListAsync());
        Assert.False(await db.Set<LongBeach.Domain.Billing.BillingAccount>().AnyAsync(a => a.UserId == session.User.Id));
    }

    [PostgresFact]
    public async Task Google_return_preserves_staff_roles_and_their_access_boundaries()
    {
        await using var factory = Factory(); await Prepare(factory);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        foreach (var roleName in new[] { SystemRoles.Owner, SystemRoles.Administrator, SystemRoles.Teacher, SystemRoles.BarOperator })
        {
            var role = await db.Roles.Include(r => r.RolePermissions).SingleOrDefaultAsync(r => r.Name == roleName) ?? new Role(roleName);
            if (roleName == SystemRoles.BarOperator)
                foreach (var grant in ProfileAccess.Grants[roleName])
                    role.Grant(await db.Permissions.SingleOrDefaultAsync(p => p.Name == grant) ?? new Permission(grant));
            var user = User.Create("Equipe fictícia", $"{Guid.NewGuid()}@example.invalid", "test-hash");
            user.AssignRole(role); user.LinkGoogle(Guid.NewGuid().ToString(), user.Email);
            db.Users.Add(user); await db.SaveChangesAsync();
            using var client = factory.CreateClient();
            var response = await SignIn(client, Credential(user.GoogleSubject!, user.Email));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var session = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
            Assert.Equal(user.Id, session.User.Id); Assert.Equal([roleName], session.User.Roles);
            client.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
            var isManagement = roleName is SystemRoles.Owner or SystemRoles.Administrator;
            Assert.Equal(isManagement ? HttpStatusCode.OK : HttpStatusCode.Forbidden,
                (await client.GetAsync("/api/v1/portal/candidates")).StatusCode);
            Assert.Equal(isManagement ? HttpStatusCode.OK : HttpStatusCode.Forbidden,
                (await client.GetAsync("/api/v1/operations/financeEntries")).StatusCode);
            Assert.Equal(isManagement || roleName == SystemRoles.Teacher ? HttpStatusCode.OK : HttpStatusCode.Forbidden,
                (await client.GetAsync("/api/v1/me/teaching")).StatusCode);
            Assert.Equal(isManagement || roleName == SystemRoles.BarOperator ? HttpStatusCode.OK : HttpStatusCode.Forbidden,
                (await client.GetAsync("/api/v1/bar/tabs")).StatusCode);
            if (isManagement) Assert.Equal(SystemPermissions.All.Order(), session.User.Permissions.Order());
            else Assert.DoesNotContain(SystemPermissions.UsersManage, session.User.Permissions);
        }
    }
}
