using System.Net.Mail;
using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LongBeach.Infrastructure.Bootstrap;

public sealed class ProductionOwnerBootstrapper(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<ProductionOwnerBootstrapper> logger) : IHostedService
{
    public const string EnabledKey = "Bootstrap:InitialOwner:Enabled";
    public const string NameKey = "Bootstrap:InitialOwner:Name";
    public const string EmailKey = "Bootstrap:InitialOwner:Email";
    public const string PasswordKey = "Bootstrap:InitialOwner:Password";

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!environment.IsProduction() || !configuration.GetValue(EnabledKey, false))
        {
            return;
        }

        var name = RequiredValue(NameKey);
        var email = RequiredValue(EmailKey);
        var password = RequiredValue(PasswordKey);
        Validate(name, email, password);

        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        var ownerRole = await dbContext.Roles
            .SingleOrDefaultAsync(role => role.Name == SystemRoles.Owner, cancellationToken)
            ?? throw new InvalidOperationException(
                "The Owner role is missing. Enable Authorization:SeedOnStartup for the one-time bootstrap deployment.");

        var normalizedEmail = User.NormalizeEmail(email);
        var user = await dbContext.Users
            .Include(item => item.UserRoles)
            .SingleOrDefaultAsync(item => item.NormalizedEmail == normalizedEmail, cancellationToken);

        var created = user is null;
        if (created)
        {
            user = User.Create(name, email, passwordHasher.Hash(password));
            dbContext.Users.Add(user);
        }
        else if (!user!.IsActive)
        {
            throw new InvalidOperationException("The configured initial Owner already exists but is inactive.");
        }

        user!.AssignRole(ownerRole);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogWarning(
            "Production initial Owner bootstrap completed for user {UserId} (created: {Created}). Disable {EnabledKey} and remove the bootstrap password before the next deployment.",
            user.Id,
            created,
            EnabledKey);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private string RequiredValue(string key)
    {
        var value = configuration[key];
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"{key} must be configured when {EnabledKey} is enabled.");
        }

        return value.Trim();
    }

    private static void Validate(string name, string email, string password)
    {
        if (name.Length > 160)
        {
            throw new InvalidOperationException($"{NameKey} must contain at most 160 characters.");
        }

        if (email.Length > 320 || !MailAddress.TryCreate(email, out _))
        {
            throw new InvalidOperationException($"{EmailKey} must be a valid email address with at most 320 characters.");
        }

        if (password.Length is < 14 or > 256)
        {
            throw new InvalidOperationException($"{PasswordKey} must contain between 14 and 256 characters.");
        }
    }
}
