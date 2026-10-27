using LongBeach.Domain.Identity;

namespace LongBeach.Application.Authorization;

public static class AuthorizationPolicyCatalog
{
    public const string Owner = SystemRoles.Owner;
    public const string Administrator = SystemRoles.Administrator;
    public static IReadOnlyCollection<string> Permissions => SystemPermissions.All;
}
