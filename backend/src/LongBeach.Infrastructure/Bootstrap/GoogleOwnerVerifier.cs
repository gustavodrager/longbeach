using System.Data;
using System.Globalization;
using LongBeach.Application.Auth;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace LongBeach.Infrastructure.Bootstrap;

public sealed record GoogleOwnerVerificationResult(int TargetCount, int ActiveOwnerCount, int OutsideTargetGrantCount)
{
    public bool Succeeded => TargetCount > 0 && ActiveOwnerCount == TargetCount && OutsideTargetGrantCount == 0;
}

public sealed class GoogleOwnerVerifier(LongBeachDbContext dbContext, IConfiguration configuration, IHostEnvironment environment)
{
    public const string FromUtcKey = "Authentication:Google:VerifyOwnerChangesFromUtc";
    public const string ToUtcKey = "Authentication:Google:VerifyOwnerChangesToUtc";

    public async Task<GoogleOwnerVerificationResult> VerifyAsync(CancellationToken cancellationToken)
    {
        if (!environment.IsProduction())
        {
            throw new InvalidOperationException("Google Owner verification requires Production.");
        }
        var targets = GoogleEmailAllowlist.Parse(configuration[GoogleAllowedOwnerBootstrapper.ProvisionOwnerEmailsKey]);
        var allowed = GoogleEmailAllowlist.Parse(configuration["Authentication:Google:AllowedEmail"]);
        if (targets.Length == 0 || targets.Any(target => !allowed.Contains(target, StringComparer.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException("Google Owner verification requires explicit targets included in Authentication:Google:AllowedEmail.");
        }
        var from = RequiredUtc(FromUtcKey);
        var to = RequiredUtc(ToUtcKey);
        if (from >= to)
        {
            throw new InvalidOperationException("Google Owner verification requires an increasing finite UTC window.");
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY", cancellationToken);
        var ownerRoleId = await dbContext.Roles.AsNoTracking()
            .Where(role => role.Name == SystemRoles.Owner)
            .Select(role => (Guid?)role.Id)
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("Google Owner verification requires the Owner role to exist.");
        var normalizedTargets = targets.Select(User.NormalizeEmail).ToArray();
        var users = await dbContext.Users.AsNoTracking()
            .Where(user => normalizedTargets.Contains(user.NormalizedEmail))
            .Select(user => new { user.Id, user.IsActive, IsOwner = user.UserRoles.Any(role => role.RoleId == ownerRoleId) })
            .ToArrayAsync(cancellationToken);
        var targetRoleResourceIds = users.Select(user => $"{user.Id}:{ownerRoleId}").ToArray();
        var ownerRoleSuffix = $":{ownerRoleId}";
        var outsideTargetGrantCount = await dbContext.AuditLogs.AsNoTracking()
            .Where(audit => audit.Resource == nameof(UserRole) && audit.Action == "Added" &&
                audit.OccurredAtUtc >= from && audit.OccurredAtUtc <= to &&
                audit.ResourceId != null && audit.ResourceId.EndsWith(ownerRoleSuffix) &&
                !targetRoleResourceIds.Contains(audit.ResourceId))
            .CountAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new GoogleOwnerVerificationResult(targets.Length, users.Count(user => user.IsActive && user.IsOwner), outsideTargetGrantCount);
    }

    private DateTimeOffset RequiredUtc(string key)
    {
        var configured = configuration[key]?.Trim();
        if (string.IsNullOrWhiteSpace(configured) ||
            !(configured.EndsWith('Z') || configured.EndsWith("+00:00", StringComparison.Ordinal)) ||
            !DateTimeOffset.TryParse(configured, CultureInfo.InvariantCulture, DateTimeStyles.None, out var value) ||
            value.Offset != TimeSpan.Zero || value == DateTimeOffset.MinValue || value == DateTimeOffset.MaxValue)
        {
            throw new InvalidOperationException($"{key} must be an explicit finite UTC timestamp.");
        }
        return value;
    }
}
