using LongBeach.Domain.Identity;

namespace LongBeach.UnitTests;

public sealed class RefreshTokenTests
{
    [Fact]
    public void Revoke_marks_token_inactive_and_records_replacement()
    {
        var now = new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);
        var replacementId = Guid.NewGuid();
        var token = RefreshToken.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            "HASH",
            "CSRF_HASH",
            now.AddDays(30),
            "127.0.0.1");

        token.Revoke(now, "127.0.0.2", "Rotated", replacementId);

        Assert.False(token.IsActiveAt(now));
        Assert.Equal(now, token.RevokedAtUtc);
        Assert.Equal(replacementId, token.ReplacedByTokenId);
        Assert.Equal("Rotated", token.RevocationReason);
    }

    [Fact]
    public void Revoke_is_idempotent()
    {
        var now = new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);
        var token = RefreshToken.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            "HASH",
            "CSRF_HASH",
            now.AddDays(30),
            null);

        token.Revoke(now, null, "First");
        token.Revoke(now.AddMinutes(1), null, "Second");

        Assert.Equal("First", token.RevocationReason);
        Assert.Equal(now, token.RevokedAtUtc);
    }
}
