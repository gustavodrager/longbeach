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
    public const string ProvisionOwnerEmailsKey = "Authentication:Google:ProvisionOwnerEmails";

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!environment.IsProduction() || !configuration.GetValue(EnabledKey, false))
        {
            return;
        }

        var allowedEmails = GoogleEmailAllowlist.Parse(configuration["Authentication:Google:AllowedEmail"]);
        if (allowedEmails.Length == 0)
        {
            throw new InvalidOperationException("Authentication:Google:AllowedEmail must contain at least one address when owner provisioning is enabled.");
        }

        var hasExplicitOwners = configuration.AsEnumerable()
            .Any(entry => string.Equals(entry.Key, ProvisionOwnerEmailsKey, StringComparison.OrdinalIgnoreCase));
        var emails = hasExplicitOwners
            ? GoogleEmailAllowlist.Parse(configuration[ProvisionOwnerEmailsKey])
            : allowedEmails;
        if (emails.Length == 0)
        {
            throw new InvalidOperationException($"{ProvisionOwnerEmailsKey} must contain at least one address when explicitly configured.");
        }
        if (emails.Any(email => !allowedEmails.Contains(email, StringComparer.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException($"Every address in {ProvisionOwnerEmailsKey} must also be included in Authentication:Google:AllowedEmail.");
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var ownerRole = await dbContext.Roles
            .SingleOrDefaultAsync(role => role.Name == SystemRoles.Owner, cancellationToken)
            ?? throw new InvalidOperationException("The Owner role is missing; seed the authorization catalog before provisioning Google owners.");

        var normalizedEmails = emails.Select(User.NormalizeEmail).ToArray();
        var existingUsers = await dbContext.Users
            .Include(item => item.UserRoles)
            .Where(item => normalizedEmails.Contains(item.NormalizedEmail))
            .ToDictionaryAsync(item => item.NormalizedEmail, cancellationToken);
        if (existingUsers.Values.Any(user => !user.IsActive))
        {
            throw new InvalidOperationException("A configured Google owner already exists but is inactive.");
        }

        var provisionedUsers = new List<(User User, bool Created)>();

        foreach (var email in emails)
        {
            var normalizedEmail = User.NormalizeEmail(email);
            existingUsers.TryGetValue(normalizedEmail, out var user);
            var created = user is null;

            if (user is null)
            {
                var generatedPassword = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
                user = User.Create(DisplayName(email), email, passwordHasher.Hash(generatedPassword));
                dbContext.Users.Add(user);
            }
            user.AssignRole(ownerRole);
            provisionedUsers.Add((user, created));
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        foreach (var (user, created) in provisionedUsers)
        {
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
