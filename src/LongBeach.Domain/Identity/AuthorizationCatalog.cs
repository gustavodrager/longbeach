namespace LongBeach.Domain.Identity;

public static class SystemRoles
{
    public const string BarOperator = "BarOperator";
    public const string BarSupervisor = "BarSupervisor";
    public const string StockManager = "StockManager";
    public const string BarFinance = "BarFinance";
    public const string Owner = "Owner";
    public const string Administrator = "Administrator";
    public const string Manager = "Manager";
    public const string Teacher = "Teacher";
    public const string Operations = "Operations";
    public const string Student = "Student";
    public const string Viewer = "Viewer";
    public const string Auditor = "Auditor";

    public static readonly IReadOnlyCollection<string> All =
        [Owner, Administrator, Manager, Teacher, Operations, Student, Viewer, Auditor, BarOperator, BarSupervisor, StockManager, BarFinance];
}

public static class SystemPermissions
{
    public const string BarStockOutput = "bar:stock:output";
    public const string BarStockRead = "bar:stock:read";
    public const string BarStockManage = "bar:stock:manage";
    public const string BarCashOperate = "bar:cash:operate";
    public const string BarSupervise = "bar:supervise";
    public const string BarRefundApprove = "bar:refund:approve";
    public const string BarSalesRead = "bar:sales:read";
    public const string BarSalesOperate = "bar:sales:operate";
    public const string BarFinanceRead = "bar:finance:read";
    public const string BarPurchasesManage = "bar:purchases:manage";
    public const string BarReconcile = "bar:payments:reconcile";
    public const string BarCatalogRead = "bar:catalog:read";
    public const string BarCatalogWrite = "bar:catalog:write";
    public const string StudentsRead = "students:read";
    public const string StudentsWrite = "students:write";
    public const string EmployeesRead = "employees:read";
    public const string EmployeesWrite = "employees:write";
    public const string InventoryRead = "inventory:read";
    public const string InventoryWrite = "inventory:write";
    public const string ProjectsRead = "projects:read";
    public const string ProjectsWrite = "projects:write";
    public const string FinanceRead = "finance:read";
    public const string FinanceWrite = "finance:write";
    public const string UsersManage = "users:manage";
    public const string AuditRead = "audit:read";

    public static readonly IReadOnlyCollection<string> All =
    [
        BarCatalogRead, BarCatalogWrite, BarStockOutput, BarStockRead, BarStockManage, BarCashOperate, BarSupervise,
        BarRefundApprove, BarSalesRead, BarSalesOperate, BarFinanceRead, BarPurchasesManage, BarReconcile,
        StudentsRead, StudentsWrite,
        EmployeesRead, EmployeesWrite,
        InventoryRead, InventoryWrite,
        ProjectsRead, ProjectsWrite,
        FinanceRead, FinanceWrite,
        UsersManage, AuditRead
    ];
}
