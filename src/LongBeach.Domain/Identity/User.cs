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
    public string? Username { get; private set; }
    public string? NormalizedUsername { get; private set; }
    public bool RequiresFirstAccess { get; private set; }
    public DateTimeOffset? InitialAccessExpiresAtUtc { get; private set; }
    public string? GoogleSubject { get; private set; }
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

    public static User CreateForFirstAccess(string name, string username, string passwordHash, DateTimeOffset expiresAt)
    {
        username = username.Trim().ToLowerInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(username, "^[a-z][a-z0-9._-]{2,63}$"))
            throw new ArgumentException("Use a username of 3 to 64 letters, digits, dots, underscores or hyphens.");
        // Reserved, non-deliverable address until the person links a verified Google account.
        var user = Create(name, $"{Guid.NewGuid():N}@unlinked.longbeach.invalid", passwordHash);
        user.Username = username;
        user.NormalizedUsername = NormalizeEmail(username);
        user.RequiresFirstAccess = true;
        user.InitialAccessExpiresAtUtc = expiresAt;
        return user;
    }

    public bool InitialAccessIsValidAt(DateTimeOffset now) =>
        !RequiresFirstAccess || InitialAccessExpiresAtUtc > now;

    public void CompleteFirstAccess()
    {
        RequiresFirstAccess = false;
        InitialAccessExpiresAtUtc = null;
    }

    public void LinkGoogle(string subject, string email)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subject);
        ArgumentException.ThrowIfNullOrWhiteSpace(email);
        if (subject.Length > 255 || email.Length > 320) throw new ArgumentException("Invalid Google identity.");
        GoogleSubject = subject;
        Email = email.Trim();
        NormalizedEmail = NormalizeEmail(email);
    }

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
