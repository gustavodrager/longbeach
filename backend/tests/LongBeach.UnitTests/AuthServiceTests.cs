using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Domain.Identity;

namespace LongBeach.UnitTests;

public sealed class AuthServiceTests
{
    private static readonly DateTimeOffset Now =
        new(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Google_login_issues_a_Long_Beach_session_for_an_existing_active_account()
    {
        var user = ActiveUser("Arena Owner", "owner@example.test", "valid-hash");
        var repository = new FakeUserRepository(user);
        var service = new AuthService(
            repository,
            new FakePasswordHasher(),
            new FakeTokenService(),
            new FixedTimeProvider(Now));

        var session = await service.LoginWithGoogleAsync("owner@example.test", "google-client-ip",
            subject: "verified-google-subject", allowEmailMatch: true);

        Assert.Equal("owner@example.test", session.Response.User.Email);
        Assert.Equal("verified-google-subject", user.GoogleSubject);
        Assert.True(session.Response.User.GoogleLinked);
        Assert.Equal("access-token", session.Response.AccessToken);
        Assert.Equal(Now.AddHours(8), session.RefreshTokenExpiresAtUtc);
        Assert.Equal(1, Assert.Single(user.RefreshTokens).CredentialVersion);
        Assert.Equal(1, user.CredentialVersion);
        Assert.True(session.Response.User.LocalPasswordEnabled);
        Assert.Equal(1, repository.SaveCount);
    }

    [Fact]
    public async Task Google_email_fallback_is_disabled_unless_explicitly_authorized()
    {
        var user = ActiveUser("Owner", "owner@example.test", "valid-hash");
        var repository = new FakeUserRepository(user);
        var service = new AuthService(repository, new FakePasswordHasher(), new FakeTokenService(), new FixedTimeProvider(Now));
        await Assert.ThrowsAsync<AuthenticationFailedException>(() =>
            service.LoginWithGoogleAsync(user.Email, null, subject: "subject"));
        Assert.Null(user.GoogleSubject);
        Assert.Empty(user.RefreshTokens);
        Assert.Equal(0, repository.SaveCount);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    public async Task Google_email_fallback_requires_a_subject(string? subject)
    {
        var user = ActiveUser("Owner", "owner@example.test", "valid-hash");
        var repository = new FakeUserRepository(user);
        var service = new AuthService(repository, new FakePasswordHasher(), new FakeTokenService(), new FixedTimeProvider(Now));
        await Assert.ThrowsAsync<AuthenticationFailedException>(() =>
            service.LoginWithGoogleAsync(user.Email, null, subject: subject, allowEmailMatch: true));
        Assert.Null(user.GoogleSubject);
        Assert.Empty(user.RefreshTokens);
        Assert.Equal(0, repository.SaveCount);
    }

    [Fact]
    public async Task Refresh_rotates_token_inside_the_same_family()
    {
        var user = ActiveUser("Arena Owner", "owner@longbeach.local", "valid-hash");
        var familyId = Guid.NewGuid();
        var oldToken = RefreshToken.Create(
            Guid.NewGuid(), user.Id, familyId, "hash:old", "csrf:old", Now.AddDays(30), "old-ip");
        user.AddRefreshToken(oldToken);
        var repository = new FakeUserRepository(user);
        var service = new AuthService(
            repository,
            new FakePasswordHasher(),
            new FakeTokenService(),
            new FixedTimeProvider(Now));

        var session = await service.RefreshAsync("old", null, false, "new-ip");

        Assert.Equal("new", session.RefreshToken);
        Assert.Equal(Now, oldToken.RevokedAtUtc);
        Assert.Equal("Rotated", oldToken.RevocationReason);
        var replacement = Assert.Single(user.RefreshTokens, item => item.Id != oldToken.Id);
        Assert.Equal(familyId, replacement.FamilyId);
        Assert.Equal(replacement.Id, oldToken.ReplacedByTokenId);
        Assert.Equal(1, repository.SaveCount);
    }

    [Fact]
    public async Task Reusing_a_rotated_token_revokes_the_entire_family()
    {
        var user = ActiveUser("Arena Owner", "owner@longbeach.local", "valid-hash");
        var familyId = Guid.NewGuid();
        var oldToken = RefreshToken.Create(
            Guid.NewGuid(), user.Id, familyId, "hash:old", "csrf:old", Now.AddDays(30), "old-ip");
        var currentToken = RefreshToken.Create(
            Guid.NewGuid(), user.Id, familyId, "hash:current", "csrf:current", Now.AddDays(30), "new-ip");
        oldToken.Revoke(Now.AddMinutes(-1), "new-ip", "Rotated", currentToken.Id);
        user.AddRefreshToken(oldToken);
        user.AddRefreshToken(currentToken);
        var repository = new FakeUserRepository(user);
        var service = new AuthService(
            repository,
            new FakePasswordHasher(),
            new FakeTokenService(),
            new FixedTimeProvider(Now));

        await Assert.ThrowsAsync<InvalidRefreshTokenException>(() =>
            service.RefreshAsync("old", null, false, "attacker-ip"));

        Assert.Equal("Refresh token reuse detected", currentToken.RevocationReason);
        Assert.False(currentToken.IsActiveAt(Now));
        Assert.Equal(1, repository.SaveCount);
    }

    [Fact]
    public async Task Web_refresh_rejects_an_invalid_csrf_token()
    {
        var user = ActiveUser("Arena Owner", "owner@longbeach.local", "valid-hash");
        user.AddRefreshToken(RefreshToken.Create(
            Guid.NewGuid(), user.Id, Guid.NewGuid(), "hash:old", "csrf:expected", Now.AddDays(30), null));
        var repository = new FakeUserRepository(user);
        var service = new AuthService(
            repository,
            new FakePasswordHasher(),
            new FakeTokenService(),
            new FixedTimeProvider(Now));

        await Assert.ThrowsAsync<CsrfValidationException>(() =>
            service.RefreshAsync("old", "wrong", true, "browser-ip"));

        Assert.Equal(0, repository.SaveCount);
    }

    [Fact]
    public async Task Change_password_replaces_the_hash_and_revokes_every_session()
    {
        var user = ActiveUser("Arena Owner", "owner@longbeach.local", "hash:Current1!");
        var firstToken = RefreshToken.Create(
            Guid.NewGuid(), user.Id, Guid.NewGuid(), "hash:first", "csrf:first", Now.AddDays(30), "first-ip");
        var secondToken = RefreshToken.Create(
            Guid.NewGuid(), user.Id, Guid.NewGuid(), "hash:second", "csrf:second", Now.AddDays(30), "second-ip");
        user.AddRefreshToken(firstToken);
        user.AddRefreshToken(secondToken);
        var repository = new FakeUserRepository(user);
        var service = new AuthService(
            repository,
            new FakePasswordHasher(),
            new FakeTokenService(),
            new FixedTimeProvider(Now));

        await service.ChangePasswordAsync(
            user.Id,
            "Current1!",
            "NewPassword2026!",
            "change-ip");

        Assert.Equal("hash:NewPassword2026!", user.PasswordHash);
        Assert.Equal(1, user.CredentialVersion);
        Assert.True(user.LocalPasswordEnabled);
        Assert.All(user.RefreshTokens, token =>
        {
            Assert.Equal(Now, token.RevokedAtUtc);
            Assert.Equal("change-ip", token.RevokedByIp);
            Assert.Equal("Password changed", token.RevocationReason);
        });
        Assert.Equal(1, repository.SaveCount);
    }

    [Fact]
    public async Task Change_password_rejects_an_incorrect_current_password_without_mutating_sessions()
    {
        var user = ActiveUser("Arena Owner", "owner@longbeach.local", "hash:Current1!");
        var token = RefreshToken.Create(
            Guid.NewGuid(), user.Id, Guid.NewGuid(), "hash:session", "csrf:session", Now.AddDays(30), null);
        user.AddRefreshToken(token);
        var repository = new FakeUserRepository(user);
        var service = new AuthService(
            repository,
            new FakePasswordHasher(),
            new FakeTokenService(),
            new FixedTimeProvider(Now));

        await Assert.ThrowsAsync<CurrentPasswordInvalidException>(() =>
            service.ChangePasswordAsync(user.Id, "Wrong1!", "NewPassword2026!", null));

        Assert.Null(token.RevokedAtUtc);
        Assert.Equal("hash:Current1!", user.PasswordHash);
        Assert.Equal(0, repository.SaveCount);
    }

    [Theory]
    [InlineData("too-short")]
    [InlineData("alllowercasebutlong1!")]
    [InlineData("ALLUPPERCASEBUTLONG1!")]
    [InlineData("NoNumberButLong!")]
    [InlineData("NoSymbolButLong2026")]
    public async Task Change_password_rejects_a_weak_new_password(string newPassword)
    {
        var user = ActiveUser("Arena Owner", "owner@longbeach.local", "hash:Current1!");
        var repository = new FakeUserRepository(user);
        var service = new AuthService(
            repository,
            new FakePasswordHasher(),
            new FakeTokenService(),
            new FixedTimeProvider(Now));

        await Assert.ThrowsAsync<WeakPasswordException>(() =>
            service.ChangePasswordAsync(user.Id, "Current1!", newPassword, null));

        Assert.Equal("hash:Current1!", user.PasswordHash);
        Assert.Equal(0, repository.SaveCount);
    }

    [Fact]
    public async Task Change_password_rejects_reusing_the_current_password()
    {
        var user = ActiveUser("Arena Owner", "owner@longbeach.local", "hash:CurrentPassword1!");
        var repository = new FakeUserRepository(user);
        var service = new AuthService(
            repository,
            new FakePasswordHasher(),
            new FakeTokenService(),
            new FixedTimeProvider(Now));

        await Assert.ThrowsAsync<WeakPasswordException>(() =>
            service.ChangePasswordAsync(user.Id, "CurrentPassword1!", "CurrentPassword1!", null));

        Assert.Equal(0, repository.SaveCount);
    }

    [Fact]
    public async Task Local_login_uses_the_normalized_username_and_reports_the_enabled_method()
    {
        var user = ActiveUser("Cliente", "contact@unlinked.longbeach.invalid", "hash:CurrentPassword1!");
        user.SetUsername(" Cliente.Exemplo ");
        var service = new AuthService(new FakeUserRepository(user), new FakePasswordHasher(), new FakeTokenService(), new FixedTimeProvider(Now));

        var session = await service.LoginAsync(" CLIENTE.EXEMPLO ", "CurrentPassword1!", null);

        Assert.Equal(user.Id, session.Response.User.Id);
        Assert.Equal("cliente.exemplo", session.Response.User.Username);
        Assert.Empty(session.Response.User.Email);
        Assert.True(session.Response.User.LocalPasswordEnabled);
        Assert.False(session.Response.User.GoogleLinked);
        Assert.Equal(0, Assert.Single(user.RefreshTokens).CredentialVersion);
    }

    [Fact]
    public async Task Disabled_local_method_uses_the_dummy_hash_and_cannot_change_its_random_password()
    {
        var user = ActiveUser("Google account", "google@example.test", "hash:old");
        user.DisableLocalPassword("hash:KnownReplacement1!");
        var repository = new FakeUserRepository(user);
        var hasher = new FakePasswordHasher();
        var service = new AuthService(repository, hasher, new FakeTokenService(), new FixedTimeProvider(Now));

        await Assert.ThrowsAsync<AuthenticationFailedException>(() => service.LoginAsync(user.Email, "KnownReplacement1!", null));
        await Assert.ThrowsAsync<CurrentPasswordInvalidException>(() =>
            service.ChangePasswordAsync(user.Id, "KnownReplacement1!", "NewPassword2026!", null));

        Assert.Equal(new[] { hasher.DummyHash, hasher.DummyHash }, hasher.VerifiedHashes);
        Assert.False(user.LocalPasswordEnabled);
        Assert.Equal("hash:KnownReplacement1!", user.PasswordHash);
        Assert.Equal(0, user.CredentialVersion);
        Assert.Empty(user.RefreshTokens);
        Assert.Equal(0, repository.SaveCount);
    }

    [Fact]
    public async Task Automatic_password_rehash_preserves_the_credential_version_and_current_sessions()
    {
        var user = ActiveUser("Cliente", "client@example.test", "rehash:CurrentPassword1!");
        var current = RefreshToken.Create(Guid.NewGuid(), user.Id, Guid.NewGuid(), "hash:old", "csrf:old", Now.AddDays(1), null);
        user.AddRefreshToken(current);
        var service = new AuthService(new FakeUserRepository(user), new FakePasswordHasher(), new FakeTokenService(), new FixedTimeProvider(Now));

        var session = await service.LoginAsync(user.Email, "CurrentPassword1!", null);

        Assert.Equal("hash:CurrentPassword1!", user.PasswordHash);
        Assert.Equal(0, user.CredentialVersion);
        Assert.Null(current.RevokedAtUtc);
        Assert.True(session.Response.User.LocalPasswordEnabled);
        Assert.All(user.RefreshTokens, token => Assert.Equal(0, token.CredentialVersion));
    }

    [Fact]
    public async Task A_stale_refresh_saved_after_credential_invalidation_cannot_restore_access()
    {
        var user = ActiveUser("Cliente", "client@example.test", "valid-hash");
        user.InvalidateCredentials(Now, null, "Account recovered");
        var stale = RefreshToken.Create(Guid.NewGuid(), user.Id, Guid.NewGuid(), "hash:late", "csrf:late", Now.AddDays(1), null);
        user.AddRefreshToken(stale);
        var repository = new FakeUserRepository(user);
        var service = new AuthService(repository, new FakePasswordHasher(), new FakeTokenService(), new FixedTimeProvider(Now));

        await Assert.ThrowsAsync<InvalidRefreshTokenException>(() => service.RefreshAsync("late", null, false, null));

        Assert.Null(stale.RevokedAtUtc); // Rejected by version, even though it escaped the earlier revocation batch.
        Assert.Equal(0, repository.SaveCount);
        Assert.Single(user.RefreshTokens);
    }

    [Fact]
    public async Task Current_refresh_rotates_with_the_same_credential_version()
    {
        var user = ActiveUser("Cliente", "client@example.test", "valid-hash");
        user.InvalidateCredentials(Now, null, "Account recovered");
        var current = RefreshToken.Create(Guid.NewGuid(), user.Id, Guid.NewGuid(), "hash:current", "csrf:current", Now.AddDays(1), null,
            credentialVersion: user.CredentialVersion);
        user.AddRefreshToken(current);
        var tokens = new FakeTokenService();
        var service = new AuthService(new FakeUserRepository(user), new FakePasswordHasher(), tokens, new FixedTimeProvider(Now));

        await service.RefreshAsync("current", null, false, null);

        Assert.Equal(1, tokens.LastPrincipal!.CredentialVersion);
        Assert.Equal(1, Assert.Single(user.RefreshTokens, token => token.Id != current.Id).CredentialVersion);
    }

    [Fact]
    public async Task A_rotating_refresh_cannot_adopt_a_reset_version_after_its_access_token_was_minted()
    {
        var user = ActiveUser("Cliente", "client@example.test", "valid-hash");
        user.AddRefreshToken(RefreshToken.Create(Guid.NewGuid(), user.Id, Guid.NewGuid(), "hash:old", "csrf:old", Now.AddDays(1), null));
        var tokens = new FakeTokenService { OnIssue = () => user.InvalidateCredentials(Now, null, "Account recovered during rotation") };
        var service = new AuthService(new FakeUserRepository(user), new FakePasswordHasher(), tokens, new FixedTimeProvider(Now));

        var racedSession = await service.RefreshAsync("old", null, false, null);

        Assert.Equal(1, user.CredentialVersion);
        var late = Assert.Single(user.RefreshTokens, token => token.TokenHash == "hash:new");
        Assert.Equal(0, late.CredentialVersion);
        Assert.Null(late.RevokedAtUtc);
        await Assert.ThrowsAsync<InvalidRefreshTokenException>(() => service.RefreshAsync(racedSession.RefreshToken, null, false, null));
    }

    [Fact]
    public async Task Returning_google_login_keeps_the_same_version_and_enabled_local_method()
    {
        var user = ActiveUser("Cliente", "client@example.test", "hash:CurrentPassword1!");
        var service = new AuthService(new FakeUserRepository(user), new FakePasswordHasher(), new FakeTokenService(), new FixedTimeProvider(Now));

        var first = await service.LoginWithGoogleAsync(user.Email, null, subject: "google-client", allowEmailMatch: true);
        var returning = await service.LoginWithGoogleAsync(user.Email, null, subject: "google-client");
        var local = await service.LoginAsync(user.Email, "CurrentPassword1!", null);

        Assert.Equal(first.Response.User.Id, returning.Response.User.Id);
        Assert.Equal(first.Response.User.Id, local.Response.User.Id);
        Assert.Equal(1, user.CredentialVersion);
        Assert.True(returning.Response.User.LocalPasswordEnabled);
    }

    private static User ActiveUser(string name, string email, string passwordHash)
    {
        var user = User.Create(name, email, passwordHash);
        user.AssignRole(new Role(SystemRoles.Manager));
        return user;
    }

    [Fact]
    public async Task Accounts_without_a_supported_profile_cannot_login_or_refresh()
    {
        var user = User.Create("Unclassified", "unclassified@example.test", "valid-hash");
        user.AddRefreshToken(RefreshToken.Create(Guid.NewGuid(), user.Id, Guid.NewGuid(), "hash:old", "csrf:old", Now.AddDays(1), null));
        var service = new AuthService(new FakeUserRepository(user), new FakePasswordHasher(), new FakeTokenService(), new FixedTimeProvider(Now));
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => service.LoginAsync(user.Email, "password", null));
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => service.LoginWithGoogleAsync(user.Email, null, subject: "subject", allowEmailMatch: true));
        await Assert.ThrowsAsync<InvalidRefreshTokenException>(() => service.RefreshAsync("old", null, false, null));
        Assert.Null(user.GoogleSubject);
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class FakePasswordHasher : IPasswordHasher
    {
        public List<string> VerifiedHashes { get; } = [];
        public string DummyHash => "hash:dummy";
        public string Hash(string password) => $"hash:{password}";
        public PasswordHashVerificationResult Verify(string password, string encodedHash)
        {
            VerifiedHashes.Add(encodedHash);
            if (encodedHash == $"rehash:{password}") return PasswordHashVerificationResult.SuccessRehashNeeded;
            return encodedHash == "valid-hash" || encodedHash == $"hash:{password}"
                ? PasswordHashVerificationResult.Success
                : PasswordHashVerificationResult.Failed;
        }
    }

    private sealed class FakeTokenService : ITokenService
    {
        public TokenPrincipal? LastPrincipal { get; private set; }
        public Action? OnIssue { get; init; }
        public IssuedTokenPair Issue(TokenPrincipal principal, DateTimeOffset now)
        {
            LastPrincipal = principal;
            OnIssue?.Invoke();
            var id = Guid.NewGuid();
            return new IssuedTokenPair(
                "access-token",
                now.AddMinutes(15),
                "new",
                "hash:new",
                "new-csrf",
                "csrf:new-csrf",
                id,
                now.AddDays(30));
        }

        public string HashRefreshToken(string refreshToken) => $"hash:{refreshToken}";
        public string HashCsrfToken(string csrfToken) => $"csrf:{csrfToken}";
    }

    private sealed class FakeUserRepository(User user) : IUserRepository
    {
        public int SaveCount { get; private set; }
        public Task<User?> FindByUsernameAsync(string normalizedUsername, CancellationToken cancellationToken = default) =>
            Task.FromResult<User?>(user.NormalizedUsername == normalizedUsername ? user : null);
        public Task<User?> FindByGoogleSubjectAsync(string subject, CancellationToken cancellationToken = default) =>
            Task.FromResult<User?>(user.GoogleSubject == subject ? user : null);


        public Task<User?> FindByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
            Task.FromResult<User?>(user.Id == id ? user : null);

        public Task<User?> FindByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default) =>
            Task.FromResult<User?>(user.NormalizedEmail == normalizedEmail ? user : null);

        public Task<User?> FindByRefreshTokenHashAsync(string tokenHash, CancellationToken cancellationToken = default) =>
            Task.FromResult<User?>(user.RefreshTokens.Any(token => token.TokenHash == tokenHash) ? user : null);

        public Task AddAsync(User newUser, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveCount++;
            return Task.CompletedTask;
        }
    }
}
