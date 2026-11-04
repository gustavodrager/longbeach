using System.Security.Claims;
using LongBeach.Contracts.Staff;

namespace LongBeach.Api;

// Only the current server-side account populates these claims; never retain JWT copies.
internal static class StaffSessionClaims
{
    public static void Add(ClaimsIdentity identity, StaffAccessSummary? access)
    {
        if (access is null) return;
        identity.AddClaim(new("staff_managed", "true"));
        identity.AddClaim(new("staff_type_id", access.TypeId));
        identity.AddClaim(new("staff_type_name", access.Name));
        identity.AddClaim(new("staff_type_role", access.Role));
        identity.AddClaim(new("staff_home", access.HomePath));
        identity.AddClaims(access.Menus.Select(menu => new Claim("staff_menu", menu)));
        identity.AddClaims(access.Actions.Select(action => new Claim("staff_action", action)));
    }

    public static StaffAccessSummary? Read(ClaimsPrincipal principal) => !principal.HasClaim("staff_managed", "true") ? null :
        new(principal.FindFirstValue("staff_type_id") ?? "", principal.FindFirstValue("staff_type_name") ?? "",
            principal.FindFirstValue("staff_type_role") ?? "", principal.FindAll("staff_menu").Select(c => c.Value).Distinct(StringComparer.Ordinal).ToArray(),
            principal.FindAll("staff_action").Select(c => c.Value).Distinct(StringComparer.Ordinal).ToArray(),
            principal.FindFirstValue("staff_home") ?? "/minha-area/seguranca");
}
