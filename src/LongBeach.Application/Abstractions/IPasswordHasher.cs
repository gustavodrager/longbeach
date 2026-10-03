namespace LongBeach.Application.Abstractions;

public enum PasswordHashVerificationResult
{
    Failed,
    Success,
    SuccessRehashNeeded
}

public interface IPasswordHasher
{
    string DummyHash { get; }
    string Hash(string password);
    PasswordHashVerificationResult Verify(string password, string encodedHash);
}
