namespace LongBeach.Domain.Identity;

public static class ProfileAccess
{
    public static bool IsManagement(IEnumerable<string> roles) => roles.Any(r => r is SystemRoles.Owner or SystemRoles.Administrator or SystemRoles.Manager);
    // Role ceilings also restrict tokens issued before a role catalogue update.
    // Unclassified legacy/custom identities retain their explicitly assigned permissions.
    public static IReadOnlyCollection<string> Permissions(IEnumerable<string> roles, IEnumerable<string> assigned)
    {
        var names = roles.ToArray();
        if (IsManagement(names)) return SystemPermissions.All;
        var known = names.Where(Grants.ContainsKey).ToArray();
        return known.Length == 0 ? assigned.Distinct().ToArray() : assigned.Intersect(known.SelectMany(r => Grants[r])).ToArray();
    }
    public static readonly IReadOnlyDictionary<string, IReadOnlyCollection<string>> Grants =
        new Dictionary<string, IReadOnlyCollection<string>>(StringComparer.Ordinal)
        {
            [SystemRoles.BarOperator] = [SystemPermissions.BarCatalogRead,SystemPermissions.BarCashOperate,SystemPermissions.BarSalesRead,SystemPermissions.BarSalesOperate],
            [SystemRoles.BarSupervisor] = [SystemPermissions.BarCatalogRead,SystemPermissions.BarStockRead,SystemPermissions.BarStockOutput,SystemPermissions.BarStockManage,SystemPermissions.BarCashOperate,SystemPermissions.BarSalesRead,SystemPermissions.BarSalesOperate,SystemPermissions.BarSupervise,SystemPermissions.BarRefundApprove],
            [SystemRoles.StockManager] = [SystemPermissions.BarCatalogRead,SystemPermissions.BarCatalogWrite,SystemPermissions.BarStockRead,SystemPermissions.BarStockManage,SystemPermissions.BarStockOutput,SystemPermissions.BarPurchasesManage],
            [SystemRoles.BarFinance] = [SystemPermissions.BarCatalogRead,SystemPermissions.BarStockRead,SystemPermissions.BarSalesRead,SystemPermissions.BarFinanceRead,SystemPermissions.BarReconcile,SystemPermissions.BarRefundApprove],
            [SystemRoles.Owner] = SystemPermissions.All,
            [SystemRoles.Administrator] = SystemPermissions.All,
            [SystemRoles.Manager] = SystemPermissions.All,
            [SystemRoles.Teacher] =
            [],
            [SystemRoles.Operations] =
            [
                SystemPermissions.BarCatalogRead, SystemPermissions.BarStockOutput, SystemPermissions.BarStockRead, SystemPermissions.BarCashOperate, SystemPermissions.BarSalesRead, SystemPermissions.BarSalesOperate,
                SystemPermissions.StudentsRead, SystemPermissions.EmployeesRead,
                SystemPermissions.InventoryRead, SystemPermissions.InventoryWrite,
                SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite
            ],
            [SystemRoles.Student] = [],
            [SystemRoles.Viewer] =
            [
                SystemPermissions.StudentsRead, SystemPermissions.EmployeesRead,
                SystemPermissions.InventoryRead, SystemPermissions.ProjectsRead,
                SystemPermissions.FinanceRead
            ],
            [SystemRoles.Auditor] =
            [
                SystemPermissions.StudentsRead, SystemPermissions.EmployeesRead,
                SystemPermissions.InventoryRead, SystemPermissions.ProjectsRead,
                SystemPermissions.FinanceRead, SystemPermissions.AuditRead
            ]
        };

}
