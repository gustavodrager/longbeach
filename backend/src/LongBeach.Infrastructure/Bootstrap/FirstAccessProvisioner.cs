using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace LongBeach.Infrastructure.Bootstrap;

// Explicit, one-shot command. Never invoked by an application replica on startup.
public sealed class FirstAccessProvisioner(LongBeachDbContext db, IPasswordHasher hasher, TimeProvider clock)
{
    public async Task<(int Created, int Existing)> RunAsync(IConfiguration configuration, CancellationToken ct = default)
    {
        var section = configuration.GetSection("Bootstrap:FirstAccess");
        var accounts = section.GetSection("Accounts").Get<FirstAccessAccount[]>() ?? [];
        var password = section["TemporaryPassword"];
        var expiry = section.GetValue<DateTimeOffset>("ExpiresAtUtc");
        if (accounts.Length is < 1 or > 20 || string.IsNullOrWhiteSpace(password) || password.Length is < 6 or > 256 ||
            expiry <= clock.GetUtcNow() || expiry > clock.GetUtcNow().AddDays(7))
            throw new InvalidOperationException("Configure explicit accounts, a temporary password and an expiry within seven days.");
        if (accounts.Select(x => User.NormalizeEmail(x.Username)).Distinct().Count() != accounts.Length)
            throw new InvalidOperationException("Duplicate usernames in provisioning request.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031905)", ct);
        var created = 0; var existing = 0;
        foreach (var account in accounts)
        {
            if (string.IsNullOrWhiteSpace(account.Name) || account.Name.Length > 160)
                throw new InvalidOperationException("A name of up to 160 characters is required.");
            var normalized = User.NormalizeEmail(account.Username);
            var role = await db.Roles.SingleOrDefaultAsync(x => x.Name == account.Role, ct)
                ?? throw new InvalidOperationException("Requested role does not exist.");
            var user = await db.Users.Include(x => x.UserRoles).SingleOrDefaultAsync(x => x.NormalizedUsername == normalized, ct);
            if (user is not null)
            {
                if (!user.IsActive || user.Name != account.Name || !user.UserRoles.Any(x => x.RoleId == role.Id))
                    throw new InvalidOperationException("An existing account conflicts with the request. No credentials were reset.");
                existing++;
                continue;
            }
            if (await db.Users.AnyAsync(x => x.Name.ToUpper() == account.Name.ToUpper(), ct))
                throw new InvalidOperationException("An account already uses this name. Resolve its identity before provisioning.");
            user = User.CreateForFirstAccess(account.Name, account.Username, hasher.Hash(password), expiry);
            user.AssignRole(role);
            db.Users.Add(user);
            created++;
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return (created, existing);
    }
}

public sealed record FirstAccessAccount(string Name, string Username, string Role);
