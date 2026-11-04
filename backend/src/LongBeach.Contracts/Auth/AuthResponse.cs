using LongBeach.Contracts.Staff;
namespace LongBeach.Contracts.Auth;

public sealed record AuthResponse(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAtUtc,
    string CsrfToken,
    UserSummary User);

public sealed record MobileAuthResponse(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAtUtc,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAtUtc,
    UserSummary User);

public sealed record UserSummary(
    Guid Id,
    string Name,
    string Email,
    IReadOnlyCollection<string> Roles,
    IReadOnlyCollection<string> Permissions,
    bool RequiresFirstAccess = false,
    string? Username = null,
    bool GoogleLinked = false,
    bool LocalPasswordEnabled = true,
    bool CanManageStaff = false,
    string? PhoneLogin = null,
    bool RequiresLocalPasswordChange = false,
    StaffAccessSummary? StaffAccess = null);
