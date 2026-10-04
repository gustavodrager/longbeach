using System.Security.Cryptography;
using LongBeach.Application.Auth;
using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LongBeach.Infrastructure.Bootstrap;

public sealed class GoogleAllowedOwnerBootstrapper(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<GoogleAllowedOwnerBootstrapper> logger) : IHostedService
{
    public const string EnabledKey = "Authentication:Google:ProvisionAllowedEmailsAsOwners";

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!environment.IsProduction() || !configuration.GetValue(EnabledKey, false))
        {
            return;
        }

        var emails = GoogleEmailAllowlist.Parse(configuration["Authentication:Google:AllowedEmail"]);
        if (emails.Length == 0)
        {
            throw new InvalidOperationException("Authentication:Google:AllowedEmail must contain at least one address when owner provisioning is enabled.");
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var ownerRole = await dbContext.Roles
            .SingleOrDefaultAsync(role => role.Name == SystemRoles.Owner, cancellationToken)
            ?? throw new InvalidOperationException("The Owner role is missing; seed the authorization catalog before provisioning Google owners.");

        foreach (var email in emails)
        {
            var normalizedEmail = User.NormalizeEmail(email);
            var user = await dbContext.Users
                .Include(item => item.UserRoles)
                .SingleOrDefaultAsync(item => item.NormalizedEmail == normalizedEmail, cancellationToken);
            var created = user is null;

            if (user is null)
            {
                var generatedPassword = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
                user = User.Create(DisplayName(email), email, passwordHasher.Hash(generatedPassword));
                dbContext.Users.Add(user);
            }
            else if (!user.IsActive)
            {
                throw new InvalidOperationException($"The configured Google owner {email} already exists but is inactive.");
            }

            user.AssignRole(ownerRole);
            await dbContext.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Google owner account provisioned (user {UserId}; created: {Created}).", user.Id, created);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static string DisplayName(string email)
    {
        var localPart = email.Split('@', 2)[0];
        return string.Join(" ", localPart.Split(['.', '_', '-'], StringSplitOptions.RemoveEmptyEntries)
            .Select(part => char.ToUpperInvariant(part[0]) + part[1..]));
    }
}
