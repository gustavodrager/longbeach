using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace LongBeach.Infrastructure.Security;

public sealed class AspNetIdentityPasswordHasher : IPasswordHasher
{
    private static readonly User PlaceholderUser =
        User.Create("Password verifier", "password-verifier@invalid.local", "placeholder");

    private readonly PasswordHasher<User> _hasher;

    public AspNetIdentityPasswordHasher(IOptions<PasswordHasherOptions> options)
    {
        _hasher = new PasswordHasher<User>(options);
        DummyHash = _hasher.HashPassword(PlaceholderUser, "long-beach-dummy-password");
    }

    public string DummyHash { get; }

    public string Hash(string password)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(password);
        return _hasher.HashPassword(PlaceholderUser, password);
    }

    public PasswordHashVerificationResult Verify(string password, string encodedHash)
    {
        if (string.IsNullOrEmpty(password) || string.IsNullOrEmpty(encodedHash))
        {
            return PasswordHashVerificationResult.Failed;
        }

        try
        {
            return _hasher.VerifyHashedPassword(PlaceholderUser, encodedHash, password) switch
            {
                Microsoft.AspNetCore.Identity.PasswordVerificationResult.Success =>
                    PasswordHashVerificationResult.Success,
                Microsoft.AspNetCore.Identity.PasswordVerificationResult.SuccessRehashNeeded =>
                    PasswordHashVerificationResult.SuccessRehashNeeded,
                _ => PasswordHashVerificationResult.Failed
            };
        }
        catch (FormatException)
        {
            return PasswordHashVerificationResult.Failed;
        }
    }
}
