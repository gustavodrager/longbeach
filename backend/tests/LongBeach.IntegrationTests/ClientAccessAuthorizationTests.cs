using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Auth;
using LongBeach.Application.Customers;
using LongBeach.Contracts.Auth;
using LongBeach.Contracts.Customers;
using LongBeach.Domain.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class ClientAccessAuthorizationTests
{
    private const string GoogleAudience = "client-access-test.apps.googleusercontent.com";
    private static readonly RsaSecurityKey GoogleKey = new(RSA.Create(2048)) { KeyId = "test-only-client-access-google" };

    [Fact]
    public async Task Anonymous_requests_cannot_read_or_manage_customer_access_or_guardians()
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        await using var factory = Factory(access, guardians); using var client = factory.CreateClient();

        foreach (var request in AdministrativeRequests())
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);

        Assert.Equal(0, access.Calls); Assert.Equal(0, guardians.Calls);
    }

    [Theory]
    [InlineData(SystemRoles.Operations)]
    [InlineData(SystemRoles.Teacher)]
    [InlineData(SystemRoles.Student)]
    public async Task Current_non_manager_profile_rejects_old_manager_claims_for_every_access_endpoint(string role)
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        await using var factory = Factory(access, guardians); using var client = factory.CreateClient();
        var user = TestSessionUsers.Register(Guid.NewGuid(), role);
        client.DefaultRequestHeaders.Authorization = new("Bearer", BroadToken(user));

        foreach (var request in AdministrativeRequests())
            Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(request)).StatusCode);

        Assert.Equal(0, access.Calls); Assert.Equal(0, guardians.Calls);
    }

    [Fact]
    public async Task Pending_first_access_cannot_manage_accounts_or_use_normal_method_settings()
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        await using var factory = Factory(access, guardians); using var client = factory.CreateClient();
        var user = User.CreateForFirstAccess("Pending fixture", "pending.fixture", "test-hash", DateTimeOffset.UtcNow.AddDays(1));
        user.AssignRole(new Role(SystemRoles.Manager)); TestSessionUsers.Add(user);
        client.DefaultRequestHeaders.Authorization = new("Bearer", BroadToken(user, firstAccess: true));

        foreach (var request in AdministrativeRequests())
            Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(request)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/me/auth-methods")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/v1/me/auth-methods", new AuthMethodsInput(Action: "password"))).StatusCode);

        Assert.Equal(0, access.Calls); Assert.Equal(0, guardians.Calls);
    }

    [Fact]
    public async Task Credential_invalidation_stops_a_manager_from_reissuing_links_with_the_old_session()
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        await using var factory = Factory(access, guardians); using var client = factory.CreateClient();
        var user = TestSessionUsers.Register(Guid.NewGuid(), SystemRoles.Manager);
        client.DefaultRequestHeaders.Authorization = new("Bearer", BroadToken(user));
        user.InvalidateCredentials(DateTimeOffset.UtcNow, null, "Verified recovery fixture");

        foreach (var request in AdministrativeRequests())
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);

        Assert.Equal(0, access.Calls); Assert.Equal(0, guardians.Calls);
    }

    [Fact]
    public async Task Completed_manager_can_reach_access_and_guardian_handlers_without_changing_permissions()
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        await using var factory = Factory(access, guardians); using var client = factory.CreateClient();
        var user = TestSessionUsers.Register(Guid.NewGuid(), SystemRoles.Manager);
        client.DefaultRequestHeaders.Authorization = new("Bearer", BroadToken(user));

        foreach (var request in AdministrativeRequests())
        {
            var response = await client.SendAsync(request);
            Assert.True(response.IsSuccessStatusCode);
            Assert.Contains("no-store", response.Headers.CacheControl?.ToString());
        }

        Assert.Equal(5, access.Calls); Assert.Equal(3, guardians.Calls);
    }

    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, null)]
    public async Task Local_public_registration_requires_both_an_enabled_login_and_explicit_registration_flag(bool login, bool? registration)
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        var settings = new Dictionary<string, string?> { ["Authentication:Local:Enabled"] = login.ToString() };
        if (registration is not null) settings["Authentication:Local:ClientRegistrationEnabled"] = registration.Value.ToString();
        await using var factory = Factory(access, guardians, settings); using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/auth/register", Registration());
        var options = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/options");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.False(options.GetProperty("localRegistrationEnabled").GetBoolean());
        Assert.Equal(login, options.GetProperty("localLoginEnabled").GetBoolean());
        Assert.Equal(0, access.Calls);
    }

    [Fact]
    public async Task Explicit_local_registration_flag_enables_the_public_handler_and_no_store_response()
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        await using var factory = Factory(access, guardians, new Dictionary<string, string?>
        {
            ["Authentication:Local:Enabled"] = "true", ["Authentication:Local:ClientRegistrationEnabled"] = "true"
        });
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/auth/register", Registration());

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString());
        Assert.Equal(1, access.Calls);
    }

    [Fact]
    public async Task Disabling_local_login_blocks_token_activation_and_recovery_before_the_service()
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        await using var factory = Factory(access, guardians, new Dictionary<string, string?> { ["Authentication:Local:Enabled"] = "false" });
        using var client = factory.CreateClient();
        var input = new AccessActivationInput(new string('a', 64), "fixture.client", "ExamplePassword2!");

        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/auth/access/activate", input)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/auth/access/recover", input)).StatusCode);
        Assert.Equal(0, access.Calls);
    }

    [Theory]
    [InlineData("password", HttpStatusCode.Forbidden, 0)]
    [InlineData("google", HttpStatusCode.NoContent, 1)]
    public async Task Disabling_local_login_blocks_password_setup_without_disabling_google_linking(string action, HttpStatusCode expected, int calls)
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        await using var factory = Factory(access, guardians, new Dictionary<string, string?> { ["Authentication:Local:Enabled"] = "false" });
        using var client = factory.CreateClient();
        var user = TestSessionUsers.Register(Guid.NewGuid(), SystemRoles.Manager);
        client.DefaultRequestHeaders.Authorization = new("Bearer", BroadToken(user));
        if (action == "google") client.DefaultRequestHeaders.Add("X-Google-Id-Token", GoogleCredential());

        var response = await client.PutAsJsonAsync("/api/v1/me/auth-methods", new AuthMethodsInput(
            CurrentPassword: "CurrentFixturePassword2!", NewPassword: "ChangedFixturePassword3!", Username: "fixture.client", Action: action));

        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(calls, access.Calls);
    }

    [Theory]
    [InlineData("false")]
    [InlineData(null)]
    public async Task Google_public_registration_is_disabled_unless_explicitly_enabled(string? registration)
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        var settings = new Dictionary<string, string?>();
        if (registration is not null) settings["Authentication:Google:ClientRegistrationEnabled"] = registration;
        await using var factory = Factory(access, guardians, settings); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", GoogleCredential());

        var response = await client.PostAsJsonAsync("/api/v1/auth/google/register", new GoogleRegistrationInput("Cliente fixture", "11999990000"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, access.Calls);
    }

    [Fact]
    public async Task A_google_provider_token_cannot_be_used_as_an_internal_manager_session()
    {
        var access = new AccessStub(); var guardians = new GuardiansStub();
        await using var factory = Factory(access, guardians); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", GoogleCredential());

        foreach (var request in AdministrativeRequests())
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);

        Assert.Equal(0, access.Calls); Assert.Equal(0, guardians.Calls);
    }

    private static ClientRegistrationInput Registration() => new("Cliente fixture", "11999990000", "fixture.client", "ExamplePassword2!");
    private static IEnumerable<HttpRequestMessage> AdministrativeRequests()
    {
        var prefix = $"/api/v1/customers/{Guid.NewGuid()}";
        yield return new(HttpMethod.Get, "/api/v1/customers/access-review");
        yield return new(HttpMethod.Get, prefix + "/access");
        yield return JsonRequest(HttpMethod.Post, prefix + "/access/invitations", new AccessIssueInput(1, true));
        yield return JsonRequest(HttpMethod.Post, prefix + "/access/recovery", new AccessIssueInput(1, true));
        yield return JsonRequest(HttpMethod.Post, prefix + "/access/revoke", new AccessIssueInput(1, true));
        yield return new(HttpMethod.Get, prefix + "/guardians");
        yield return new(HttpMethod.Get, prefix + "/guardian-candidates?search=fixture");
        yield return JsonRequest(HttpMethod.Put, prefix + $"/guardians/{Guid.NewGuid()}", new CustomerGuardianInput(true, 0));
    }
    private static HttpRequestMessage JsonRequest<T>(HttpMethod method, string path, T input) => new(method, path) { Content = JsonContent.Create(input) };

    private static string BroadToken(User user, bool firstAccess = false)
    {
        var claims = new List<Claim> { new("sub", user.Id.ToString()), new(ClaimTypes.Role, SystemRoles.Manager) };
        claims.AddRange(SystemPermissions.All.Select(permission => new Claim("permission", permission)));
        if (firstAccess) claims.Add(new("requires_first_access", "true"));
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", claims,
            DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256)));
    }
    private static string GoogleCredential() => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
        "https://accounts.google.com", GoogleAudience,
        [new("sub", "google-fixture-subject"), new("email", "google@example.test"), new("email_verified", "true"),
         new(ClaimTypes.Role, SystemRoles.Manager), new("permission", SystemPermissions.UsersManage)],
        DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), new SigningCredentials(GoogleKey, SecurityAlgorithms.RsaSha256)));

    private static WebApplicationFactory<Program> Factory(AccessStub access, GuardiansStub guardians, Dictionary<string, string?>? settings = null) =>
        new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .UseSetting("Authentication:Google:Enabled", "true").UseSetting("Authentication:Google:ClientId", GoogleAudience)
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(settings ?? []))
            .ConfigureServices(services =>
            {
                services.AddSingleton<IClientAccess>(access); services.AddSingleton<ICustomerGuardians>(guardians);
                services.PostConfigure<JwtBearerOptions>("Google", options =>
                {
                    options.Configuration = new OpenIdConnectConfiguration { Issuer = "https://accounts.google.com" };
                    options.Configuration.SigningKeys.Add(GoogleKey);
                    options.ConfigurationManager = new Microsoft.IdentityModel.Protocols.StaticConfigurationManager<OpenIdConnectConfiguration>(options.Configuration);
                });
            }));

    private sealed class AccessStub : IClientAccess
    {
        public int Calls { get; private set; }
        private Task Done() { Calls++; return Task.CompletedTask; }
        public Task Register(ClientRegistrationInput input, CancellationToken ct) => Done();
        public Task RegisterGoogle(GoogleRegistrationInput input, VerifiedGoogleIdentity google, CancellationToken ct) => Done();
        public Task<CustomerAccessStatus> Status(Guid customer, CancellationToken ct)
        { Calls++; return Task.FromResult(new CustomerAccessStatus("Pending", null, null, false, false, null)); }
        public Task<AccessIssued> Issue(Guid customer, AccessIssueInput input, Guid actor, bool recovery, CancellationToken ct)
        { Calls++; return Task.FromResult(new AccessIssued(new string('a', 64), DateTimeOffset.UtcNow.AddMinutes(5), recovery ? "Recovery" : "Activation")); }
        public Task Revoke(Guid customer, AccessIssueInput input, CancellationToken ct) => Done();
        public Task<AccessInspection> Inspect(string token, CancellationToken ct)
        { Calls++; return Task.FromResult(new AccessInspection("Activation", DateTimeOffset.UtcNow.AddMinutes(5))); }
        public Task Activate(AccessActivationInput input, CancellationToken ct) => Done();
        public Task ActivateGoogle(string token, VerifiedGoogleIdentity google, CancellationToken ct) => Done();
        public Task Recover(AccessActivationInput input, CancellationToken ct) => Done();
        public Task<AuthMethods> Methods(Guid user, CancellationToken ct)
        { Calls++; return Task.FromResult(new AuthMethods("fixture.client", false, true)); }
        public Task ChangeMethods(Guid user, AuthMethodsInput input, VerifiedGoogleIdentity? google, string? ip, CancellationToken ct) => Done();
        public Task<AccessReadiness> Readiness(CancellationToken ct)
        { Calls++; return Task.FromResult(new AccessReadiness(DateTimeOffset.UtcNow, 0, 0, 0, 0, 0, [])); }
    }
    private sealed class GuardiansStub : ICustomerGuardians
    {
        public int Calls { get; private set; }
        public Task<IReadOnlyList<GuardianDto>> List(Guid customerId, CancellationToken ct)
        { Calls++; return Task.FromResult<IReadOnlyList<GuardianDto>>([]); }
        public Task<IReadOnlyList<CustomerUserCandidate>> Candidates(Guid customerId, string? search, CancellationToken ct)
        { Calls++; return Task.FromResult<IReadOnlyList<CustomerUserCandidate>>([]); }
        public Task<GuardianDto> Set(Guid customerId, Guid userId, CustomerGuardianInput input, Guid actor, CancellationToken ct)
        { Calls++; return Task.FromResult(new GuardianDto(customerId, userId, "Fixture", "g•••@example.test", input.IsGranted, 1)); }
    }
}
