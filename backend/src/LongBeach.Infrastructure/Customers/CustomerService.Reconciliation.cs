using System.Text.Json.Nodes;
using LongBeach.Application.Customers;
using LongBeach.Contracts.Customers;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Customers;

public sealed partial class CustomerService
{
    private sealed record SourceReference(string Kind, Guid Id, Guid? Parent = null);
    private sealed record BackfillSource(CustomerSourceInput Input, SourceReference? Reference = null, string? Conflict = null);
    private async Task<List<BackfillSource>> BackfillSources(CancellationToken ct)
    {
        var result = new List<BackfillSource>();
        var records = await db.OperationalRecords.AsNoTracking().Where(x => x.Kind == "students" || x.Kind == "rentalGroups" || x.Kind == "rentalBarLinks").OrderBy(x => x.Id).ToArrayAsync(ct);
        static string Read(JsonObject value, string key) => value[key]?.ToString() ?? "";
        static Guid Id(JsonObject value, string key) => Guid.TryParse(Read(value, key), out var id) ? id : Guid.Empty;
        foreach (var row in records.Where(x => x.Kind != "rentalBarLinks"))
        {
            var body = JsonNode.Parse(row.Payload) as JsonObject ?? [];
            if (row.Kind == "students")
                result.Add(new(new("students", row.Id, null, Read(body, "name"), Read(body, "phone"), AllowIncomplete: true)));
            else if (body["members"] is JsonArray members)
                foreach (var member in members)
                {
                    var person = member as JsonObject ?? [];
                    result.Add(new(new("rentalMembers", Id(person, "id"), row.Id, Read(person, "name"), Read(person, "phone"), AllowIncomplete: true)));
                }
        }
        var responsible = await db.Set<BillingAccount>().AsNoTracking().Where(x => x.Kind == "Bar").Select(x => new { x.SourceId, x.UserId }).ToArrayAsync(ct);
        var responsibleIds = responsible.Select(x => x.UserId).ToArray();
        var students = await db.UserRoles.Where(x => x.Role.Name == SystemRoles.Student).Select(x => x.UserId).ToArrayAsync(ct);
        var users = await db.Users.AsNoTracking().Where(x => x.IsActive && (responsibleIds.Contains(x.Id) || students.Contains(x.Id) && x.GoogleSubject != null)).OrderBy(x => x.Id).ToArrayAsync(ct);
        foreach (var user in users)
            result.Add(new(new("users", user.Id, null, user.Name, "", user.GoogleSubject is null ? null : user.Email, AllowIncomplete: true)));
        var validUsers = users.Select(x => x.Id).ToHashSet();
        var rentalLinks = records.Where(x => x.Kind == "rentalBarLinks").Select(x => JsonNode.Parse(x.Payload) as JsonObject ?? [])
            .Where(x => Id(x, "rentalGroupId") != Guid.Empty && Id(x, "tabId") != Guid.Empty && Id(x, "memberId") != Guid.Empty).ToArray();
        var tabs = await db.Set<BarTab>().AsNoTracking().Select(x => new { x.Id, x.CustomerId }).OrderBy(x => x.Id).ToArrayAsync(ct);
        foreach (var tab in tabs)
        {
            if (tab.CustomerId is Guid explicitCustomer)
            { result.Add(new(new("barTabs", tab.Id, null, "", "", CustomerId: explicitCustomer, AllowIncomplete: true))); continue; }
            var members = rentalLinks.Where(x => Id(x, "tabId") == tab.Id).DistinctBy(x => (Id(x, "rentalGroupId"), Id(x, "memberId"))).ToArray();
            if (members.Length > 0)
            {
                // The explicitly identified consumer takes priority over a third-party payer.
                // Missing/removed member identity becomes a preview conflict; never infer the payer instead.
                var member = members[0];
                result.Add(new(new("barTabs", tab.Id, null, "", "", AllowIncomplete: true), new("rentalMembers", Id(member, "memberId"), Id(member, "rentalGroupId")), members.Length > 1 ? "A comanda possui mais de um integrante de origem. Confira os vínculos antes de reconciliar." : null));
                continue;
            }
            var account = responsible.SingleOrDefault(x => x.SourceId == tab.Id);
            if (account is not null && validUsers.Contains(account.UserId))
                result.Add(new(new("barTabs", tab.Id, null, "", "", AllowIncomplete: true), new("users", account.UserId)));
        }
        var sales = await db.Set<BarSale>().AsNoTracking().Select(x => new { x.Id, x.CustomerId }).OrderBy(x => x.Id).ToArrayAsync(ct);
        foreach (var sale in sales)
        {
            if (sale.CustomerId is Guid explicitCustomer)
            { result.Add(new(new("barSales", sale.Id, null, "", "", CustomerId: explicitCustomer, AllowIncomplete: true))); continue; }
            var account = responsible.SingleOrDefault(x => x.SourceId == sale.Id);
            if (account is not null && validUsers.Contains(account.UserId))
                result.Add(new(new("barSales", sale.Id, null, "", "", AllowIncomplete: true), new("users", account.UserId)));
        }
        return result.DistinctBy(x => (x.Input.Kind, x.Input.SourceId, x.Input.ParentId)).OrderBy(x => x.Input.Kind).ThenBy(x => x.Input.SourceId).ThenBy(x => x.Input.ParentId).ToList();
    }
    private async Task<CustomerBackfillPreview> BackfillPlan(List<BackfillSource> sources, CancellationToken ct)
    {
        var links = await db.Set<CustomerSourceLink>().AsNoTracking().OrderBy(x => x.Id).Select(x => new { x.Id, x.Kind, x.SourceId, x.ParentId, x.CustomerId, x.Version }).ToArrayAsync(ct);
        var customers = await db.Set<Customer>().AsNoTracking().OrderBy(x => x.Id).Select(x => new { x.Id, x.UserId, x.Version, x.MergedIntoId, x.Status }).ToArrayAsync(ct);
        var missing = sources.Where(s => !links.Any(l => l.Kind == s.Input.Kind && l.SourceId == s.Input.SourceId && l.ParentId == (s.Input.ParentId ?? Guid.Empty))).ToArray();
        var conflicts = new List<CustomerBackfillConflict>();
        foreach (var source in missing)
        {
            try
            {
                Require(source.Conflict is null, source.Conflict ?? "Conflito na origem.");
                Source(source.Input.Kind, source.Input.SourceId, source.Input.ParentId);
                if (source.Reference is { } reference)
                {
                    var saved = links.SingleOrDefault(x => x.Kind == reference.Kind && x.SourceId == reference.Id && x.ParentId == (reference.Parent ?? Guid.Empty));
                    Require(saved is not null ? saved.CustomerId is not null : sources.Any(x => x.Input.Kind == reference.Kind && x.Input.SourceId == reference.Id && x.Input.ParentId == reference.Parent),
                        "A identificação da pessoa de origem está ausente ou foi removida. Confira o vínculo antes de reconciliar.");
                }
                else if (source.Input.CustomerId is Guid selected)
                {
                    var visited = new HashSet<Guid>();
                    while (true)
                    {
                        var customer = customers.SingleOrDefault(x => x.Id == selected);
                        Require(customer is not null && visited.Add(selected), "Confira o cliente explicitamente identificado na origem.");
                        if (customer!.MergedIntoId is Guid next) { selected = next; continue; }
                        Require(customer.Status == "Ativo", "Confira o cliente inativo identificado na origem antes de criar o vínculo."); break;
                    }
                }
                else _ = new Customer(source.Input.Name, source.Input.Phone, source.Input.Email, source.Input.Kind, true);
            }
            catch (CustomerRuleException error) { conflicts.Add(new(source.Input.Kind, source.Input.SourceId, source.Input.ParentId, error.Message)); }
        }
        var people = missing.Where(x => x.Reference is null && x.Input.CustomerId is null && (x.Input.Kind != "users" || !customers.Any(c => c.UserId == x.Input.SourceId))).ToArray();
        return new(Fingerprint(new { sources, links, customers }), sources.Count, people.Length, sources.Count - missing.Length,
            people.Count(x => !Customer.ValidPhone(Customer.NormalizePhone(x.Input.Phone))), sources.GroupBy(x => x.Input.Kind).ToDictionary(x => x.Key, x => x.Count()), conflicts);
    }
    public async Task<CustomerBackfillPreview> PreviewBackfill(CancellationToken ct) => await BackfillPlan(await BackfillSources(ct), ct);
    public Task<CustomerBackfillResult> ApplyBackfill(CustomerBackfillInput input, Guid actor, CancellationToken ct) => Write(async () =>
    {
        var hash = Fingerprint(new { input, actor });
        if (await Replay<CustomerBackfillResult>(input.OperationId, "backfill", hash, ct) is { } previous) return previous;
        var sources = await BackfillSources(ct); var preview = await BackfillPlan(sources, ct);
        Require(input.PreviewToken == preview.PreviewToken, "As origens mudaram. Confira novamente a reconciliação.", 409);
        Require(preview.Conflicts.Count == 0, "Regularize os contatos de origem indicados na conferência antes de reconciliar.", 409);
        var created = 0; var linked = 0;
        // People precede source references. No name/phone matching and no guardian/student inference.
        foreach (var source in sources.OrderBy(x => x.Input.Kind == "users" ? 0 : x.Reference is null ? 1 : 2))
        {
            if (await SourceLink(source.Input.Kind, source.Input.SourceId, source.Input.ParentId, ct) is not null) continue;
            var before = db.Set<Customer>().Local.Count(x => db.Entry(x).State == EntityState.Added);
            var selected = source.Reference is { } reference ? (await GetSourceAsync(reference.Kind, reference.Id, reference.Parent, ct))?.Id : source.Input.CustomerId;
            Require(source.Reference is null || selected is not null, "O vínculo de origem mudou. Confira novamente antes de reconciliar.", 409);
            await EnsureSourceAsync(source.Input with { CustomerId = selected }, ct);
            created += db.Set<Customer>().Local.Count(x => db.Entry(x).State == EntityState.Added) - before; linked++;
        }
        return Remember(input.OperationId, "backfill", hash, new CustomerBackfillResult(sources.Count, created, linked));
    }, ct);
}
