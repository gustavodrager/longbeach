using LongBeach.Infrastructure.Persistence;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Auditing;
using LongBeach.Tools;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

var cs = LocalPreview.RequireDatabase(args);
var firstManagerEmail = LocalPreview.RequireEmail("LONG_BEACH_LOCAL_MANAGER_EMAIL");
var secondManagerEmail = LocalPreview.RequireEmail("LONG_BEACH_LOCAL_SECOND_MANAGER_EMAIL");
if (firstManagerEmail == secondManagerEmail)
{
    throw new InvalidOperationException("Informe duas contas locais distintas para o perfil Gestor.");
}

await using var db = new LongBeachDbContext(
    new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(cs).Options, TimeProvider.System);
await using var tx = await db.Database.BeginTransactionAsync();
await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031906)");
var emails = new[] { firstManagerEmail, secondManagerEmail }.Select(User.NormalizeEmail).ToArray();
var users = await db.Users.Include(x => x.UserRoles).ThenInclude(x => x.Role).Include(x => x.RefreshTokens)
    .Where(x => emails.Contains(x.NormalizedEmail)).ToArrayAsync();
if (users.Length != 2 || users.Any(x => !x.IsActive || x.GoogleSubject is null || x.RequiresFirstAccess))
{
    throw new InvalidOperationException("As duas contas configuradas precisam existir, estar ativas e verificadas por Google na prévia local.");
}

var managerRole = await db.Roles.SingleOrDefaultAsync(x => x.Name == SystemRoles.Manager)
    ?? throw new InvalidOperationException("O perfil Gestor precisa existir no catálogo da prévia local.");

var now = DateTimeOffset.UtcNow;
var correlation = Guid.NewGuid().ToString("N");
var changed = 0;
foreach (var user in users)
{
    var before = user.GetRoleNames().Order().ToArray();
    if (user.UserRoles.Count == 1 && before.SequenceEqual([SystemRoles.Manager])) continue;

    user.SetRole(managerRole);
    user.RevokeAllRefreshTokens(now, null, "Explicit local fixture invocation");
    db.AuditLogs.Add(AuditLog.Create(null, "RoleChangeAuthorized", "User", user.Id.ToString(),
        JsonSerializer.Serialize(new
        {
            PreviousRoles = before, TargetRole = SystemRoles.Manager,
            RemovedRoles = before.Where(role => role != SystemRoles.Manager).ToArray(),
            Scope = "local-preview-fixtures", Authorization = "Explicit local invocation with --apply-local-fixtures",
            RefreshSessionsRevoked = true,
        }), null, "Local operator command", correlation, now));
    changed++;
}

await db.SaveChangesAsync();
await tx.CommitAsync();
Console.WriteLine($"Duas contas Google conferidas na prévia local; {changed} alterações para Gestor exclusivo auditadas, com revogação das sessões anteriores das contas alteradas.");
