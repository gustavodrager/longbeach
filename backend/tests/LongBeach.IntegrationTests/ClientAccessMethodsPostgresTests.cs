using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Contracts.Auth;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
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

public sealed class ClientAccessMethodsPostgresTests
{
    private const string Audience = "client-method-tests.apps.googleusercontent.com";
    private const string InitialPassword = "LocalFixturePassword2!";
    private const string ChangedPassword = "ChangedFixturePassword3!";
    private static readonly RsaSecurityKey GoogleKey = new(RSA.Create(2048)) { KeyId = "client-method-fixture-key" };

    [PostgresFact]
    public async Task Google_only_account_adds_a_local_method_only_after_confirming_its_own_google_identity()
    {
        await using var fixture = await Create(); using var client = fixture.Client();
        var subject = Guid.NewGuid().ToString("N"); var google = Google(subject, "google-method@example.invalid");
        client.DefaultRequestHeaders.Authorization = new("Bearer", google);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/google/register",
            new GoogleRegistrationInput("Cliente Google fictício", "11987654321"))).StatusCode);
        var signedIn = await client.PostAsync("/api/v1/auth/google", null);
        Assert.Equal(HttpStatusCode.OK, signedIn.StatusCode);
        var session = (await signedIn.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.False(session.User.LocalPasswordEnabled);
        Guid customerId;
        await using (var before = fixture.Database.NewContext())
            customerId = (await before.Set<Customer>().SingleAsync()).Id;
        client.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);
        client.DefaultRequestHeaders.Add("X-Google-Id-Token", Google("unrelated-subject", "unrelated@example.invalid"));
        var input = new AuthMethodsInput(NewPassword: ChangedPassword, Username: "google.client", Action: "password");

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/me/auth-methods", input)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        await using (var unchanged = fixture.Database.NewContext())
        {
            var user = await unchanged.Users.SingleAsync(row => row.Id == session.User.Id);
            Assert.False(user.LocalPasswordEnabled); Assert.Null(user.Username); Assert.Equal(0, user.CredentialVersion);
            Assert.Equal(subject, user.GoogleSubject); Assert.Equal(2, await unchanged.Users.CountAsync());
        }

        client.DefaultRequestHeaders.Remove("X-Google-Id-Token");
        client.DefaultRequestHeaders.Add("X-Google-Id-Token", google);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync("/api/v1/me/auth-methods", input)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Google-Id-Token");
        client.DefaultRequestHeaders.Authorization = null;
        var local = await Login(client, input.Username!, ChangedPassword);
        Assert.Equal(session.User.Id, local.User.Id); Assert.True(local.User.LocalPasswordEnabled); Assert.True(local.User.GoogleLinked);
        client.DefaultRequestHeaders.Authorization = new("Bearer", google);
        var googleAgain = await client.PostAsync("/api/v1/auth/google", null);
        Assert.Equal(HttpStatusCode.OK, googleAgain.StatusCode);
        Assert.Equal(local.User.Id, (await googleAgain.Content.ReadFromJsonAsync<AuthResponse>())!.User.Id);
        await using var after = fixture.Database.NewContext();
        var persisted = await after.Users.SingleAsync(row => row.Id == session.User.Id);
        Assert.Equal(1, persisted.CredentialVersion); Assert.True(persisted.LocalPasswordEnabled);
        Assert.Equal(subject, persisted.GoogleSubject);
        Assert.Equal(customerId, (await after.Set<Customer>().SingleAsync()).Id);
        Assert.Equal(session.User.Id, (await after.Set<Customer>().SingleAsync()).UserId);
        Assert.Equal(2, await after.Users.CountAsync());
    }

    [PostgresTheory]
    [InlineData("inactive")]
    [InlineData("internal-profile")]
    public async Task Recovery_issued_before_a_block_or_internal_profile_change_cannot_reset_the_account(string state)
    {
        await using var fixture = await Create(); using var client = fixture.Client(); using var manager = fixture.Client(true);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/register",
            new ClientRegistrationInput("Cliente recuperação", "11987654321", "recovery.original", InitialPassword))).StatusCode);
        var session = await Login(client, "recovery.original", InitialPassword);
        Customer customer;
        string previousHash;
        await using (var db = fixture.Database.NewContext())
        {
            customer = await db.Set<Customer>().SingleAsync();
            previousHash = (await db.Users.SingleAsync(row => row.Id == session.User.Id)).PasswordHash;
        }
        var issued = await Recovery(manager, customer);
        await using (var db = fixture.Database.NewContext())
        {
            var user = await db.Users.Include(row => row.UserRoles).ThenInclude(row => row.Role).SingleAsync(row => row.Id == session.User.Id);
            if (state == "inactive") user.Deactivate();
            else user.SetRole(await db.Roles.SingleAsync(row => row.Name == SystemRoles.Manager));
            await db.SaveChangesAsync();
        }
        using var recovering = fixture.Client();

        Assert.Equal(HttpStatusCode.Conflict, (await recovering.PostAsJsonAsync("/api/v1/auth/access/recover",
            new AccessActivationInput(issued.Token, "recovery.changed", ChangedPassword))).StatusCode);

        await using var after = fixture.Database.NewContext();
        var unchanged = await after.Users.SingleAsync(row => row.Id == session.User.Id);
        Assert.Equal(previousHash, unchanged.PasswordHash); Assert.Equal("recovery.original", unchanged.Username);
        Assert.Equal(0, unchanged.CredentialVersion);
        var challenge = await after.Set<ClientAccessChallenge>().SingleAsync();
        Assert.Null(challenge.ConsumedAtUtc); Assert.Null(challenge.RevokedAtUtc);
        Assert.Equal(session.User.Id, (await after.Set<Customer>().SingleAsync()).UserId);
        Assert.Equal(2, await after.Users.CountAsync());
    }

    [PostgresFact]
    public async Task An_existing_jwt_without_a_credential_claim_is_rejected_immediately_after_recovery()
    {
        await using var fixture = await Create(); using var client = fixture.Client(); using var manager = fixture.Client(true);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/register",
            new ClientRegistrationInput("Cliente legado", "11987654321", "legacy.client", InitialPassword))).StatusCode);
        var session = await Login(client, "legacy.client", InitialPassword);
        var legacyJwt = ProfileAuthorizationTests.Token(session.User.Id, [SystemRoles.Student], [], registerUser: false);
        Assert.DoesNotContain(new JwtSecurityTokenHandler().ReadJwtToken(legacyJwt).Claims, claim => claim.Type == "credential_version");
        client.DefaultRequestHeaders.Authorization = new("Bearer", legacyJwt);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        Customer customer;
        await using (var db = fixture.Database.NewContext()) customer = await db.Set<Customer>().SingleAsync();
        var issued = await Recovery(manager, customer);
        using var recovering = fixture.Client();

        Assert.Equal(HttpStatusCode.NoContent, (await recovering.PostAsJsonAsync("/api/v1/auth/access/recover",
            new AccessActivationInput(issued.Token, "legacy.client", ChangedPassword))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);

        var next = await Login(recovering, "legacy.client", ChangedPassword);
        Assert.Equal(session.User.Id, next.User.Id);
        await using var after = fixture.Database.NewContext();
        Assert.Equal(1, (await after.Users.SingleAsync(row => row.Id == session.User.Id)).CredentialVersion);
    }

    private sealed class Fixture(IsolatedMaterialDatabase database, WebApplicationFactory<Program> factory, Guid manager) : IAsyncDisposable
    {
        public IsolatedMaterialDatabase Database => database;
        public HttpClient Client(bool asManager = false)
        {
            var client = factory.CreateClient();
            if (asManager) client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(manager, [SystemRoles.Manager], registerUser: false));
            return client;
        }
        public async ValueTask DisposeAsync() { await factory.DisposeAsync(); await database.DisposeAsync(); }
    }
    private static async Task<Fixture> Create()
    {
        var isolated = await IsolatedMaterialDatabase.Create();
        WebApplicationFactory<Program>? factory = null;
        try
        {
            factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
                .UseSetting("Authentication:Google:Enabled", "true").UseSetting("Authentication:Google:ClientId", Audience)
                .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:LongBeach"] = isolated.Connection, ["BackgroundJobs:Enabled"] = "false",
                    ["Authentication:Google:Enabled"] = "true", ["Authentication:Google:ClientId"] = Audience,
                    ["Authentication:Google:ClientRegistrationEnabled"] = "true", ["Authentication:Local:Enabled"] = "true",
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
            var user = User.Create("Gestor fixture", $"{Guid.NewGuid()}@example.invalid", "manager-fixture-hash");
            user.AssignRole(new Role(SystemRoles.Manager)); db.Add(user); db.Roles.Add(new Role(SystemRoles.Student));
            await db.SaveChangesAsync(); return new(isolated, factory, user.Id);
        }
        catch
        {
            if (factory is not null) await factory.DisposeAsync();
            await isolated.DisposeAsync(); throw;
        }
    }
    private static string Google(string subject, string email) => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
        "https://accounts.google.com", Audience, [new("sub", subject), new("email", email), new("email_verified", "true")],
        DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), new SigningCredentials(GoogleKey, SecurityAlgorithms.RsaSha256)));
    private static async Task<AuthResponse> Login(HttpClient client, string username, string password)
    {
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(username, password));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }
    private static async Task<AccessIssued> Recovery(HttpClient manager, Customer customer)
    {
        var response = await manager.PostAsJsonAsync($"/api/v1/customers/{customer.Id}/access/recovery", new AccessIssueInput(customer.Version, true));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); return (await response.Content.ReadFromJsonAsync<AccessIssued>())!;
    }
}
