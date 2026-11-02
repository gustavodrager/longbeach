using System.Globalization;
using System.Security.Claims;
using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;

namespace LongBeach.Api;

// Signed claims identify the session, but the current account decides its access.
public sealed class CurrentSessionValidator(IUserRepository users, TimeProvider clock)
{
    public async Task<ClaimsPrincipal?> ValidateAsync(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub"), out var id))
            return null;
        var credentialClaims = principal.FindAll("credential_version").ToArray();
        var credentialVersion = 0; // Sessions issued before credential versioning belong to version zero.
        if (credentialClaims.Length > 1 || credentialClaims.Length == 1 &&
            !int.TryParse(credentialClaims[0].Value, NumberStyles.None, CultureInfo.InvariantCulture, out credentialVersion))
            return null;
        var user = await users.FindForAuthorizationAsync(id, ct);
        if (user is null || !user.IsActive || !user.InitialAccessIsValidAt(clock.GetUtcNow()) ||
            user.CredentialVersion != credentialVersion ||
            !ProfileAccess.HasValidProfile(user.GetRoleNames()) ||
            principal.HasClaim("requires_first_access", "true") != user.RequiresFirstAccess)
            return null;

        var copy = principal.Clone();
        string[] replaced = [ClaimTypes.Role, "permission", ClaimTypes.Name, ClaimTypes.NameIdentifier, "email", "username", "google_linked", "local_password_enabled"];
        foreach (var identity in copy.Identities)
            foreach (var claim in identity.Claims.Where(c => replaced.Contains(c.Type)).ToArray()) identity.RemoveClaim(claim);
        var target = (ClaimsIdentity)copy.Identity!;
        target.AddClaim(new(ClaimTypes.NameIdentifier, user.Id.ToString()));
        target.AddClaim(new(ClaimTypes.Name, user.Name));
        target.AddClaim(new("email", user.Email.EndsWith("@unlinked.longbeach.invalid", StringComparison.Ordinal) ? "" : user.Email));
        if (user.Username is not null) target.AddClaim(new("username", user.Username));
        if (user.GoogleSubject is not null) target.AddClaim(new("google_linked", "true"));
        target.AddClaim(new("local_password_enabled", user.LocalPasswordEnabled ? "true" : "false"));
        if (!user.RequiresFirstAccess)
        {
            target.AddClaims(user.GetRoleNames().Select(role => new Claim(ClaimTypes.Role, role)));
            target.AddClaims(ProfileAccess.Permissions(user.GetRoleNames(), []).Select(permission => new Claim("permission", permission)));
        }
        return copy;
    }
}
