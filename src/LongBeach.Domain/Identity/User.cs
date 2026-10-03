using LongBeach.Domain.Common;

namespace LongBeach.Domain.Identity;

public sealed class User : Entity
{
    private readonly HashSet<UserRole> _userRoles = [];
    private readonly List<RefreshToken> _refreshTokens = [];

    private User() { }

    private User(Guid id, string name, string email, string normalizedEmail, string passwordHash)
        : base(id)
    {
        Name = name;
        Email = email;
        NormalizedEmail = normalizedEmail;
        PasswordHash = passwordHash;
        IsActive = true;
    }

    public string Name { get; private set; } = string.Empty;
    public string Email { get; private set; } = string.Empty;
    public string NormalizedEmail { get; private set; } = string.Empty;
    public string PasswordHash { get; private set; } = string.Empty;
    public bool IsActive { get; private set; }
    public IReadOnlyCollection<UserRole> UserRoles => _userRoles;
    public IReadOnlyCollection<RefreshToken> RefreshTokens => _refreshTokens;

    public static User Create(string name, string email, string passwordHash)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(email);
        ArgumentException.ThrowIfNullOrWhiteSpace(passwordHash);

        return new User(Guid.NewGuid(), name.Trim(), email.Trim(), NormalizeEmail(email), passwordHash);
    }

    public static string NormalizeEmail(string email) => email.Trim().ToUpperInvariant();

    public void ChangePasswordHash(string passwordHash)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(passwordHash);
        PasswordHash = passwordHash;
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;

    public void AssignRole(Role role)
    {
        ArgumentNullException.ThrowIfNull(role);
        if (_userRoles.All(item => item.RoleId != role.Id))
        {
            _userRoles.Add(new UserRole(this, role));
        }
    }

    public void AddRefreshToken(RefreshToken token)
    {
        ArgumentNullException.ThrowIfNull(token);
        if (token.UserId != Id)
        {
            throw new InvalidOperationException("Refresh token belongs to another user.");
        }

        _refreshTokens.Add(token);
    }

    public void RevokeRefreshTokenFamily(
        Guid familyId,
        DateTimeOffset revokedAtUtc,
        string? revokedByIp,
        string reason)
    {
        foreach (var token in _refreshTokens.Where(item => item.FamilyId == familyId))
        {
            token.Revoke(revokedAtUtc, revokedByIp, reason);
        }
    }

    public void RevokeAllRefreshTokens(
        DateTimeOffset revokedAtUtc,
        string? revokedByIp,
        string reason)
    {
        foreach (var token in _refreshTokens)
        {
            token.Revoke(revokedAtUtc, revokedByIp, reason);
        }
    }

    public IReadOnlyCollection<string> GetRoleNames() =>
        _userRoles.Select(item => item.Role.Name).Distinct(StringComparer.Ordinal).ToArray();

    public IReadOnlyCollection<string> GetPermissionNames() =>
        _userRoles
            .SelectMany(item => item.Role.RolePermissions)
            .Select(item => item.Permission.Name)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
}
