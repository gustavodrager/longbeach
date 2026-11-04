using LongBeach.Contracts.Staff;
namespace LongBeach.Application.Abstractions;

public sealed record TokenPrincipal(
    Guid UserId,
    string Name,
    string Email,
    IReadOnlyCollection<string> Roles,
    IReadOnlyCollection<string> Permissions,
    bool RequiresFirstAccess = false,
    string? Username = null,
    DateTimeOffset? InitialAccessExpiresAtUtc = null,
    bool GoogleLinked = false,
    int CredentialVersion = 0,
    bool LocalPasswordEnabled = true,
    bool CanManageStaff = false,
    string? PhoneLogin = null,
    bool RequiresLocalPasswordChange = false,
    StaffAccessSummary? StaffAccess = null);

public sealed record IssuedTokenPair(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAtUtc,
    string RefreshToken,
    string RefreshTokenHash,
    string CsrfToken,
    string CsrfTokenHash,
    Guid RefreshTokenId,
    DateTimeOffset RefreshTokenExpiresAtUtc);

public interface ITokenService
{
    IssuedTokenPair Issue(TokenPrincipal principal, DateTimeOffset now);
    string HashRefreshToken(string refreshToken);
    string HashCsrfToken(string csrfToken);
}
