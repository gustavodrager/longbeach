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
        var login = User.NormalizeEmail(email);
        var user = email.Contains('@')
            ? await users.FindByEmailAsync(login, cancellationToken)
            : await users.FindByUsernameAsync(login, cancellationToken);

        var passwordVerification = passwordHasher.Verify(password, user?.PasswordHash ?? passwordHasher.DummyHash);
        if (user is null || !user.IsActive || !user.InitialAccessIsValidAt(timeProvider.GetUtcNow()) || passwordVerification == PasswordHashVerificationResult.Failed)
        {
            throw new AuthenticationFailedException();
        }

        if (passwordVerification == PasswordHashVerificationResult.SuccessRehashNeeded)
        {
            user.ChangePasswordHash(passwordHasher.Hash(password));
        }

        return await IssueAndPersistAsync(user, ipAddress, cancellationToken);
    }

    public async Task<AuthSession> LoginWithGoogleAsync(
        string email,
        string? ipAddress,
        CancellationToken cancellationToken = default,
        string? subject = null,
        bool allowEmailMatch = true)
    {
        var user = subject is null ? null : await users.FindByGoogleSubjectAsync(subject, cancellationToken);
        if (user is null && allowEmailMatch)
            user = await users.FindByEmailAsync(User.NormalizeEmail(email), cancellationToken);
        if (user is null || !user.IsActive || user.RequiresFirstAccess ||
            (user.GoogleSubject is not null && user.GoogleSubject != subject))
        {
            throw new AuthenticationFailedException();
        }

        return await IssueAndPersistAsync(
            user,
            ipAddress,
            cancellationToken,
            timeProvider.GetUtcNow().AddHours(8));
    }

    public async Task<AuthSession> CompleteFirstAccessWithGoogleAsync(
        Guid userId, string subject, string email, string? ipAddress, CancellationToken cancellationToken = default)
    {
        var user = await users.FindByIdAsync(userId, cancellationToken);
        if (user is null || !user.IsActive || !user.RequiresFirstAccess ||
            !user.InitialAccessIsValidAt(timeProvider.GetUtcNow())) throw new AuthenticationFailedException();
        var bySubject = await users.FindByGoogleSubjectAsync(subject, cancellationToken);
        var byEmail = await users.FindByEmailAsync(User.NormalizeEmail(email), cancellationToken);
        if (bySubject is not null || (byEmail is not null && byEmail.Id != userId))
            throw new AuthenticationFailedException();
        user.LinkGoogle(subject, email);
        // Destroy the temporary credential; Google becomes the sign-in method.
        user.ChangePasswordHash(passwordHasher.Hash(Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))));
        user.CompleteFirstAccess();
        user.RevokeAllRefreshTokens(timeProvider.GetUtcNow(), ipAddress, "First access completed with Google");
        return await IssueAndPersistAsync(user, ipAddress, cancellationToken, timeProvider.GetUtcNow().AddHours(8));
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

        if (user is null || !user.IsActive || currentToken is null || !user.InitialAccessIsValidAt(now) ||
            currentToken.FirstAccessOnly != user.RequiresFirstAccess)
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

        var issued = tokens.Issue(ToPrincipal(user), now) with
        {
            RefreshTokenExpiresAtUtc = currentToken.ExpiresAtUtc
        };
        currentToken.Revoke(now, ipAddress, "Rotated", issued.RefreshTokenId);
        user.AddRefreshToken(RefreshToken.Create(
            issued.RefreshTokenId,
            user.Id,
            currentToken.FamilyId,
            issued.RefreshTokenHash,
            issued.CsrfTokenHash,
            issued.RefreshTokenExpiresAtUtc,
            ipAddress, user.RequiresFirstAccess));

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
        if (user is null || !user.IsActive || !user.InitialAccessIsValidAt(timeProvider.GetUtcNow()) || passwordVerification == PasswordHashVerificationResult.Failed)
        {
            throw new CurrentPasswordInvalidException();
        }

        PasswordPolicy.EnsureStrong(newPassword);
        if (passwordHasher.Verify(newPassword, user.PasswordHash) != PasswordHashVerificationResult.Failed)
        {
            throw new WeakPasswordException("The new password must be different from the current password.");
        }

        user.ChangePasswordHash(passwordHasher.Hash(newPassword));
        user.CompleteFirstAccess();
        user.RevokeAllRefreshTokens(
            timeProvider.GetUtcNow(),
            ipAddress,
            "Password changed");

        await users.SaveChangesAsync(cancellationToken);
    }

    private async Task<AuthSession> IssueAndPersistAsync(
        User user,
        string? ipAddress,
        CancellationToken cancellationToken,
        DateTimeOffset? refreshTokenExpiresAtUtc = null)
    {
        var issued = tokens.Issue(ToPrincipal(user), timeProvider.GetUtcNow());
        if (refreshTokenExpiresAtUtc is not null)
        {
            issued = issued with { RefreshTokenExpiresAtUtc = refreshTokenExpiresAtUtc.Value };
        }
        if (user.RequiresFirstAccess)
        {
            var limit = timeProvider.GetUtcNow().AddMinutes(15);
            issued = issued with { RefreshTokenExpiresAtUtc = user.InitialAccessExpiresAtUtc < limit
                ? user.InitialAccessExpiresAtUtc.Value : limit };
        }
        user.AddRefreshToken(RefreshToken.Create(
            issued.RefreshTokenId,
            user.Id,
            issued.RefreshTokenId,
            issued.RefreshTokenHash,
            issued.CsrfTokenHash,
            issued.RefreshTokenExpiresAtUtc,
            ipAddress, user.RequiresFirstAccess));

        await users.SaveChangesAsync(cancellationToken);
        return ToResponse(user, issued);
    }

    private static TokenPrincipal ToPrincipal(User user) =>
        new(user.Id, user.Name, VisibleEmail(user), user.RequiresFirstAccess ? [] : user.GetRoleNames(),
            user.RequiresFirstAccess ? [] : user.GetPermissionNames(), user.RequiresFirstAccess, user.Username, user.InitialAccessExpiresAtUtc);

    private static string VisibleEmail(User user) => user.Email.EndsWith("@unlinked.longbeach.invalid", StringComparison.Ordinal) ? string.Empty : user.Email;

    private static AuthSession ToResponse(User user, IssuedTokenPair issued) =>
        new(
            new AuthResponse(
                issued.AccessToken,
                issued.AccessTokenExpiresAtUtc,
                issued.CsrfToken,
                new UserSummary(
                    user.Id,
                    user.Name,
                    VisibleEmail(user),
                    user.RequiresFirstAccess ? [] : user.GetRoleNames(),
                    user.RequiresFirstAccess ? [] : user.GetPermissionNames(),
                    user.RequiresFirstAccess, user.Username)),
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
