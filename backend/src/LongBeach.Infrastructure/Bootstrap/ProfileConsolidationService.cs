using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Domain.Auditing;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Bootstrap;

public sealed record ProfileConsolidationIdentity(Guid UserId, bool IsActive, string[] Roles, bool RequiresFirstAccess = false);
public sealed record ProfileConsolidationMapping(Guid UserId, string[] ExpectedRoles, string TargetRole);
public sealed record ProfileConsolidationRequest(string? ExpectedFingerprint = null, ProfileConsolidationMapping[]? Mappings = null);
public sealed record ProfileConsolidationIssue(Guid? UserId, string Code, string[]? CurrentRoles = null);
public sealed record ProfileConsolidationChange(Guid UserId, string[] PreviousRoles, string TargetRole);
public sealed record ProfileConsolidationPreview(
    string Fingerprint, int Users, int ActiveManagers,
    IReadOnlyDictionary<string, int> ProfilesBefore, IReadOnlyDictionary<string, int> ProfilesAfter,
    IReadOnlyList<ProfileConsolidationChange> Changes, IReadOnlyList<ProfileConsolidationIssue> Issues)
{
    public bool CanApply => Issues.Count == 0;
}
public sealed record ProfileConsolidationResult(int Users, int ChangedUsers, int RevokedRefreshTokens, int ActiveManagers);

/// <summary>Pure transition rules. The output intentionally contains no names, email addresses or credentials.</summary>
public static class ProfileConsolidationRules
{
    public static ProfileConsolidationPreview Preview(
        IReadOnlyCollection<ProfileConsolidationIdentity> identities, ProfileConsolidationRequest request)
    {
        request ??= new();
        var users = identities.OrderBy(u => u.UserId).ToArray();
        var snapshot = users.Select(u => new { u.UserId, u.IsActive, u.RequiresFirstAccess, Roles = Ordered(u.Roles) }).ToArray();
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(snapshot))));
        var issues = new List<ProfileConsolidationIssue>();
        var changes = new List<ProfileConsolidationChange>();
        var targets = new Dictionary<Guid, string>();
        var mappings = (request.Mappings ?? []).Where(mapping => mapping is not null).ToArray();
        if (mappings.Length != (request.Mappings?.Length ?? 0)) issues.Add(new(null, "invalid_mapping"));
        var repeatedIds = mappings.GroupBy(m => m.UserId).Where(g => g.Count() != 1).Select(g => g.Key).ToHashSet();
        foreach (var id in repeatedIds) issues.Add(new(id, "duplicate_mapping"));
        foreach (var mapping in mappings.Where(m => users.All(u => u.UserId != m.UserId)))
            issues.Add(new(mapping.UserId, "unknown_user"));
        foreach (var user in users)
        {
            if (repeatedIds.Contains(user.UserId)) continue;
            var roles = Ordered(user.Roles);
            var mapping = mappings.SingleOrDefault(m => m.UserId == user.UserId);
            string? target;
            if (mapping is not null)
            {
                if (mapping.ExpectedRoles is null || mapping.ExpectedRoles.Any(string.IsNullOrWhiteSpace))
                { issues.Add(new(user.UserId, "invalid_mapping", roles)); continue; }
                if (!roles.SequenceEqual(Ordered(mapping.ExpectedRoles), StringComparer.Ordinal))
                { issues.Add(new(user.UserId, "roles_changed", roles)); continue; }
                target = mapping.TargetRole;
                if (!SystemRoles.All.Contains(target, StringComparer.Ordinal))
                { issues.Add(new(user.UserId, "unsupported_target", roles)); continue; }
            }
            else
            {
                target = roles.Length == 1 ? roles[0] switch
                {
                    "Owner" or "Administrator" or SystemRoles.Manager => SystemRoles.Manager,
                    SystemRoles.Teacher => SystemRoles.Teacher,
                    SystemRoles.Operations => SystemRoles.Operations,
                    SystemRoles.Student => SystemRoles.Student,
                    _ => null
                } : null;
                if (target is null) { issues.Add(new(user.UserId, "explicit_mapping_required", roles)); continue; }
            }
            targets.Add(user.UserId, target);
            if (roles.Length != 1 || roles[0] != target) changes.Add(new(user.UserId, roles, target));
        }
        // A pending account only has setup access, even before its initial credential expires.
        // It cannot replace the last manager who can actually administer the application.
        var activeManagers = users.Count(u => u.IsActive && !u.RequiresFirstAccess && targets.GetValueOrDefault(u.UserId) == SystemRoles.Manager);
        if (activeManagers == 0) issues.Add(new(null, "active_manager_required"));
        return new(fingerprint, users.Length, activeManagers,
            users.GroupBy(u => u.Roles is not { Length: > 0 } ? "(none)" : string.Join("+", Ordered(u.Roles)))
                .ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal),
            SystemRoles.All.ToDictionary(r => r, r => targets.Values.Count(v => v == r), StringComparer.Ordinal), changes, issues);
    }

    private static string[] Ordered(IEnumerable<string>? roles) => (roles ?? []).Order(StringComparer.Ordinal).ToArray();
}

