using LongBeach.Domain.Identity;

namespace LongBeach.Application.Authorization;

public static class AuthorizationPolicyCatalog
{
    public const string Management = "Management";
    public static IReadOnlyCollection<string> Permissions => SystemPermissions.All;
}
