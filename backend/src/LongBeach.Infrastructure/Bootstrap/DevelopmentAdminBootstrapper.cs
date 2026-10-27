using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LongBeach.Infrastructure.Bootstrap;

public sealed class DevelopmentAdminBootstrapper(
    IServiceScopeFactory scopeFactory,
    IHostEnvironment environment,
    ILogger<DevelopmentAdminBootstrapper> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!environment.IsDevelopment())
        {
            return;
        }

        var email = Environment.GetEnvironmentVariable("LONG_BEACH_BOOTSTRAP_ADMIN_EMAIL");
        var password = Environment.GetEnvironmentVariable("LONG_BEACH_BOOTSTRAP_ADMIN_PASSWORD");
        var name = Environment.GetEnvironmentVariable("LONG_BEACH_BOOTSTRAP_ADMIN_NAME") ?? "Administrador";

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogInformation(
                "Development admin was not created. Set LONG_BEACH_BOOTSTRAP_ADMIN_EMAIL and LONG_BEACH_BOOTSTRAP_ADMIN_PASSWORD to opt in.");
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        var adminRole = await dbContext.Roles
            .Include(role => role.RolePermissions)
            .SingleAsync(role => role.Name == SystemRoles.Administrator, cancellationToken);

        var normalizedEmail = User.NormalizeEmail(email);
        var user = await dbContext.Users
            .Include(item => item.UserRoles)
            .SingleOrDefaultAsync(item => item.NormalizedEmail == normalizedEmail, cancellationToken);

        if (user is null)
        {
            user = User.Create(name, email, passwordHasher.Hash(password));
            user.AssignRole(adminRole);
            dbContext.Users.Add(user);
            logger.LogInformation("Development administrator {AdminEmail} created.", email);
        }
        else
        {
            user.AssignRole(adminRole);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
