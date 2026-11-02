using System.Data;
using LongBeach.Application.Customers;
using LongBeach.Contracts.Customers;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Customers;

public sealed class CustomerGuardianService(LongBeachDbContext db, TimeProvider time) : ICustomerGuardians
{
    private static void Require(bool allowed, string message, int status = 400)
    {
        if (!allowed) throw new CustomerRuleException(message, status);
    }

    private async Task<(CustomerGuardianScope Scope, Guid Canonical, HashSet<Guid> Family)> Family(Guid customerId, CancellationToken ct)
    {
        var scope = await CustomerGuardianScope.Load(db, ct);
        var canonical = scope.Canonical(customerId);
        Require(canonical != Guid.Empty, "Cliente não encontrado ou com unificação pendente de conferência.", 404);
        return (scope, canonical, scope.Family(canonical));
    }

    public async Task<IReadOnlyList<GuardianDto>> List(Guid customerId, CancellationToken ct)
    {
        var (scope, canonical, family) = await Family(customerId, ct);
        var groups = scope.Records.Where(row => family.Contains(row.CustomerId)).GroupBy(row => row.UserId).ToArray();
        var ids = groups.Select(group => group.Key).ToArray();
        var users = await db.Users.AsNoTracking().Where(row => ids.Contains(row.Id)).ToDictionaryAsync(row => row.Id, ct);
        return groups.Select(group =>
        {
            var user = users.GetValueOrDefault(group.Key);
            // Multiple records for a merged pair require administrative reconciliation.
            // A denial always wins; zero cannot accidentally be used as a current version.
            return new GuardianDto(canonical, group.Key, user?.Name ?? "Conta indisponível",
                user is null ? "Contato não informado" : CustomerAccountHints.For(user.Email, user.Username), group.All(row => row.IsGranted),
                group.Count() == 1 ? group.Single().Version : 0);
        }).OrderBy(row => row.Name).ThenBy(row => row.UserId).ToArray();
    }

    public async Task<IReadOnlyList<CustomerUserCandidate>> Candidates(Guid customerId, string? search, CancellationToken ct)
    {
        var (scope, _, family) = await Family(customerId, ct);
        Require(!scope.Customers.Values.Any(row => family.Contains(row.Id) && row.UserId is not null),
            "Este cliente possui conta própria. Confira o cadastro antes de cadastrar responsáveis.", 409);
        if (string.IsNullOrWhiteSpace(search) || search.Trim().Length < 2) return [];
        Require(search.Length <= 240, "Reduza o texto da busca.");
        var pattern = "%" + search.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
        var registered = scope.Records.Where(row => family.Contains(row.CustomerId)).Select(row => row.UserId).ToArray();
        var users = await db.Users.AsNoTracking().Include(row => row.UserRoles).ThenInclude(row => row.Role)
            .Where(row => row.IsActive && !row.RequiresFirstAccess && !registered.Contains(row.Id)
                && (EF.Functions.ILike(row.Name, pattern) || EF.Functions.ILike(row.Email, pattern)
                    || row.Username != null && EF.Functions.ILike(row.Username, pattern)))
            .OrderBy(row => row.Name).ThenBy(row => row.Id).Take(20).ToArrayAsync(ct);
        return users.Where(row => ProfileAccess.HasValidProfile(row.UserRoles.Select(link => link.Role.Name)))
            .Select(row => new CustomerUserCandidate(row.Id, row.Name, CustomerAccountHints.For(row.Email, row.Username))).ToArray();
    }

