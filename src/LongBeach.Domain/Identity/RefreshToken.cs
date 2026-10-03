using LongBeach.Domain.Common;

namespace LongBeach.Domain.Identity;

public sealed class RefreshToken : Entity
{
    private RefreshToken() { }

    private RefreshToken(
        Guid id,
        Guid userId,
        Guid familyId,
        string tokenHash,
        string csrfTokenHash,
        DateTimeOffset expiresAtUtc,
        string? createdByIp)
        : base(id)
    {
        UserId = userId;
        FamilyId = familyId;
        TokenHash = tokenHash;
        CsrfTokenHash = csrfTokenHash;
        ExpiresAtUtc = expiresAtUtc;
        CreatedByIp = createdByIp;
    }

    public Guid UserId { get; private set; }
    public User User { get; private set; } = null!;
    public Guid FamilyId { get; private set; }
    public string TokenHash { get; private set; } = string.Empty;
    public string CsrfTokenHash { get; private set; } = string.Empty;
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public DateTimeOffset? RevokedAtUtc { get; private set; }
    public string? CreatedByIp { get; private set; }
    public string? RevokedByIp { get; private set; }
    public Guid? ReplacedByTokenId { get; private set; }
    public string? RevocationReason { get; private set; }
    public int Version { get; private set; }

    public bool IsActiveAt(DateTimeOffset now) => RevokedAtUtc is null && ExpiresAtUtc > now;

    public static RefreshToken Create(
        Guid id,
        Guid userId,
        Guid familyId,
        string tokenHash,
        string csrfTokenHash,
        DateTimeOffset expiresAtUtc,
        string? createdByIp) =>
        new(id, userId, familyId, tokenHash, csrfTokenHash, expiresAtUtc, createdByIp);

    public void Revoke(
        DateTimeOffset revokedAtUtc,
        string? revokedByIp,
        string reason,
        Guid? replacedByTokenId = null)
    {
        if (RevokedAtUtc is not null)
        {
            return;
        }

        RevokedAtUtc = revokedAtUtc;
        RevokedByIp = revokedByIp;
        RevocationReason = reason;
        ReplacedByTokenId = replacedByTokenId;
        Version++;
    }
}
