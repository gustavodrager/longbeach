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
    bool GoogleLinked = false);

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
