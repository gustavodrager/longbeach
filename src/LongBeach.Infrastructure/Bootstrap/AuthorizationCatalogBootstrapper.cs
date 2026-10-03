using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace LongBeach.Infrastructure.Bootstrap;

public sealed class AuthorizationCatalogBootstrapper(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration) : IHostedService
{
    private static readonly IReadOnlyDictionary<string, IReadOnlyCollection<string>> Grants =
        new Dictionary<string, IReadOnlyCollection<string>>(StringComparer.Ordinal)
        {
            [SystemRoles.Owner] = SystemPermissions.All,
            [SystemRoles.Administrator] = SystemPermissions.All,
            [SystemRoles.Manager] =
            [
                SystemPermissions.StudentsRead, SystemPermissions.StudentsWrite,
                SystemPermissions.EmployeesRead, SystemPermissions.EmployeesWrite,
                SystemPermissions.InventoryRead, SystemPermissions.InventoryWrite,
                SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite,
                SystemPermissions.FinanceRead, SystemPermissions.FinanceWrite,
                SystemPermissions.AuditRead
            ],
            [SystemRoles.Teacher] =
            [SystemPermissions.StudentsRead, SystemPermissions.StudentsWrite, SystemPermissions.InventoryRead, SystemPermissions.ProjectsRead],
            [SystemRoles.Operations] =
            [
                SystemPermissions.StudentsRead, SystemPermissions.EmployeesRead,
                SystemPermissions.InventoryRead, SystemPermissions.InventoryWrite,
                SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite
            ],
            [SystemRoles.Student] = [SystemPermissions.StudentsRead],
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

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!configuration.GetValue("Authorization:SeedOnStartup", false))
        {
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();

        var permissions = await dbContext.Permissions.ToDictionaryAsync(
            item => item.Name,
            StringComparer.Ordinal,
            cancellationToken);

        foreach (var permissionName in SystemPermissions.All)
        {
            if (!permissions.ContainsKey(permissionName))
            {
                var permission = new Permission(permissionName);
                permissions.Add(permissionName, permission);
                dbContext.Permissions.Add(permission);
            }
        }

        var roles = await dbContext.Roles
            .Include(role => role.RolePermissions)
            .ToDictionaryAsync(role => role.Name, StringComparer.Ordinal, cancellationToken);

        foreach (var roleName in SystemRoles.All)
        {
            if (!roles.TryGetValue(roleName, out var role))
            {
                role = new Role(roleName);
                roles.Add(roleName, role);
                dbContext.Roles.Add(role);
            }

            foreach (var permissionName in Grants[roleName])
            {
                role.Grant(permissions[permissionName]);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
