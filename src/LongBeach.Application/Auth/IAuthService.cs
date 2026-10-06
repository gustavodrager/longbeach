using LongBeach.Contracts.Auth;

namespace LongBeach.Application.Auth;

public interface IAuthService
{
    Task<AuthSession> LoginAsync(
        string email,
        string password,
        string? ipAddress,
        CancellationToken cancellationToken = default);

    Task<AuthSession> LoginWithGoogleAsync(
        string email,
        string? ipAddress,
        CancellationToken cancellationToken = default,
        string? subject = null,
        bool allowEmailMatch = true);

    Task<AuthSession> CompleteFirstAccessWithGoogleAsync(
        Guid userId, string subject, string email, string? ipAddress,
        CancellationToken cancellationToken = default);

    Task<AuthSession> RefreshAsync(
        string refreshToken,
        string? csrfToken,
        bool requireCsrf,
        string? ipAddress,
        CancellationToken cancellationToken = default);

    Task LogoutAsync(
        string refreshToken,
        string? csrfToken,
        bool requireCsrf,
        string? ipAddress,
        CancellationToken cancellationToken = default);

    Task ChangePasswordAsync(
        Guid userId,
        string currentPassword,
        string newPassword,
        string? ipAddress,
        CancellationToken cancellationToken = default);
}

public sealed record AuthSession(
    AuthResponse Response,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAtUtc,
    string CsrfToken);
