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

            foreach (var permissionName in ProfileAccess.Grants[roleName])
            {
                role.Grant(permissions[permissionName]);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
