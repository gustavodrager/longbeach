using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Customers;
using LongBeach.Contracts.Customers;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Customers;

public sealed partial class CustomerService(LongBeachDbContext db, TimeProvider time) : ICustomers
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> Kinds = ["students", "rentalMembers", "reservations", "barTabs", "barSales", "users"];
    private static string Fingerprint<T>(T value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, Json))));
    private static void Require(bool condition, string message, int status = 400) { if (!condition) throw new CustomerRuleException(message, status); }
    private static void Source(string kind, Guid sourceId, Guid? parent)
    {
        Require(Kinds.Contains(kind) && sourceId != Guid.Empty, "Origem do cliente inválida.");
        Require(kind == "rentalMembers" ? parent is not null && parent != Guid.Empty : parent is null || parent == Guid.Empty, "Confira o grupo de origem do integrante.");
    }
    private async Task Lock(CancellationToken ct)
    {
        db.ChangeTracker.DetectChanges();
        Require(db.Database.CurrentTransaction is not null, "A integração de clientes exige a transação do comando.");
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031907)", ct);
    }
    private async Task<T> Write<T>(Func<Task<T>> action, CancellationToken ct)
    {
        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct) : null;
        await Lock(ct);
        var result = await action();
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return result;
    }
    private async Task<Customer?> Raw(Guid id, CancellationToken ct)
    {
        var value = db.Set<Customer>().Local.SingleOrDefault(x => x.Id == id) ?? await db.Set<Customer>().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (value is not null && db.Database.CurrentTransaction is not null && db.Entry(value).State == EntityState.Unchanged) await db.Entry(value).ReloadAsync(ct);
        return value;
    }
    private async Task<Customer?> Canonical(Guid id, CancellationToken ct)
    {
        var visited = new HashSet<Guid>();
        while (true)
        {
            Require(visited.Add(id) && visited.Count <= 64, "O histórico de unificação precisa de conferência.", 409);
            var customer = await Raw(id, ct);
            if (customer?.MergedIntoId is not Guid target) return customer;
            id = target;
        }
    }
    private static CustomerContact Contact(Customer value) => new(value.Id, value.Name, value.Phone, value.Email, value.Incomplete);
    private async Task<CustomerSourceLink?> SourceLink(string kind, Guid source, Guid? parent, CancellationToken ct)
    {
        var parentId = parent ?? Guid.Empty;
        var value = db.Set<CustomerSourceLink>().Local.SingleOrDefault(x => x.Kind == kind && x.SourceId == source && x.ParentId == parentId)
            ?? await db.Set<CustomerSourceLink>().SingleOrDefaultAsync(x => x.Kind == kind && x.SourceId == source && x.ParentId == parentId, ct);
        if (value is not null && db.Database.CurrentTransaction is not null && db.Entry(value).State == EntityState.Unchanged) await db.Entry(value).ReloadAsync(ct);
        return value;
    }
    private void AddLink(string kind, Guid source, Guid? parent, Guid customer)
    {
        var link = new CustomerSourceLink(kind, source, parent ?? Guid.Empty, customer);
        db.Add(link); db.Add(new CustomerSourceChange(link.Id, null, customer));
    }
    public async Task<CustomerContact?> ResolveAsync(Guid customerId, CancellationToken ct) => await Canonical(customerId, ct) is { } customer ? Contact(customer) : null;
    public async Task<CustomerContact?> GetSourceAsync(string kind, Guid sourceId, Guid? parentId, CancellationToken ct)
    {
        Source(kind, sourceId, parentId);
        var link = await SourceLink(kind, sourceId, parentId, ct);
        return link?.CustomerId is Guid id ? await ResolveAsync(id, ct) : null;
    }
    public async Task<CustomerContact> EnsureSourceAsync(CustomerSourceInput input, CancellationToken ct)
    {
        Source(input.Kind, input.SourceId, input.ParentId);
        await Lock(ct);
        var link = await SourceLink(input.Kind, input.SourceId, input.ParentId, ct);
        if (link is not null)
        {
            Require(link.CustomerId is not null, "Este vínculo foi removido. Confira a identificação antes de associar novamente.", 409);
            var saved = await Canonical(link.CustomerId!.Value, ct) ?? throw new CustomerRuleException("Cliente vinculado não encontrado.", 409);
            if (input.CustomerId is Guid selected)
                Require((await Canonical(selected, ct))?.Id == saved.Id, "Este registro já pertence a outro cliente. Peça à gestão para conferir o vínculo.", 409);
            return Contact(saved);
        }
        Customer? customer = null;
        if (input.CustomerId is Guid id) customer = await Canonical(id, ct) ?? throw new CustomerRuleException("Cliente não encontrado.", 404);
        else if (input.Kind == "users")
            customer = db.Set<Customer>().Local.SingleOrDefault(x => x.UserId == input.SourceId)
                ?? await db.Set<Customer>().SingleOrDefaultAsync(x => x.UserId == input.SourceId, ct);
        customer ??= new Customer(input.Name, input.Phone, input.Email, input.Kind, input.AllowIncomplete);
        Require(customer.Status == "Ativo", "Escolha um cliente ativo para um novo vínculo.");
        if (db.Entry(customer).State == EntityState.Detached) db.Add(customer);
        if (input.Kind == "users")
        {
            Require(customer.UserId is null || customer.UserId == input.SourceId, "Este cliente já possui outra conta de acesso.", 409);
            Require(db.Users.Local.Any(x => x.Id == input.SourceId && x.IsActive) || await db.Users.AnyAsync(x => x.Id == input.SourceId && x.IsActive, ct), "Conta de acesso não encontrada.");
            if (customer.UserId is null) customer.AssignUser(input.SourceId);
        }
        AddLink(input.Kind, input.SourceId, input.ParentId, customer.Id);
        return Contact(customer);
    }
    public async Task<CustomerContact?> SetSourceAsync(string kind, Guid sourceId, Guid? parentId, Guid? customerId, CancellationToken ct)
    {
        Source(kind, sourceId, parentId); await Lock(ct);
        var customer = customerId is Guid id ? await Canonical(id, ct) ?? throw new CustomerRuleException("Cliente não encontrado.", 404) : null;
        if (customer is not null) Require(customer.Status == "Ativo", "Escolha um cliente ativo para um novo vínculo.");
        var link = await SourceLink(kind, sourceId, parentId, ct);
        if (link is null)
        {
            link = new CustomerSourceLink(kind, sourceId, parentId ?? Guid.Empty, customer?.Id);
            db.Add(link); db.Add(new CustomerSourceChange(link.Id, null, customer?.Id));
        }
        else if (link.CustomerId != customer?.Id)
        {
            db.Add(new CustomerSourceChange(link.Id, link.CustomerId, customer?.Id)); link.Replace(customer?.Id);
        }
        return customer is null ? null : Contact(customer);
    }
    private static string? Profile(string kind) => kind switch { "students" => "Aluno", "rentalMembers" => "Mensalista", "barTabs" or "barSales" => "Bar", _ => null };
    private async Task<HashSet<Guid>> Family(Guid id, CancellationToken ct)
    {
        var roots = await db.Set<Customer>().AsNoTracking().Select(x => new { x.Id, x.MergedIntoId }).ToListAsync(ct);
        var ids = new HashSet<Guid> { id };
        for (var i = 0; i < roots.Count; i++) { var added = false; foreach (var row in roots) if (row.MergedIntoId is Guid parent && ids.Contains(parent)) added |= ids.Add(row.Id); if (!added) break; }
        return ids;
    }
    private async Task<CustomerDto> Dto(Customer value, CancellationToken ct)
    {
        var ids = await Family(value.Id, ct);
        var kinds = await db.Set<CustomerSourceLink>().AsNoTracking().Where(x => x.CustomerId != null && ids.Contains(x.CustomerId.Value)).Select(x => x.Kind).Distinct().ToListAsync(ct);
        kinds.AddRange(db.Set<CustomerSourceLink>().Local.Where(x => x.CustomerId != null && ids.Contains(x.CustomerId.Value)).Select(x => x.Kind));
        return new(value.Id, value.Name, value.Phone, value.Email, value.Status, value.Version, value.Origin, value.Incomplete, value.UserId, kinds.Select(Profile).Where(x => x is not null).Select(x => x!).Distinct().Order().ToArray(), value.MergedIntoId);
    }
    public async Task<CustomerDto> Get(Guid id, CancellationToken ct) => await Dto(await Canonical(id, ct) ?? throw new CustomerRuleException("Cliente não encontrado.", 404), ct);
    public async Task<CustomerPage> List(string? search, string? profile, bool? incomplete, string? status, int page, int pageSize, CancellationToken ct)
    {
        Require(page >= 1 && page <= 1_000_000 && pageSize is >= 1 and <= 100, "Confira a página solicitada.");
        Require(string.IsNullOrEmpty(profile) || profile is "Aluno" or "Mensalista" or "Bar", "Perfil de cliente inválido.");
        Require(string.IsNullOrEmpty(status) || status is "Ativo" or "Inativo", "Situação do cliente inválida.");
        var query = db.Set<Customer>().AsNoTracking().Where(x => x.MergedIntoId == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            Require(search.Length <= 240, "Reduza o texto da busca.");
            var pattern = "%" + search.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            var normalizedPhone = Customer.NormalizePhone(search);
            var phoneSearch = normalizedPhone.Length > 0 && normalizedPhone.All(char.IsAsciiDigit) ? normalizedPhone : search.Trim();
            var phonePattern = "%" + phoneSearch.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            var matches = await db.Set<Customer>().AsNoTracking().Where(x => EF.Functions.ILike(x.Name, pattern) || EF.Functions.ILike(x.Phone, phonePattern) || x.Email != null && EF.Functions.ILike(x.Email, pattern)).Select(x => x.Id).ToArrayAsync(ct);
            var aliases = await db.Set<Customer>().AsNoTracking().Select(x => new { x.Id, x.MergedIntoId }).ToDictionaryAsync(x => x.Id, ct);
            var canonicalIds = new HashSet<Guid>();
            foreach (var match in matches)
            {
                var id = match; var visited = new HashSet<Guid>();
                while (aliases.TryGetValue(id, out var row) && row.MergedIntoId is Guid next && visited.Add(id)) id = next;
                canonicalIds.Add(id);
            }
            query = query.Where(x => canonicalIds.Contains(x.Id));
        }
        if (incomplete is not null) query = query.Where(x => x.Incomplete == incomplete);
        if (!string.IsNullOrEmpty(status)) query = query.Where(x => x.Status == status);
        if (!string.IsNullOrEmpty(profile))
        {
            var all = await db.Set<Customer>().AsNoTracking().Select(x => new { x.Id, x.MergedIntoId }).ToDictionaryAsync(x => x.Id, ct);
            var links = await db.Set<CustomerSourceLink>().AsNoTracking().Where(x => x.CustomerId != null).Select(x => new { x.CustomerId, x.Kind }).ToListAsync(ct);
            var ids = new HashSet<Guid>();
            foreach (var link in links.Where(x => Profile(x.Kind) == profile))
            {
                var id = link.CustomerId!.Value; var seen = new HashSet<Guid>();
                while (all.TryGetValue(id, out var row) && row.MergedIntoId is Guid next && seen.Add(id)) id = next;
                ids.Add(id);
            }
            query = query.Where(x => ids.Contains(x.Id));
        }
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        var items = new List<CustomerDto>(); foreach (var row in rows) items.Add(await Dto(row, ct));
        return new(items, total, page, pageSize);
    }
    public async Task<IReadOnlyList<CustomerLookup>> Lookup(string? search, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(search) || search.Trim().Length < 2) return [];
        var rows = await List(search, null, null, "Ativo", 1, 20, ct);
        return rows.Items.Select(x => new CustomerLookup(x.Id, x.Name, x.Phone.Length >= 4 ? "•••• " + x.Phone[^4..] : "Não informado", x.Incomplete)).ToArray();
    }
    public async Task<IReadOnlyList<CustomerLinkDto>> Links(Guid id, CancellationToken ct)
    {
        var customer = await Canonical(id, ct) ?? throw new CustomerRuleException("Cliente não encontrado.", 404); var family = await Family(customer.Id, ct);
        var links = await db.Set<CustomerSourceLink>().AsNoTracking().Where(x => x.CustomerId != null && family.Contains(x.CustomerId.Value)).OrderBy(x => x.Kind).ThenBy(x => x.SourceId).ToArrayAsync(ct);
        var sources = links.Select(x => x.Kind == "rentalMembers" ? x.ParentId : x.SourceId).ToArray();
        var records = await db.OperationalRecords.AsNoTracking().Where(x => sources.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        return links.Select(x => new CustomerLinkDto(x.Kind, x.SourceId, x.ParentId == Guid.Empty ? null : x.ParentId,
            records.GetValueOrDefault(x.Kind == "rentalMembers" ? x.ParentId : x.SourceId)?.Name ?? customer.Name)).ToArray();
    }
}
