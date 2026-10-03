using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Domain.Identity;

namespace LongBeach.UnitTests;

public sealed class AuthServiceTests
{
    private static readonly DateTimeOffset Now =
        new(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Refresh_rotates_token_inside_the_same_family()
    {
        var user = User.Create("Arena Owner", "owner@longbeach.local", "valid-hash");
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
        var user = User.Create("Arena Owner", "owner@longbeach.local", "valid-hash");
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
        var user = User.Create("Arena Owner", "owner@longbeach.local", "valid-hash");
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
        var user = User.Create("Arena Owner", "owner@longbeach.local", "hash:Current1!");
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
        var user = User.Create("Arena Owner", "owner@longbeach.local", "hash:Current1!");
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
        var user = User.Create("Arena Owner", "owner@longbeach.local", "hash:Current1!");
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
        var user = User.Create("Arena Owner", "owner@longbeach.local", "hash:CurrentPassword1!");
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

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class FakePasswordHasher : IPasswordHasher
    {
        public string DummyHash => "hash:dummy";
        public string Hash(string password) => $"hash:{password}";
        public PasswordHashVerificationResult Verify(string password, string encodedHash) =>
            encodedHash == "valid-hash" || encodedHash == $"hash:{password}"
                ? PasswordHashVerificationResult.Success
                : PasswordHashVerificationResult.Failed;
    }

    private sealed class FakeTokenService : ITokenService
    {
        public IssuedTokenPair Issue(TokenPrincipal principal, DateTimeOffset now)
        {
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
