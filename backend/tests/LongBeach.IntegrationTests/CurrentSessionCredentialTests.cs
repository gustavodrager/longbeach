using System.Security.Claims;
using LongBeach.Api;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Security;
using Microsoft.Extensions.Options;
using System.IdentityModel.Tokens.Jwt;

namespace LongBeach.IntegrationTests;

public sealed class CurrentSessionCredentialTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 2, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Legacy_access_is_valid_only_until_the_first_credential_invalidation()
    {
        var user = Client();
        var validator = new CurrentSessionValidator(new MemoryUsers(user), new Clock());
        var legacy = Principal(user);
        Assert.NotNull(await validator.ValidateAsync(legacy));

        user.InvalidateCredentials(Now, null, "Account recovered");

        Assert.Null(await validator.ValidateAsync(legacy));
        Assert.Null(await validator.ValidateAsync(Principal(user, "0")));
        Assert.NotNull(await validator.ValidateAsync(Principal(user, "1")));
    }

    [Theory]
    [InlineData("")]
    [InlineData("-1")]
    [InlineData("+0")]
    [InlineData("0.0")]
    [InlineData("2147483648")]
    [InlineData("0 ")]
    [InlineData("garbled")]
    public async Task Malformed_credential_claims_are_rejected(string version)
    {
        var user = Client();
        var validator = new CurrentSessionValidator(new MemoryUsers(user), new Clock());

        Assert.Null(await validator.ValidateAsync(Principal(user, version)));
    }

    [Fact]
    public async Task Duplicated_credential_claims_are_rejected_even_when_the_first_matches()
    {
        var user = Client();
        var validator = new CurrentSessionValidator(new MemoryUsers(user), new Clock());

        Assert.Null(await validator.ValidateAsync(Principal(user, "0", "0")));
        Assert.Null(await validator.ValidateAsync(Principal(user, "0", "1")));
    }

    [Fact]
    public async Task Password_change_invalidates_the_same_access_principal_immediately()
    {
        var user = Client();
        var repository = new MemoryUsers(user);
        var validator = new CurrentSessionValidator(repository, new Clock());
        var tokens = TokenService();
        var service = new AuthService(repository, new Hashes(), tokens, new Clock());
        var session = await service.LoginAsync(user.Email, "CurrentPassword1!", null);
        var access = new ClaimsPrincipal(new ClaimsIdentity(new JwtSecurityTokenHandler().ReadJwtToken(session.Response.AccessToken).Claims, "fixture"));
        Assert.NotNull(await validator.ValidateAsync(access));

        await service.ChangePasswordAsync(user.Id, "CurrentPassword1!", "ChangedPassword2!", null);

        Assert.Null(await validator.ValidateAsync(access));
        await Assert.ThrowsAsync<InvalidRefreshTokenException>(() => service.RefreshAsync(session.RefreshToken, null, false, null));
        var next = await service.LoginAsync(user.Email, "ChangedPassword2!", null);
        var nextAccess = new ClaimsPrincipal(new ClaimsIdentity(new JwtSecurityTokenHandler().ReadJwtToken(next.Response.AccessToken).Claims, "fixture"));
        Assert.NotNull(await validator.ValidateAsync(nextAccess));
    }

    [Fact]
    public async Task Current_local_method_state_replaces_stale_claims_without_trusting_the_client()
    {
        var user = Client();
        user.DisableLocalPassword("random-hash");
        var validator = new CurrentSessionValidator(new MemoryUsers(user), new Clock());
        var principal = Principal(user, "0");
        ((ClaimsIdentity)principal.Identity!).AddClaim(new("local_password_enabled", "true"));

        var current = await validator.ValidateAsync(principal);

        Assert.NotNull(current);
        Assert.Equal("false", Assert.Single(current.FindAll("local_password_enabled")).Value);
    }

    [Fact]
    public void Newly_minted_jwt_contains_the_credential_version_and_local_method_state()
    {
        var user = Client();
        var token = TokenService().Issue(new(user.Id, user.Name, user.Email, [SystemRoles.Student], [],
            CredentialVersion: 7, LocalPasswordEnabled: false), Now);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token.AccessToken);

        Assert.Equal("7", Assert.Single(jwt.Claims, claim => claim.Type == "credential_version").Value);
        Assert.Equal("false", Assert.Single(jwt.Claims, claim => claim.Type == "local_password_enabled").Value);
    }

    private static User Client()
    {
        var user = User.Create("Cliente fixture", "client@example.test", "hash:CurrentPassword1!");
        user.AssignRole(new Role(SystemRoles.Student));
        return user;
    }

    private static ClaimsPrincipal Principal(User user, params string[] versions)
    {
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, user.Id.ToString()), new(ClaimTypes.Role, SystemRoles.Student) };
        claims.AddRange(versions.Select(value => new Claim("credential_version", value)));
        return new(new ClaimsIdentity(claims, "fixture"));
    }

    private static JwtTokenService TokenService() => new(Options.Create(new JwtOptions
    {
        Issuer = "credential-tests", Audience = "credential-tests", SigningKey = "test-only-credential-key-longer-than-thirty-two-characters"
    }));

    private sealed class Clock : TimeProvider { public override DateTimeOffset GetUtcNow() => Now; }
    private sealed class Hashes : IPasswordHasher
    {
        public string DummyHash => "hash:dummy";
        public string Hash(string password) => "hash:" + password;
        public PasswordHashVerificationResult Verify(string password, string encodedHash) =>
            encodedHash == Hash(password) ? PasswordHashVerificationResult.Success : PasswordHashVerificationResult.Failed;
    }
    private sealed class MemoryUsers(User user) : IUserRepository
    {
        public Task<User?> FindByIdAsync(Guid id, CancellationToken ct = default) => Task.FromResult<User?>(id == user.Id ? user : null);
        public Task<User?> FindByEmailAsync(string email, CancellationToken ct = default) => Task.FromResult<User?>(email == user.NormalizedEmail ? user : null);
        public Task<User?> FindByUsernameAsync(string username, CancellationToken ct = default) => Task.FromResult<User?>(username == user.NormalizedUsername ? user : null);
        public Task<User?> FindByGoogleSubjectAsync(string subject, CancellationToken ct = default) => Task.FromResult<User?>(subject == user.GoogleSubject ? user : null);
        public Task<User?> FindByRefreshTokenHashAsync(string hash, CancellationToken ct = default) => Task.FromResult<User?>(user.RefreshTokens.Any(token => token.TokenHash == hash) ? user : null);
        public Task AddAsync(User value, CancellationToken ct = default) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
    }
}
