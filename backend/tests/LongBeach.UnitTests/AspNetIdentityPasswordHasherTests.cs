using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace LongBeach.UnitTests;

public sealed class AspNetIdentityPasswordHasherTests
{
    private static readonly IOptions<PasswordHasherOptions> CurrentOptions =
        Options.Create(new PasswordHasherOptions { IterationCount = 210_000 });

    private readonly AspNetIdentityPasswordHasher _hasher = new(CurrentOptions);

    [Fact]
    public void Hash_and_verify_accepts_the_original_password()
    {
        var encoded = _hasher.Hash("a-strong-development-password");

        Assert.Equal(
            PasswordHashVerificationResult.Success,
            _hasher.Verify("a-strong-development-password", encoded));
        Assert.Equal(
            PasswordHashVerificationResult.Failed,
            _hasher.Verify("wrong-password", encoded));
    }

    [Fact]
    public void Hash_uses_a_fresh_salt()
    {
        var first = _hasher.Hash("same-password");
        var second = _hasher.Hash("same-password");

        Assert.NotEqual(first, second);
    }

    [Fact]
    public void Verify_requests_rehash_for_an_older_iteration_count()
    {
        var legacyHasher = new PasswordHasher<User>(
            Options.Create(new PasswordHasherOptions { IterationCount = 10_000 }));
        var placeholder = User.Create("Legacy", "legacy@invalid.local", "placeholder");
        var legacyHash = legacyHasher.HashPassword(placeholder, "same-password");

        Assert.Equal(
            PasswordHashVerificationResult.SuccessRehashNeeded,
            _hasher.Verify("same-password", legacyHash));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-valid-hash")]
    public void Verify_rejects_malformed_hashes(string encoded)
    {
        Assert.Equal(PasswordHashVerificationResult.Failed, _hasher.Verify("password", encoded));
    }
}