    public async Task<GuardianDto> Set(Guid customerId, Guid userId, CustomerGuardianInput input, Guid actor, CancellationToken ct)
    {
        Require(actor != Guid.Empty && userId != Guid.Empty && input.ExpectedVersion >= 0,
            "Confira o responsável e a versão do acesso.");
        await using var transaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct) : null;
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031907)", ct);
        var (scope, canonical, family) = await Family(customerId, ct);
        Require(!scope.Customers.Values.Any(row => family.Contains(row.Id) && row.UserId is not null),
            "Este cliente possui conta própria. Confira o cadastro antes de cadastrar responsáveis.", 409);
        var matches = await db.Set<CustomerGuardianAccess>().Where(row => family.Contains(row.CustomerId) && row.UserId == userId).ToArrayAsync(ct);
        Require(matches.Length <= 1, "Há vínculos de responsáveis repetidos após a unificação. Peça à gestão para conferir o histórico.", 409);
        var user = await db.Users.AsNoTracking().Include(row => row.UserRoles).ThenInclude(row => row.Role)
            .SingleOrDefaultAsync(row => row.Id == userId, ct);
        Require(user is not null, "Conta do responsável não encontrada.", 404);
        if (input.IsGranted)
        {
            Require(scope.Customers[canonical].Status == "Ativo", "Ative o dependente antes de liberar o acesso.");
            Require(user!.IsActive && !user.RequiresFirstAccess && ProfileAccess.HasValidProfile(user.UserRoles.Select(link => link.Role.Name)),
                "Escolha uma conta ativa com o primeiro acesso concluído.");
        }
        CustomerGuardianAccess record;
        if (matches.SingleOrDefault() is { } existing)
        {
            if (db.Entry(existing).State == EntityState.Unchanged) await db.Entry(existing).ReloadAsync(ct);
            existing.SetGranted(input.IsGranted, input.ExpectedVersion);
            record = existing;
        }
        else
        {
            Require(input.ExpectedVersion == 0, "O acesso deste responsável mudou. Atualize antes de continuar.", 409);
            record = new CustomerGuardianAccess(canonical, userId, input.IsGranted);
            record.MarkCreated(time.GetUtcNow());
            db.Add(record);
        }
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return new(canonical, userId, user!.Name, CustomerAccountHints.For(user.Email, user.Username), record.IsGranted, record.Version);
    }
}

internal static class CustomerAccountHints
{
    public static string For(string email, string? username)
    {
        if (email.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase) || !email.Contains('@'))
            return string.IsNullOrWhiteSpace(username) ? "Contato não informado" : "Usuário: " + username;
        return email[..1] + "•••@" + email.Split('@')[1];
    }
}

// Every record, including a revocation, makes its canonical family explicitly
// controlled. Neither a billing account nor an old portal link can override it.
internal sealed class CustomerGuardianScope
{
    public required IReadOnlyDictionary<Guid, Customer> Customers { get; init; }
    public required IReadOnlyList<CustomerGuardianAccess> Records { get; init; }

    public static async Task<CustomerGuardianScope> Load(LongBeachDbContext db, CancellationToken ct) => new()
    {
        Customers = await db.Set<Customer>().AsNoTracking().ToDictionaryAsync(row => row.Id, ct),
        Records = await db.Set<CustomerGuardianAccess>().AsNoTracking().ToArrayAsync(ct)
    };

    public Guid Canonical(Guid id)
    {
        var seen = new HashSet<Guid>();
        while (Customers.TryGetValue(id, out var customer) && seen.Add(id) && seen.Count <= 64)
        {
            if (customer.MergedIntoId is not Guid next) return id;
            id = next;
        }
        return Guid.Empty;
    }

    public HashSet<Guid> Family(Guid canonical) => Customers.Keys.Where(id => Canonical(id) == canonical).ToHashSet();

    public bool Controlled(Guid customerId)
    {
        var canonical = Canonical(customerId);
        return canonical != Guid.Empty && Records.Any(row => Canonical(row.CustomerId) == canonical);
    }

    public bool Granted(Guid customerId, Guid userId)
    {
        var canonical = Canonical(customerId);
        if (canonical == Guid.Empty || Customers[canonical].Status != "Ativo") return false;
        var pairs = Records.Where(row => Canonical(row.CustomerId) == canonical && row.UserId == userId).ToArray();
        return pairs.Length > 0 && pairs.All(row => row.IsGranted);
    }
}
