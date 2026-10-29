namespace LongBeach.Domain.Identity;

public static class ProfileAccess
{
    public static bool HasValidProfile(IEnumerable<string> roles)
    {
        var names = roles.ToArray();
        return names.Length == 1 && SystemRoles.IsValid(names[0]);
    }

    public static bool IsManagement(IEnumerable<string> roles) => roles.SequenceEqual([SystemRoles.Manager]);

    // A profile defines its complete grant set. Stored grants and old JWT claims cannot
    // expand it, and incomplete legacy identities fail closed until explicitly converted.
    public static IReadOnlyCollection<string> Permissions(IEnumerable<string> roles, IEnumerable<string> assigned)
    {
        var names = roles.ToArray();
        return HasValidProfile(names) ? Grants[names[0]].ToArray() : [];
    }
    public static readonly IReadOnlyDictionary<string, IReadOnlyCollection<string>> Grants =
        new Dictionary<string, IReadOnlyCollection<string>>(StringComparer.Ordinal)
        {
            [SystemRoles.Manager] = SystemPermissions.All,
            [SystemRoles.Teacher] =
            [],
            [SystemRoles.Operations] =
            [
                SystemPermissions.CustomersRead, SystemPermissions.CustomersWrite,
                SystemPermissions.BarCatalogRead, SystemPermissions.BarStockOutput, SystemPermissions.BarStockRead, SystemPermissions.BarCashOperate, SystemPermissions.BarSalesRead, SystemPermissions.BarSalesOperate,
                SystemPermissions.StudentsRead, SystemPermissions.StudentsWrite, SystemPermissions.EmployeesRead,
                SystemPermissions.InventoryRead, SystemPermissions.InventoryWrite,
                SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite
            ],
            [SystemRoles.Student] = []
        };

}