/// <summary>Explicit one-shot conversion. Never registered as a startup job or used by an HTTP endpoint.</summary>
public sealed class ProfileConsolidationService(LongBeachDbContext db, TimeProvider clock)
{
    public async Task<ProfileConsolidationPreview> PreviewAsync(ProfileConsolidationRequest request, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY", ct);
        var result = ProfileConsolidationRules.Preview(await Identities(ct), request);
        await tx.CommitAsync(ct);
        return result;
    }

    public async Task<ProfileConsolidationResult> ApplyAsync(ProfileConsolidationRequest request, CancellationToken ct = default)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.ExpectedFingerprint))
            throw new InvalidOperationException("Run the read-only profile preview and supply its ExpectedFingerprint before applying.");
        if (db.ChangeTracker.HasChanges())
            throw new InvalidOperationException("Profile consolidation requires a clean, dedicated database context.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        // Block competing provisioning/role writes while retaining ordinary read access.
        await db.Database.ExecuteSqlRawAsync("LOCK TABLE users, user_roles, roles, role_permissions, permissions IN SHARE ROW EXCLUSIVE MODE", ct);
        var preview = ProfileConsolidationRules.Preview(await Identities(ct), request);
        if (!string.Equals(preview.Fingerprint, request.ExpectedFingerprint, StringComparison.Ordinal))
            throw new InvalidOperationException("The profile inventory changed. Run a new preview; no profiles were changed.");
        if (!preview.CanApply)
            throw new InvalidOperationException("The profile mapping is incomplete or conflicting. Review preview issues; no profiles were changed.");

        try
        {
            var roles = await AuthorizationCatalogReconciler.ReconcileAsync(db, clearLegacyGrants: true, ct);
            var changedIds = preview.Changes.Select(c => c.UserId).ToArray();
            var users = await db.Users.Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
                .Include(u => u.RefreshTokens).Where(u => changedIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
            var now = clock.GetUtcNow();
            var correlation = Guid.NewGuid().ToString("N");
            var revoked = 0;
            foreach (var change in preview.Changes)
            {
                var user = users[change.UserId];
                revoked += user.RefreshTokens.Count(token => token.IsActiveAt(now));
                user.SetRole(roles[change.TargetRole]);
                user.RevokeAllRefreshTokens(now, null, "Profile consolidation");
                db.AuditLogs.Add(AuditLog.Create(null, "ProfileConsolidated", nameof(User), user.Id.ToString(),
                    JsonSerializer.Serialize(new { change.PreviousRoles, change.TargetRole, RefreshSessionsRevoked = true }),
                    null, "Explicit profile consolidation", correlation, now));
            }
            db.AuditLogs.Add(AuditLog.Create(null, "ProfileCatalogConsolidated", "AuthorizationCatalog", null,
                JsonSerializer.Serialize(new { preview.Users, ChangedUsers = preview.Changes.Count, preview.ActiveManagers, RevokedRefreshTokens = revoked }),
                null, "Explicit profile consolidation", correlation, now));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return new(preview.Users, preview.Changes.Count, revoked, preview.ActiveManagers);
        }
        catch
        {
            await tx.RollbackAsync(CancellationToken.None);
            db.ChangeTracker.Clear();
            throw;
        }
    }

    private Task<ProfileConsolidationIdentity[]> Identities(CancellationToken ct) => db.Users.AsNoTracking()
        .Select(u => new ProfileConsolidationIdentity(u.Id, u.IsActive, u.UserRoles.Select(ur => ur.Role.Name).ToArray(), u.RequiresFirstAccess))
        .ToArrayAsync(ct);
}

internal static class AuthorizationCatalogReconciler
{
    public static async Task<IReadOnlyDictionary<string, Role>> ReconcileAsync(
        LongBeachDbContext db, bool clearLegacyGrants, CancellationToken ct)
    {
        var permissions = await db.Permissions.ToDictionaryAsync(p => p.Name, StringComparer.Ordinal, ct);
        foreach (var name in SystemPermissions.All)
            if (!permissions.ContainsKey(name)) { var permission = new Permission(name); permissions.Add(name, permission); db.Permissions.Add(permission); }
        var roles = await db.Roles.Include(r => r.RolePermissions).ThenInclude(rp => rp.Permission)
            .ToDictionaryAsync(r => r.Name, StringComparer.Ordinal, ct);
        foreach (var name in SystemRoles.All)
        {
            if (!roles.TryGetValue(name, out var role)) { role = new Role(name); roles.Add(name, role); db.Roles.Add(role); }
            var desired = ProfileAccess.Grants[name];
            db.RemoveRange(role.RolePermissions.Where(rp => !desired.Contains(rp.Permission.Name, StringComparer.Ordinal)));
            foreach (var permission in desired) role.Grant(permissions[permission]);
        }
        if (clearLegacyGrants)
            foreach (var role in roles.Values.Where(r => !SystemRoles.All.Contains(r.Name, StringComparer.Ordinal)))
                db.RemoveRange(role.RolePermissions);
        return roles.Where(pair => SystemRoles.All.Contains(pair.Key, StringComparer.Ordinal))
            .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
    }
}
