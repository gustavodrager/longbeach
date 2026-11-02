using LongBeach.Domain.Identity;

namespace LongBeach.UnitTests;

public sealed class UserCredentialTests
{
    [Theory]
    [InlineData("ab")]
    [InlineData("1cliente")]
    [InlineData("cliente@arena")]
    [InlineData("cliente nome")]
    [InlineData("cliente\nnome")]
    public void Invalid_username_does_not_replace_an_existing_identifier(string username)
    {
        var user = User.Create("Cliente", "client@example.test", "hash");
        user.SetUsername(" cliente.valido ");

        Assert.Throws<ArgumentException>(() => user.SetUsername(username));

        Assert.Equal("cliente.valido", user.Username);
        Assert.Equal("CLIENTE.VALIDO", user.NormalizedUsername);
    }

    [Fact]
    public void Credential_invalidation_advances_the_version_and_revokes_every_loaded_family()
    {
        var now = new DateTimeOffset(2026, 11, 2, 12, 0, 0, TimeSpan.Zero);
        var user = User.Create("Cliente", "client@example.test", "hash");
        user.AddRefreshToken(RefreshToken.Create(Guid.NewGuid(), user.Id, Guid.NewGuid(), "first", "csrf", now.AddDays(1), null));
        user.AddRefreshToken(RefreshToken.Create(Guid.NewGuid(), user.Id, Guid.NewGuid(), "second", "csrf", now.AddDays(1), null));

        user.InvalidateCredentials(now, "fixture-ip", "Account recovered");

        Assert.Equal(1, user.CredentialVersion);
        Assert.All(user.RefreshTokens, token =>
        {
            Assert.False(token.IsActiveAt(now));
            Assert.Equal(now, token.RevokedAtUtc);
            Assert.Equal("Account recovered", token.RevocationReason);
        });
        user.InvalidateCredentials(now, null, "Another verified change");
        Assert.Equal(2, user.CredentialVersion);
    }

    [Fact]
    public void Disabling_a_local_method_destroys_its_hash_without_unlinking_google()
    {
        var user = User.Create("Cliente", "client@example.test", "local-hash");
        user.LinkGoogle("google-fixture", user.Email);

        user.DisableLocalPassword("random-replacement-hash");

        Assert.False(user.LocalPasswordEnabled);
        Assert.Equal("random-replacement-hash", user.PasswordHash);
        Assert.Equal("google-fixture", user.GoogleSubject);
        user.SetLocalPassword("new-verified-local-hash");
        Assert.True(user.LocalPasswordEnabled);
        Assert.Equal("new-verified-local-hash", user.PasswordHash);
        Assert.Equal("google-fixture", user.GoogleSubject);
    }

    [Fact]
    public void Preparing_operator_authorized_google_access_disables_the_temporary_local_method()
    {
        var user = User.CreateForFirstAccess("Cliente", "fixture.client", "temporary-hash", DateTimeOffset.UtcNow.AddDays(1));

        user.PrepareGoogleAccess("verified@example.test", "random-google-hash");

        Assert.False(user.LocalPasswordEnabled);
        Assert.False(user.RequiresFirstAccess);
        Assert.Null(user.InitialAccessExpiresAtUtc);
        Assert.Equal("verified@example.test", user.Email);
        Assert.Equal("fixture.client", user.Username);
    }

    [Fact]
    public void Refresh_versions_cannot_be_negative()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => RefreshToken.Create(
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "hash", "csrf", DateTimeOffset.UtcNow.AddDays(1), null, credentialVersion: -1));
    }
}
