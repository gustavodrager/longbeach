using System.Security.Claims;
using LongBeach.Domain.Identity;
using Microsoft.AspNetCore.Authentication;
namespace LongBeach.Api;

public sealed class ProfileClaimsTransformation : IClaimsTransformation
{
    public Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        if (principal.Identity?.IsAuthenticated != true || principal.HasClaim("requires_first_access", "true")) return Task.FromResult(principal);
        var copy = principal.Clone();
        var permissions = ProfileAccess.Permissions(copy.FindAll(ClaimTypes.Role).Select(c => c.Value), copy.FindAll("permission").Select(c => c.Value));
        foreach (var identity in copy.Identities)
            foreach (var claim in identity.FindAll("permission").ToArray()) identity.RemoveClaim(claim);
        ((ClaimsIdentity)copy.Identity!).AddClaims(permissions.Select(p => new Claim("permission", p)));
        return Task.FromResult(copy);
    }
}
