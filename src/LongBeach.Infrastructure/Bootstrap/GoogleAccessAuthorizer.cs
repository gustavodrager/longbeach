using System.Security.Cryptography;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Domain.Auditing;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
namespace LongBeach.Infrastructure.Bootstrap;

/// <summary>Explicit operator command for an existing pending account; never creates users or grants roles.</summary>
public sealed class GoogleAccessAuthorizer(LongBeachDbContext db, IPasswordHasher hasher, TimeProvider clock)
{
    public async Task<bool> RunAsync(IConfiguration configuration, CancellationToken ct = default)
    {
        var username = configuration["Bootstrap:GoogleAccess:Username"]?.Trim();
        var email = configuration["Bootstrap:GoogleAccess:Email"]?.Trim();
        var role = configuration["Bootstrap:GoogleAccess:Role"];
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(email) ||
            !System.Net.Mail.MailAddress.TryCreate(email, out var address) || address.Address != email ||
            email.Length > 320 || string.IsNullOrWhiteSpace(role) ||
            !configuration.GetValue("Authentication:Google:Enabled", false) ||
            !GoogleEmailAllowlist.Contains(configuration["Authentication:Google:AllowedEmail"], email))
            throw new InvalidOperationException("Configure an explicit existing username, approved role and allowlisted Google email.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031905)", ct);
        var normalized = User.NormalizeEmail(username); var normalizedEmail = User.NormalizeEmail(email);
        var user = await db.Users.Include(x => x.UserRoles).ThenInclude(x => x.Role).Include(x => x.RefreshTokens)
            .SingleOrDefaultAsync(x => x.NormalizedUsername == normalized, ct);
        if (user is null || !user.IsActive || !user.GetRoleNames().Contains(role))
            throw new InvalidOperationException("Existing active account with the approved role was not found.");
        if (await db.Users.AnyAsync(x => x.Id != user.Id && x.NormalizedEmail == normalizedEmail, ct))
            throw new InvalidOperationException("The email already belongs to another account. No change was applied.");
        if (user.NormalizedEmail == normalizedEmail && !user.RequiresFirstAccess)
        { await tx.CommitAsync(ct); return false; }
        // Pending username accounts only. An already activated identity cannot be silently replaced.
        user.PrepareGoogleAccess(email, hasher.Hash(Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))));
        user.RevokeAllRefreshTokens(clock.GetUtcNow(), null, "Google access authorized for existing account");
        db.AuditLogs.Add(AuditLog.Create(null, "GoogleAccessAuthorized", "User", user.Id.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { ExistingRole = role, TemporaryCredentialRevoked = true }),
            null, "Explicit operator command", Guid.NewGuid().ToString("N"), clock.GetUtcNow()));
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true;
    }
}
