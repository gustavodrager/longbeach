using LongBeach.Domain.Common;

namespace LongBeach.Domain.Identity;

public sealed class ClientAccessChallenge : Entity
{
    private ClientAccessChallenge() { }
    public ClientAccessChallenge(Guid customerId, Guid? userId, string purpose, string tokenHash,
        DateTimeOffset expiresAtUtc, Guid issuedBy, int customerVersion, int? credentialVersion) : base(Guid.NewGuid())
    {
        CustomerId = customerId; UserId = userId; Purpose = purpose; TokenHash = tokenHash;
        ExpiresAtUtc = expiresAtUtc; IssuedBy = issuedBy; CustomerVersion = customerVersion; CredentialVersion = credentialVersion;
    }
    public Guid CustomerId { get; private set; }
    public Guid? UserId { get; private set; }
    public string Purpose { get; private set; } = "";
    public string TokenHash { get; private set; } = "";
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public Guid IssuedBy { get; private set; }
    public int CustomerVersion { get; private set; }
    public int? CredentialVersion { get; private set; }
    public DateTimeOffset? ConsumedAtUtc { get; private set; }
    public DateTimeOffset? RevokedAtUtc { get; private set; }
    public int Version { get; private set; } = 1;
    public bool Usable(DateTimeOffset now) => ConsumedAtUtc is null && RevokedAtUtc is null && ExpiresAtUtc > now;
    public void Consume(DateTimeOffset now) { ConsumedAtUtc = now; Version++; }
    public void Revoke(DateTimeOffset now) { RevokedAtUtc = now; Version++; }
}
