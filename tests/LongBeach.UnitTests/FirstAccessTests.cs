using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Security;
using Microsoft.Extensions.Options;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace LongBeach.UnitTests;

public sealed class FirstAccessTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 6, 0, 0, 0, TimeSpan.Zero);
    private const string Initial = "test-initial";
    private static User Pending() { var u = User.CreateForFirstAccess("Test owner", "test.owner", "hash:" + Initial, Now.AddDays(1)); u.AssignRole(new Role("Owner")); return u; }

    [Fact] public async Task Username_login_is_case_insensitive_and_temporary_session_has_no_privileges()
    {
        var user = Pending(); var session = await Service(user).LoginAsync(" TEST.OWNER ", Initial, null);
        Assert.True(session.Response.User.RequiresFirstAccess);
        Assert.Empty(session.Response.User.Roles); Assert.Empty(session.Response.User.Permissions);
        Assert.Equal("", session.Response.User.Email);
        Assert.Equal(Now.AddMinutes(15), session.RefreshTokenExpiresAtUtc);
        Assert.True(Assert.Single(user.RefreshTokens).FirstAccessOnly);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(session.Response.AccessToken);
        Assert.Contains(jwt.Claims, c => c.Type == "requires_first_access" && c.Value == "true");
        Assert.DoesNotContain(jwt.Claims, c => c.Type == ClaimTypes.Role || c.Type == "permission");
    }

    [Fact] public async Task Expired_initial_login_is_rejected()
    {
        var user = User.CreateForFirstAccess("Test", "expired", "hash:" + Initial, Now);
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => Service(user).LoginAsync("expired", Initial, null));
    }

    [Fact] public async Task Completing_password_revokes_initial_password_and_refresh_and_releases_owner_role()
    {
        var user = Pending(); var service = Service(user); var old = await service.LoginAsync("test.owner", Initial, null);
        await service.ChangePasswordAsync(user.Id, Initial, "PermanentPassword2!", null);
        Assert.False(user.RequiresFirstAccess);
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => service.LoginAsync("test.owner", Initial, null));
        await Assert.ThrowsAsync<InvalidRefreshTokenException>(() => service.RefreshAsync(old.RefreshToken, null, false, null));
        var completed = await service.LoginAsync("test.owner", "PermanentPassword2!", null);
        Assert.Contains("Owner", completed.Response.User.Roles);
    }

    [Fact] public async Task Google_self_link_uses_verified_subject_and_no_allowlist_entry_is_needed_later()
    {
        var user = Pending(); var service = Service(user);
        var session = await service.CompleteFirstAccessWithGoogleAsync(user.Id, "google-subject", "person@example.test", null);
        Assert.False(session.Response.User.RequiresFirstAccess); Assert.Contains("Owner", session.Response.User.Roles);
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => service.LoginAsync("test.owner", Initial, null));
        var next = await service.LoginWithGoogleAsync("changed@example.test", null, subject: "google-subject", allowEmailMatch: false);
        Assert.Equal(user.Id, next.Response.User.Id);
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => service.LoginWithGoogleAsync("person@example.test", null, subject: "other-subject", allowEmailMatch: true));
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => service.CompleteFirstAccessWithGoogleAsync(user.Id, "another-subject", "other@example.test", null));
    }

    [Fact] public async Task Google_cannot_claim_an_email_already_used_by_another_account()
    {
        var user = Pending(); var existing = User.Create("Existing", "existing@example.test", "hash:permanent");
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => Service(user, existing).CompleteFirstAccessWithGoogleAsync(user.Id, "new-subject", existing.Email, null));
        Assert.True(user.RequiresFirstAccess); Assert.Null(user.GoogleSubject);
    }

    [Fact] public async Task A_temporary_refresh_written_during_completion_cannot_escalate_to_full_access()
    {
        var user = Pending(); var service = Service(user);
        user.CompleteFirstAccess();
        var token = Tokens().Issue(new(user.Id, user.Name, user.Email, [], [], true), Now);
        user.AddRefreshToken(RefreshToken.Create(token.RefreshTokenId,user.Id,token.RefreshTokenId,token.RefreshTokenHash,token.CsrfTokenHash,Now.AddMinutes(15),null,true));
        await Assert.ThrowsAsync<InvalidRefreshTokenException>(() => service.RefreshAsync(token.RefreshToken, null, false, null));
    }

    [Fact] public async Task Initial_password_does_not_weaken_permanent_password_policy()
    {
        var user = Pending();
        await Assert.ThrowsAsync<WeakPasswordException>(() => Service(user).ChangePasswordAsync(user.Id, Initial, "short", null));
        Assert.True(user.RequiresFirstAccess);
    }

    private static AuthService Service(params User[] users) => new(new MemoryUsers(users), new Hashes(), Tokens(), new Clock());
    private static JwtTokenService Tokens() => new(Options.Create(new JwtOptions { Issuer="test", Audience="test", SigningKey="test-only-key-with-more-than-thirty-two-characters", AccessTokenMinutes=30, RefreshTokenDays=30 }));
    private sealed class Clock : TimeProvider { public override DateTimeOffset GetUtcNow() => Now; }
    private sealed class Hashes : IPasswordHasher
    {
        public string DummyHash => "hash:dummy";
        public string Hash(string password) => "hash:" + password;
        public PasswordHashVerificationResult Verify(string password,string encodedHash) => encodedHash == Hash(password) ? PasswordHashVerificationResult.Success : PasswordHashVerificationResult.Failed;
    }
    private sealed class MemoryUsers(User[] users) : IUserRepository
    {
        public Task<User?> FindByIdAsync(Guid id,CancellationToken cancellationToken=default) => Task.FromResult(users.SingleOrDefault(x=>x.Id==id));
        public Task<User?> FindByEmailAsync(string email,CancellationToken cancellationToken=default) => Task.FromResult(users.SingleOrDefault(x=>x.NormalizedEmail==email));
        public Task<User?> FindByUsernameAsync(string username,CancellationToken cancellationToken=default) => Task.FromResult(users.SingleOrDefault(x=>x.NormalizedUsername==username));
        public Task<User?> FindByGoogleSubjectAsync(string subject,CancellationToken cancellationToken=default) => Task.FromResult(users.SingleOrDefault(x=>x.GoogleSubject==subject));
        public Task<User?> FindByRefreshTokenHashAsync(string hash,CancellationToken cancellationToken=default) => Task.FromResult(users.SingleOrDefault(x=>x.RefreshTokens.Any(t=>t.TokenHash==hash)));
        public Task AddAsync(User user,CancellationToken cancellationToken=default) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken=default) => Task.CompletedTask;
    }
}
