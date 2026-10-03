using System.Security.Cryptography;
using System.Text;
using LongBeach.Application.Abstractions;
using LongBeach.Contracts.Auth;
using LongBeach.Domain.Identity;

namespace LongBeach.Application.Auth;

public sealed class AuthService(
    IUserRepository users,
    IPasswordHasher passwordHasher,
    ITokenService tokens,
    TimeProvider timeProvider) : IAuthService
{
    public async Task<AuthSession> LoginAsync(
        string email,
        string password,
        string? ipAddress,
        CancellationToken cancellationToken = default)
    {
        var user = await users.FindByEmailAsync(User.NormalizeEmail(email), cancellationToken);

        var passwordVerification = passwordHasher.Verify(password, user?.PasswordHash ?? passwordHasher.DummyHash);
        if (user is null || !user.IsActive || passwordVerification == PasswordHashVerificationResult.Failed)
        {
            throw new AuthenticationFailedException();
        }

        if (passwordVerification == PasswordHashVerificationResult.SuccessRehashNeeded)
        {
            user.ChangePasswordHash(passwordHasher.Hash(password));
        }

        return await IssueAndPersistAsync(user, ipAddress, cancellationToken);
    }

    public async Task<AuthSession> RefreshAsync(
        string refreshToken,
        string? csrfToken,
        bool requireCsrf,
        string? ipAddress,
        CancellationToken cancellationToken = default)
    {
        var tokenHash = tokens.HashRefreshToken(refreshToken);
        var user = await users.FindByRefreshTokenHashAsync(tokenHash, cancellationToken);
        var currentToken = user?.RefreshTokens.SingleOrDefault(token => token.TokenHash == tokenHash);
        var now = timeProvider.GetUtcNow();

        if (user is null || !user.IsActive || currentToken is null)
        {
            throw new InvalidRefreshTokenException();
        }

        ValidateCsrf(currentToken, csrfToken, requireCsrf);

        if (currentToken.RevokedAtUtc is not null)
        {
            user.RevokeRefreshTokenFamily(currentToken.FamilyId, now, ipAddress, "Refresh token reuse detected");
            await users.SaveChangesAsync(cancellationToken);
            throw new InvalidRefreshTokenException();
        }

        if (!currentToken.IsActiveAt(now))
        {
            throw new InvalidRefreshTokenException();
        }

        var issued = tokens.Issue(ToPrincipal(user), now);
        currentToken.Revoke(now, ipAddress, "Rotated", issued.RefreshTokenId);
        user.AddRefreshToken(RefreshToken.Create(
            issued.RefreshTokenId,
            user.Id,
            currentToken.FamilyId,
            issued.RefreshTokenHash,
            issued.CsrfTokenHash,
            issued.RefreshTokenExpiresAtUtc,
            ipAddress));

        await users.SaveChangesAsync(cancellationToken);
        return ToResponse(user, issued);
    }

    public async Task LogoutAsync(
        string refreshToken,
        string? csrfToken,
        bool requireCsrf,
        string? ipAddress,
        CancellationToken cancellationToken = default)
    {
        var tokenHash = tokens.HashRefreshToken(refreshToken);
        var user = await users.FindByRefreshTokenHashAsync(tokenHash, cancellationToken);
        var currentToken = user?.RefreshTokens.SingleOrDefault(token => token.TokenHash == tokenHash);

        if (currentToken is null)
        {
            return;
        }

        ValidateCsrf(currentToken, csrfToken, requireCsrf);

        var now = timeProvider.GetUtcNow();
        if (currentToken.IsActiveAt(now))
        {
            currentToken.Revoke(now, ipAddress, "Logout");
            await users.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task ChangePasswordAsync(
        Guid userId,
        string currentPassword,
        string newPassword,
        string? ipAddress,
        CancellationToken cancellationToken = default)
    {
        var user = await users.FindByIdAsync(userId, cancellationToken);
        var passwordVerification = passwordHasher.Verify(
            currentPassword,
            user?.PasswordHash ?? passwordHasher.DummyHash);
        if (user is null || !user.IsActive || passwordVerification == PasswordHashVerificationResult.Failed)
        {
            throw new CurrentPasswordInvalidException();
        }

        PasswordPolicy.EnsureStrong(newPassword);
        if (passwordHasher.Verify(newPassword, user.PasswordHash) != PasswordHashVerificationResult.Failed)
        {
            throw new WeakPasswordException("The new password must be different from the current password.");
        }

        user.ChangePasswordHash(passwordHasher.Hash(newPassword));
        user.RevokeAllRefreshTokens(
            timeProvider.GetUtcNow(),
            ipAddress,
            "Password changed");

        await users.SaveChangesAsync(cancellationToken);
    }

    private async Task<AuthSession> IssueAndPersistAsync(
        User user,
        string? ipAddress,
        CancellationToken cancellationToken)
    {
        var issued = tokens.Issue(ToPrincipal(user), timeProvider.GetUtcNow());
        user.AddRefreshToken(RefreshToken.Create(
            issued.RefreshTokenId,
            user.Id,
            issued.RefreshTokenId,
            issued.RefreshTokenHash,
            issued.CsrfTokenHash,
            issued.RefreshTokenExpiresAtUtc,
            ipAddress));

        await users.SaveChangesAsync(cancellationToken);
        return ToResponse(user, issued);
    }

    private static TokenPrincipal ToPrincipal(User user) =>
        new(user.Id, user.Name, user.Email, user.GetRoleNames(), user.GetPermissionNames());

    private static AuthSession ToResponse(User user, IssuedTokenPair issued) =>
        new(
            new AuthResponse(
                issued.AccessToken,
                issued.AccessTokenExpiresAtUtc,
                issued.CsrfToken,
                new UserSummary(
                    user.Id,
                    user.Name,
                    user.Email,
                    user.GetRoleNames(),
                    user.GetPermissionNames())),
            issued.RefreshToken,
            issued.RefreshTokenExpiresAtUtc,
            issued.CsrfToken);

    private void ValidateCsrf(RefreshToken refreshToken, string? csrfToken, bool required)
    {
        if (!required)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(csrfToken) ||
            !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(refreshToken.CsrfTokenHash),
                Encoding.UTF8.GetBytes(tokens.HashCsrfToken(csrfToken))))
        {
            throw new CsrfValidationException();
        }
    }
}
