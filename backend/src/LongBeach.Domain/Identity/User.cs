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
    public bool LocalPasswordEnabled { get; private set; } = true;
    public int CredentialVersion { get; private set; }
    public bool IsActive { get; private set; }
    public string? Username { get; private set; }
    public string? NormalizedUsername { get; private set; }
    public string? PhoneLogin { get; private set; }
    public bool RequiresLocalPasswordChange { get; private set; }
    public StaffMembership? StaffMembership { get; private set; }
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
        // Reserved, non-deliverable address until the person links a verified Google account.
        var user = Create(name, $"{Guid.NewGuid():N}@unlinked.longbeach.invalid", passwordHash);
        user.SetUsername(username);
        user.RequiresFirstAccess = true;
        user.InitialAccessExpiresAtUtc = expiresAt;
        return user;
    }

    public static User CreateForStaffFirstAccess(string name, string? username, string? phoneLogin, string passwordHash, DateTimeOffset expiresAt)
    {
        var user = Create(name, $"{Guid.NewGuid():N}@unlinked.longbeach.invalid", passwordHash);
        if (!string.IsNullOrWhiteSpace(username)) user.SetUsername(username);
        user.SetPhoneLogin(phoneLogin);
        if (user.Username is null && user.PhoneLogin is null) throw new ArgumentException("Informe o telefone de acesso ou um usuário.");
        user.RequireLocalFirstAccess(passwordHash, expiresAt);
        return user;
    }

    public static string? NormalizePhoneLogin(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(value, @"^\+?[0-9() .-]+$")) throw new ArgumentException("Confira o telefone de acesso.");
        var digits = new string(value.Where(char.IsAsciiDigit).ToArray());
        if (!value.StartsWith('+') && digits.Length is 10 or 11) digits = "55" + digits;
        if (digits.Length is < 10 or > 15 || digits.StartsWith('0')) throw new ArgumentException("Informe um telefone válido com DDD.");
        return "+" + digits;
    }

    public void SetPhoneLogin(string? value) => PhoneLogin = NormalizePhoneLogin(value);
    public void AttachStaffMembership(StaffMembership membership)
    {
        if (membership.UserId != Id || StaffMembership is not null && StaffMembership.Id != membership.Id)
            throw new InvalidOperationException("Uma conta só pode estar vinculada a uma pessoa da equipe.");
        StaffMembership = membership;
    }
    public void RequireLocalFirstAccess(string passwordHash, DateTimeOffset expiresAt)
    {
        SetLocalPassword(passwordHash); RequiresFirstAccess = true; RequiresLocalPasswordChange = true; InitialAccessExpiresAtUtc = expiresAt;
    }

    public void SetUsername(string username)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(username);
        username = username.Trim().ToLowerInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(username, "^[a-z][a-z0-9._-]{2,63}$"))
            throw new ArgumentException("Use a username of 3 to 64 letters, digits, dots, underscores or hyphens.", nameof(username));
        Username = username;
        NormalizedUsername = NormalizeEmail(username);
    }

    public bool InitialAccessIsValidAt(DateTimeOffset now) =>
        !RequiresFirstAccess || InitialAccessExpiresAtUtc > now;

    public void CompleteFirstAccess()
    {
        RequiresFirstAccess = false;
        RequiresLocalPasswordChange = false;
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

    public void PrepareGoogleAccess(string email, string passwordHash)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(email);
        ArgumentException.ThrowIfNullOrWhiteSpace(passwordHash);
        if (!IsActive || !RequiresFirstAccess || RequiresLocalPasswordChange || GoogleSubject is not null ||
            !Email.EndsWith("@unlinked.longbeach.invalid", StringComparison.Ordinal) || email.Length > 320)
            throw new InvalidOperationException("Only an unlinked pending account can receive authorized Google access.");
        Email = email.Trim(); NormalizedEmail = NormalizeEmail(email);
        DisableLocalPassword(passwordHash);
        CompleteFirstAccess();
    }

    public void ChangePasswordHash(string passwordHash)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(passwordHash);
        PasswordHash = passwordHash;
    }

    public void SetLocalPassword(string passwordHash)
    {
        ChangePasswordHash(passwordHash);
        LocalPasswordEnabled = true;
    }

    public void DisableLocalPassword(string replacementHash)
    {
        ChangePasswordHash(replacementHash);
        LocalPasswordEnabled = false;
    }

    public void InvalidateCredentials(DateTimeOffset revokedAtUtc, string? revokedByIp, string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);
        CredentialVersion = checked(CredentialVersion + 1);
        RevokeAllRefreshTokens(revokedAtUtc, revokedByIp, reason);
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;

    public void AssignRole(Role role)
    {
        ArgumentNullException.ThrowIfNull(role);
        if (!SystemRoles.IsValid(role.Name))
            throw new InvalidOperationException("Choose one of the four supported profiles.");
        if (_userRoles.Any(item => item.RoleId != role.Id))
            throw new InvalidOperationException("An account can have only one profile. Use an explicit profile change.");
        if (_userRoles.All(item => item.RoleId != role.Id))
        {
            _userRoles.Add(new UserRole(this, role));
        }
    }

    public void SetRole(Role role)
    {
        ArgumentNullException.ThrowIfNull(role);
        if (!SystemRoles.IsValid(role.Name))
            throw new InvalidOperationException("Choose one of the four supported profiles.");
        _userRoles.RemoveWhere(item => item.RoleId != role.Id);
        if (_userRoles.All(item => item.RoleId != role.Id)) _userRoles.Add(new UserRole(this, role));
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
