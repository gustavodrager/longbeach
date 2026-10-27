using LongBeach.Infrastructure.Persistence;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Auditing;
using LongBeach.Tools;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

var cs = LocalPreview.RequireDatabase(args);
var administratorEmail = LocalPreview.RequireEmail("LONG_BEACH_LOCAL_ADMIN_EMAIL");
var ownerEmail = LocalPreview.RequireEmail("LONG_BEACH_LOCAL_OWNER_EMAIL");
if (administratorEmail == ownerEmail)
{
    throw new InvalidOperationException("Administrador e proprietário precisam ser contas locais distintas.");
}

await using var db = new LongBeachDbContext(
    new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(cs).Options, TimeProvider.System);
var targets = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
{
    [administratorEmail] = SystemRoles.Administrator,
    [ownerEmail] = SystemRoles.Owner,
};
await using var tx = await db.Database.BeginTransactionAsync();
await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031906)");
var emails = targets.Keys.Select(User.NormalizeEmail).ToArray();
var users = await db.Users.Include(x => x.UserRoles).ThenInclude(x => x.Role).Include(x => x.RefreshTokens)
    .Where(x => emails.Contains(x.NormalizedEmail)).ToArrayAsync();
if (users.Length != 2 || users.Any(x => !x.IsActive || x.GoogleSubject is null || x.RequiresFirstAccess))
{
    throw new InvalidOperationException("As duas contas configuradas precisam existir, estar ativas e verificadas por Google na prévia local.");
}

var roles = await db.Roles.Where(x => x.Name == SystemRoles.Administrator || x.Name == SystemRoles.Owner)
    .ToDictionaryAsync(x => x.Name);
if (roles.Count != 2)
{
    throw new InvalidOperationException("Catálogo de papéis incompleto na prévia local.");
}

foreach (var user in users)
{
    var target = targets[user.Email];
    var before = user.GetRoleNames().Order().ToArray();
    if (before.Contains(target) && !before.Contains(SystemRoles.Student)) continue;
    foreach (var student in user.UserRoles.Where(x => x.Role.Name == SystemRoles.Student).ToArray())
    {
        db.UserRoles.Remove(student);
    }

    user.AssignRole(roles[target]);
    user.RevokeAllRefreshTokens(DateTimeOffset.UtcNow, null, "Explicit local fixture invocation");
    db.AuditLogs.Add(AuditLog.Create(null, "RoleChangeAuthorized", "User", user.Id.ToString(),
        JsonSerializer.Serialize(new
        {
            PreviousRoles = before, GrantedRole = target, RemovedRole = SystemRoles.Student,
            Scope = "local-preview-fixtures", Authorization = "Explicit local invocation with --apply-local-fixtures",
            RefreshSessionsRevoked = true,
        }), null, "Local operator command", Guid.NewGuid().ToString("N"), DateTimeOffset.UtcNow));
}

await db.SaveChangesAsync();
await tx.CommitAsync();
Console.WriteLine("Dois perfis Google configurados na prévia local; alterações auditadas e sessões anteriores revogadas.");
