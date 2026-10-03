namespace LongBeach.Domain.Identity;

public static class SystemRoles
{
    public const string Owner = "Owner";
    public const string Administrator = "Administrator";
    public const string Manager = "Manager";
    public const string Teacher = "Teacher";
    public const string Operations = "Operations";
    public const string Student = "Student";
    public const string Viewer = "Viewer";
    public const string Auditor = "Auditor";

    public static readonly IReadOnlyCollection<string> All =
        [Owner, Administrator, Manager, Teacher, Operations, Student, Viewer, Auditor];
}

public static class SystemPermissions
{
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
        StudentsRead, StudentsWrite,
        EmployeesRead, EmployeesWrite,
        InventoryRead, InventoryWrite,
        ProjectsRead, ProjectsWrite,
        FinanceRead, FinanceWrite,
        UsersManage, AuditRead
    ];
}
