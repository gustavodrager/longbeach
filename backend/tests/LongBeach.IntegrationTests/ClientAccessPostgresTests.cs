using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Contracts.Auth;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Auth;
using LongBeach.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class ClientAccessPostgresTests
{
    private const string Password = "IndividualTestPassword2!";
    private const string Audience = "accounts-test.apps.googleusercontent.com";
    private static readonly RsaSecurityKey GoogleKey = new(RSA.Create(2048)) { KeyId = "account-test-only" };
    private sealed class Fixture(IsolatedMaterialDatabase database, WebApplicationFactory<Program> factory, Guid manager) : IAsyncDisposable
    {
        public IsolatedMaterialDatabase Database => database;
        public WebApplicationFactory<Program> Factory => factory;
        public Guid Manager => manager;
        public HttpClient Client(bool managerAccount = false)
        {
            var client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
            if (managerAccount) client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(manager, [SystemRoles.Manager]));
            return client;
        }
        public async Task<Customer> Person(string name = "Cliente de teste")
        {
            await using var db = database.NewContext();
            var customer = new Customer(name, "11987654321", null, "test"); db.Add(customer); await db.SaveChangesAsync(); return customer;
        }
        public async ValueTask DisposeAsync() { await factory.DisposeAsync(); await database.DisposeAsync(); }
    }
    private static async Task<Fixture> Create()
    {
        var isolated = await IsolatedMaterialDatabase.Create();
        try
        {
            var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
                .UseSetting("Authentication:Google:Enabled", "true")
                .UseSetting("Authentication:Google:ClientId", Audience)
                .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:LongBeach"] = isolated.Connection,
                    ["BackgroundJobs:Enabled"] = "false", ["Authentication:Google:Enabled"] = "true",
                    ["Authentication:Google:ClientId"] = Audience, ["Authentication:Google:ClientRegistrationEnabled"] = "true",
                    ["Authentication:Local:ClientRegistrationEnabled"] = "true"
                })).ConfigureServices(services =>
                {
                    services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(isolated.Connection));
                    services.AddScoped<IUserRepository, UserRepository>(); services.AddScoped<IAuthService, AuthService>();
                    services.PostConfigure<JwtBearerOptions>("Google", options =>
                    {
                        options.Configuration = new OpenIdConnectConfiguration { Issuer = "https://accounts.google.com" };
                        options.Configuration.SigningKeys.Add(GoogleKey);
                        options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(options.Configuration);
                    });
                }));
            await using var scope = factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            var manager = User.Create("Gestor fictício", $"{Guid.NewGuid()}@example.invalid", "fixture-hash");
            manager.AssignRole(new Role(SystemRoles.Manager)); db.Add(manager); db.Roles.Add(new Role(SystemRoles.Student));
            await db.SaveChangesAsync(); return new(isolated, factory, manager.Id);
        }
        catch { await isolated.DisposeAsync(); throw; }
    }
    private static string Google(string subject, string email, string verified = "true") => new JwtSecurityTokenHandler().WriteToken(
        new JwtSecurityToken("https://accounts.google.com", Audience,
            [new("sub", subject), new("email", email), new("email_verified", verified), new("name", "Cliente Google fictício")],
            DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), new SigningCredentials(GoogleKey, SecurityAlgorithms.RsaSha256)));
    private static async Task<AuthResponse> Login(HttpClient client, string username, string password = Password)
    {
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(username, password));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }
    private static async Task<AccessIssued> Invite(HttpClient manager, Customer person, bool recovery = false)
    {
        var response = await manager.PostAsJsonAsync($"/api/v1/customers/{person.Id}/access/{(recovery ? "recovery" : "invitations")}", new AccessIssueInput(person.Version, true));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        return (await response.Content.ReadFromJsonAsync<AccessIssued>())!;
    }
    [PostgresFact]
    public async Task Public_local_registration_is_atomic_and_does_not_claim_matching_contact_or_internal_roles()
    {
        await using var f = await Create(); var existing = await f.Person(); using var client = f.Client();
        var input = new ClientRegistrationInput(existing.Name, existing.Phone, "cliente.teste", Password, "contact@example.invalid");
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/register", input)).StatusCode);
        var session = await Login(client, input.Username); Assert.Equal([SystemRoles.Student], session.User.Roles); Assert.Empty(session.User.Permissions);
        await using var db = f.Database.NewContext();
        var user = await db.Users.SingleAsync(x => x.Id == session.User.Id);
        Assert.True(user.LocalPasswordEnabled); Assert.Equal(0, user.CredentialVersion); Assert.Null(user.GoogleSubject);
        Assert.EndsWith("@unlinked.longbeach.invalid", user.Email);
        var customer = await db.Set<Customer>().SingleAsync(x => x.UserId == user.Id);
        Assert.NotEqual(existing.Id, customer.Id); Assert.Equal(input.Email, customer.Email);
        Assert.Null((await db.Set<Customer>().SingleAsync(x => x.Id == existing.Id)).UserId);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/auth/register", input)).StatusCode);
        Assert.Equal(2, await db.Set<Customer>().CountAsync());
        var failed = input with { Username = "other.person", Phone = "invalid" };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/register", failed)).StatusCode);
        Assert.False(await db.Users.AnyAsync(x => x.Username == failed.Username));
        using var manager = f.Client(true);
        var review = (await manager.GetFromJsonAsync<AccessReadiness>("/api/v1/customers/access-review"))!;
        Assert.Equal(2, review.Customers); Assert.Equal(1, review.LinkedCustomers); Assert.Equal(1, review.PendingCustomers);
        Assert.Contains(review.Review, x => x.CustomerId == existing.Id && x.Reason == "ReviewSharedContact");
    }
    [PostgresFact]
    public async Task Google_registration_creates_customer_disables_random_local_password_and_never_matches_email()
    {
        await using var f = await Create(); using var client = f.Client(); var subject = Guid.NewGuid().ToString(); var email = "google@example.invalid";
        client.DefaultRequestHeaders.Authorization = new("Bearer", Google(subject, email));
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/google/register", new GoogleRegistrationInput("Cliente Google", "11987654321"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/v1/auth/google", null)).StatusCode);
        await using var db = f.Database.NewContext(); var user = await db.Users.SingleAsync(x => x.GoogleSubject == subject);
        Assert.False(user.LocalPasswordEnabled); Assert.True((await db.Set<Customer>().SingleAsync(x => x.UserId == user.Id)).Phone.Length > 0);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Google("other-subject", email));
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/auth/google/register", new GoogleRegistrationInput("Outra pessoa", "11987654321"))).StatusCode);
        Assert.Equal(1, await db.Set<Customer>().CountAsync());
    }
    [PostgresFact]
    public async Task Google_login_legacy_path_also_creates_a_linked_incomplete_customer_once()
    {
        await using var f = await Create(); using var client = f.Client(); var subject = Guid.NewGuid().ToString();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Google(subject, "legacy@example.invalid"));
        var response = await client.PostAsync("/api/v1/auth/google", null); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var session = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        await using var db = f.Database.NewContext(); var customer = await db.Set<Customer>().SingleAsync(x => x.UserId == session.User.Id);
        Assert.True(customer.Incomplete); Assert.False((await db.Users.SingleAsync(x => x.Id == session.User.Id)).LocalPasswordEnabled);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/v1/auth/google", null)).StatusCode);
        Assert.Equal(1, await db.Set<Customer>().CountAsync());
    }
    [PostgresFact]
    public async Task Invite_is_hashed_reissue_revokes_old_and_only_successful_activation_consumes_it()
    {
        await using var f = await Create(); var person = await f.Person(); using var manager = f.Client(true); using var client = f.Client();
        var first = await Invite(manager, person); var next = await Invite(manager, person);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/access/inspect", new AccessTokenInput(first.Token))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/access/inspect", new AccessTokenInput(next.Token))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/access/activate", new AccessActivationInput(next.Token, "bad name", Password))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/access/activate", new AccessActivationInput(next.Token, "cliente.ativado", Password))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/access/activate", new AccessActivationInput(next.Token, "second.user", Password))).StatusCode);
        var session = await Login(client, "cliente.ativado");
        await using var db = f.Database.NewContext(); Assert.Equal(session.User.Id, (await db.Set<Customer>().SingleAsync()).UserId);
        Assert.DoesNotContain(await db.Set<ClientAccessChallenge>().Select(x => x.TokenHash).ToArrayAsync(), x => x == next.Token);
        Assert.DoesNotContain(await db.AuditLogs.Select(x => x.MetadataJson).ToArrayAsync(), x => x.Contains(next.Token) || x.Contains(Password));
        Assert.Equal(2, await db.Users.CountAsync());
    }
    [PostgresFact]
    public async Task Concurrent_invite_redemption_creates_exactly_one_account()
    {
        await using var f = await Create(); var person = await f.Person(); using var manager = f.Client(true);
        var invite = await Invite(manager, person);
        async Task<HttpStatusCode> Redeem(string username) { using var client = f.Client(); return (await client.PostAsJsonAsync("/api/v1/auth/access/activate", new AccessActivationInput(invite.Token, username, Password))).StatusCode; }
        var results = await Task.WhenAll(Redeem("primeiro.user"), Redeem("segundo.user"));
        Assert.Single(results, x => x == HttpStatusCode.NoContent); Assert.Single(results, x => x == HttpStatusCode.BadRequest);
        await using var db = f.Database.NewContext(); Assert.Equal(2, await db.Users.CountAsync()); Assert.NotNull((await db.Set<Customer>().SingleAsync()).UserId);
    }
    [PostgresTheory]
    [InlineData("expired")]
    [InlineData("revoked")]
    [InlineData("contact-changed")]
    [InlineData("inactive")]
    public async Task Invalidated_invites_cannot_create_accounts(string state)
    {
        await using var f = await Create(); var person = await f.Person(); using var manager = f.Client(true); using var client = f.Client(); var invite = await Invite(manager, person);
        await using (var db = f.Database.NewContext())
        {
            if (state == "expired") await db.Database.ExecuteSqlRawAsync("UPDATE client_access_challenges SET \"ExpiresAtUtc\"=now()-interval '1 minute'");
            if (state == "revoked") (await db.Set<ClientAccessChallenge>().SingleAsync()).Revoke(DateTimeOffset.UtcNow);
            if (state is "inactive" or "contact-changed") (await db.Set<Customer>().SingleAsync()).Change("Cliente atualizado", person.Phone, null, state == "inactive" ? "Inativo" : "Ativo");
            await db.SaveChangesAsync();
        }
        var response = await client.PostAsJsonAsync("/api/v1/auth/access/activate", new AccessActivationInput(invite.Token, "invalid.user", Password));
        Assert.Contains(response.StatusCode, new[] { HttpStatusCode.BadRequest, HttpStatusCode.Conflict });
        await using var after = f.Database.NewContext(); Assert.Equal(1, await after.Users.CountAsync()); Assert.Null((await after.Set<Customer>().SingleAsync()).UserId);
    }
    [PostgresFact]
    public async Task Google_invite_preserves_the_existing_customer_and_does_not_copy_other_identity()
    {
        await using var f = await Create(); var person = await f.Person(); using var manager = f.Client(true); using var client = f.Client();
        var invite = await Invite(manager, person); var subject = Guid.NewGuid().ToString(); client.DefaultRequestHeaders.Authorization = new("Bearer", Google(subject, "invited@example.invalid"));
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/access/activate/google", new AccessTokenInput(invite.Token))).StatusCode);
        await using var db = f.Database.NewContext(); var linked = await db.Set<Customer>().SingleAsync(); Assert.Equal(person.Id, linked.Id);
        Assert.Equal(linked.UserId, (await db.Users.SingleAsync(x => x.GoogleSubject == subject)).Id);
        var other = await f.Person("Outra ficha"); var conflict = await Invite(manager, other);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/auth/access/activate/google", new AccessTokenInput(conflict.Token))).StatusCode);
        Assert.Null((await db.Set<Customer>().SingleAsync(x => x.Id == other.Id)).UserId);
    }
    [PostgresFact]
    public async Task Recovery_invalidates_access_and_refresh_tokens_immediately_and_preserves_links()
    {
        await using var f = await Create(); using var client = f.Client(); using var manager = f.Client(true);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/register", new ClientRegistrationInput("Recuperação", "11987654321", "recover.user", Password))).StatusCode);
        var before = await Login(client, "recover.user"); // Refresh cookie stays in this client's cookie container.
        client.DefaultRequestHeaders.Authorization = new("Bearer", before.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        Customer person; await using (var db = f.Database.NewContext()) person = await db.Set<Customer>().SingleAsync();
        var invite = await Invite(manager, person, true);
        using var recovery = f.Client();
        Assert.Equal(HttpStatusCode.NoContent, (await recovery.PostAsJsonAsync("/api/v1/auth/access/recover", new AccessActivationInput(invite.Token, "recover.user", "AnotherValidPassword3!"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Add("Origin", "https://longbeach.test"); client.DefaultRequestHeaders.Add("X-CSRF-Token", before.CsrfToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/refresh", new { })).StatusCode);
        var next = await Login(recovery, "recover.user", "AnotherValidPassword3!"); Assert.Equal(before.User.Id, next.User.Id);
        await using var after = f.Database.NewContext(); var user = await after.Users.SingleAsync(x => x.Id == next.User.Id);
        Assert.Equal(1, user.CredentialVersion); Assert.Equal(person.Id, (await after.Set<Customer>().SingleAsync()).Id);
        Assert.Contains(await after.RefreshTokens.Where(x => x.UserId == user.Id).ToArrayAsync(), x => x.CredentialVersion == 1);
    }
    [PostgresFact]
    public async Task Both_methods_authenticate_the_same_user_and_need_current_identity_confirmation()
    {
        await using var f = await Create(); using var client = f.Client();
        await client.PostAsJsonAsync("/api/v1/auth/register", new ClientRegistrationInput("Dois métodos", "11987654321", "both.methods", Password));
        var session = await Login(client, "both.methods"); client.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        var subject = Guid.NewGuid().ToString(); var credential = Google(subject, "both@example.invalid");
        client.DefaultRequestHeaders.Add("X-Google-Id-Token", credential);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/me/auth-methods", new AuthMethodsInput("wrong", Action: "google"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync("/api/v1/me/auth-methods", new AuthMethodsInput(Password, Action: "google"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        var local = await Login(client, "both.methods"); Assert.Equal(session.User.Id, local.User.Id); Assert.True(local.User.GoogleLinked);
        client.DefaultRequestHeaders.Remove("X-Google-Id-Token"); client.DefaultRequestHeaders.Authorization = new("Bearer", credential);
        var googleResponse = await client.PostAsync("/api/v1/auth/google", null); Assert.Equal(HttpStatusCode.OK, googleResponse.StatusCode);
        Assert.Equal(local.User.Id, (await googleResponse.Content.ReadFromJsonAsync<AuthResponse>())!.User.Id);
        await using var db = f.Database.NewContext(); Assert.Equal(1, await db.Set<Customer>().CountAsync());
    }
}
