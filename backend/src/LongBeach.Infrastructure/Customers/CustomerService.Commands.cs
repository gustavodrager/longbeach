using System.Globalization;
using System.Text;
using System.Text.Json;
using LongBeach.Contracts.Customers;
using LongBeach.Domain.Customers;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Customers;

public sealed partial class CustomerService
{
    private async Task<T?> Replay<T>(Guid operation, string kind, string fingerprint, CancellationToken ct) where T : class
    {
        Require(operation != Guid.Empty, "Informe o identificador da operação.");
        var row = db.Set<CustomerOperation>().Local.SingleOrDefault(x => x.Id == operation) ?? await db.Set<CustomerOperation>().SingleOrDefaultAsync(x => x.Id == operation, ct);
        if (row is null) return null;
        Require(row.Kind == kind && row.Fingerprint == fingerprint, "Esta operação já foi usada com outros dados.", 409);
        return JsonSerializer.Deserialize<T>(row.ResponseJson, Json)!;
    }
    private T Remember<T>(Guid operation, string kind, string fingerprint, T result)
    { var receipt = new CustomerOperation(operation, kind, fingerprint, JsonSerializer.Serialize(result, Json)); receipt.MarkCreated(time.GetUtcNow()); db.Add(receipt); return result; }
    private static void Version(Customer customer, int expected) => Require(customer.Version == expected, "Este cliente mudou. Atualize os dados antes de salvar.", 409);
    public Task<CustomerDto> Create(CreateCustomerInput input, Guid actor, string origin, CancellationToken ct) => Write(async () =>
    {
        var hash = Fingerprint(new { input, actor, origin });
        if (await Replay<CustomerDto>(input.OperationId, "create", hash, ct) is { } previous) return await Get(previous.Id, ct);
        var customer = new Customer(input.Name, input.Phone, input.Email, origin); db.Add(customer);
        return Remember(input.OperationId, "create", hash, await Dto(customer, ct));
    }, ct);
    public Task<CustomerDto> Update(Guid id, UpdateCustomerInput input, CancellationToken ct) => Write(async () =>
    {
        var customer = await Canonical(id, ct) ?? throw new CustomerRuleException("Cliente não encontrado.", 404);
        Version(customer, input.ExpectedVersion);
        customer.Change(input.Name, input.Phone, input.Email, input.Status);
        return await Dto(customer, ct);
    }, ct);
    public async Task<CustomerDto?> Self(Guid userId, CancellationToken ct)
    {
        var customer = await db.Set<Customer>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId, ct);
        return customer is null ? null : await Get(customer.Id, ct);
    }
    public Task<CustomerDto> SaveSelf(Guid userId, SelfCustomerInput input, CancellationToken ct) => Write(async () =>
    {
        var hash = Fingerprint(new { userId, input });
        Require(await db.Users.AnyAsync(x => x.Id == userId && x.IsActive, ct), "Conta de acesso não encontrada.", 404);
        if (await Replay<CustomerDto>(input.OperationId, "self", hash, ct) is { } previous)
        {
            var assigned = await db.Set<Customer>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId, ct);
            var canonical = await Canonical(previous.Id, ct);
            Require(assigned is not null && canonical?.Id == assigned.Id, "Seu vínculo cadastral mudou. Atualize o perfil antes de continuar.", 409);
            return await Dto(canonical!, ct);
        }
        var current = await db.Set<Customer>().SingleOrDefaultAsync(x => x.UserId == userId, ct);
        Customer customer;
        if (current is null)
        {
            Require(input.ExpectedVersion is null or 0, "O cadastro do cliente mudou. Atualize seu perfil.", 409);
            var contact = await EnsureSourceAsync(new("users", userId, null, input.Name, input.Phone, input.Email), ct);
            customer = (await Canonical(contact.Id, ct))!;
        }
        else
        {
            customer = (await Canonical(current.Id, ct))!;
            Require(input.ExpectedVersion is not null, "Confira a versão do cadastro antes de salvar.", 409);
            Version(customer, input.ExpectedVersion!.Value);
            customer.Change(input.Name, input.Phone, input.Email ?? customer.Email, customer.Status);
        }
        return Remember(input.OperationId, "self", hash, await Dto(customer, ct));
    }, ct);
    public Task<CustomerDto> AssignUser(Guid id, CustomerUserInput input, CancellationToken ct) => Write(async () =>
    {
        var customer = await Canonical(id, ct) ?? throw new CustomerRuleException("Cliente não encontrado.", 404);
        Version(customer, input.ExpectedVersion);
        if (input.UserId is Guid user)
        {
            Require(customer.Status == "Ativo", "Ative o cliente antes de associar a conta.");
            Require(user != Guid.Empty && await db.Users.AnyAsync(x => x.Id == user && x.IsActive, ct), "Escolha uma conta de acesso ativa.");
            var assigned = await db.Set<Customer>().SingleOrDefaultAsync(x => x.UserId == user, ct);
            Require(assigned is null || assigned.Id == customer.Id, "Esta conta já pertence a outro cliente. Confira a unificação administrativa.", 409);
            var source = await SourceLink("users", user, null, ct);
            Require(source?.CustomerId is null || (await Canonical(source.CustomerId.Value, ct))?.Id == customer.Id, "A conta possui outro vínculo de cliente. Confira antes de associar.", 409);
        }
        if (customer.UserId is Guid old && old != input.UserId) await SetSourceAsync("users", old, null, null, ct);
        if (input.UserId is Guid next) await SetSourceAsync("users", next, null, customer.Id, ct);
        if (customer.UserId != input.UserId) customer.AssignUser(input.UserId);
        return await Dto(customer, ct);
    }, ct);
    public async Task<IReadOnlyList<CustomerUserCandidate>> UserCandidates(Guid id, string? search, CancellationToken ct)
    {
        var customer = await Canonical(id, ct) ?? throw new CustomerRuleException("Cliente não encontrado.", 404);
        if (string.IsNullOrWhiteSpace(search) || search.Trim().Length < 2) return [];
        Require(search.Length <= 240, "Reduza o texto da busca.");
        var pattern = "%" + search.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
        var assigned = db.Set<Customer>().Where(x => x.Id != customer.Id && x.UserId != null).Select(x => x.UserId);
        var users = await db.Users.AsNoTracking().Where(x => x.IsActive && x.GoogleSubject != null && !assigned.Contains(x.Id)
            && (EF.Functions.ILike(x.Name, pattern) || EF.Functions.ILike(x.Email, pattern)))
            .OrderBy(x => x.Name).ThenBy(x => x.Id).Take(20).ToArrayAsync(ct);
        return users.Select(x => new CustomerUserCandidate(x.Id, x.Name, x.Email.Contains('@') ? x.Email[..1] + "•••@" + x.Email.Split('@')[1] : "Não informado")).ToArray();
    }
    private static string NormalName(string value) => string.Join(' ', value.Normalize(NormalizationForm.FormD).Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark).ToArray().AsSpan().ToString().ToUpperInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    public async Task<IReadOnlyList<CustomerDuplicate>> Duplicates(CancellationToken ct)
    {
        var customers = await db.Set<Customer>().AsNoTracking().Where(x => x.MergedIntoId == null).OrderBy(x => x.Name).ThenBy(x => x.Id).ToArrayAsync(ct);
        var result = new List<CustomerDuplicate>();
        for (var first = 0; first < customers.Length && result.Count < 50; first++)
        for (var second = first + 1; second < customers.Length && result.Count < 50; second++)
        {
            var a = customers[first]; var b = customers[second]; var reasons = new List<string>();
            if (NormalName(a.Name) == NormalName(b.Name)) reasons.Add("Nome semelhante");
            if (Customer.ValidPhone(a.Phone) && a.Phone == b.Phone) reasons.Add("Telefone compartilhado");
            if (a.Email is not null && string.Equals(a.Email, b.Email, StringComparison.OrdinalIgnoreCase)) reasons.Add("E-mail de contato compartilhado");
            if (reasons.Count > 0) result.Add(new(await Dto(a, ct), await Dto(b, ct), reasons));
        }
        return result;
    }
    public async Task<IReadOnlyList<CustomerMergeHistory>> Merges(Guid customerId, CancellationToken ct)
    {
        var canonical = await Canonical(customerId, ct) ?? throw new CustomerRuleException("Cliente não encontrado.", 404);
        var ids = await Family(canonical.Id, ct);
        var rows = await db.Set<CustomerMerge>().AsNoTracking().Where(x => ids.Contains(x.SourceId) || ids.Contains(x.TargetId))
            .OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Take(100).ToArrayAsync(ct);
        var result = new List<CustomerMergeHistory>();
        foreach (var merge in rows)
        {
            var source = (await Raw(merge.SourceId, ct))!; var target = (await Raw(merge.TargetId, ct))!;
            result.Add(new(merge.Id, merge.TargetId, merge.SourceId, source.Version, target.Version, merge.Undone, source.Name, target.Name));
        }
        return result;
    }
    public async Task<CustomerMergePreview> PreviewMerge(CustomerMergePreviewInput input, CancellationToken ct)
    {
        var source = await Raw(input.SourceId, ct) ?? throw new CustomerRuleException("Cliente de origem não encontrado.", 404);
        var target = await Raw(input.TargetId, ct) ?? throw new CustomerRuleException("Cliente de destino não encontrado.", 404);
        var warnings = new List<string>();
        var allowed = source.Id != target.Id && source.MergedIntoId is null && target.MergedIntoId is null && target.Status == "Ativo";
        if (!allowed) warnings.Add("Escolha dois cadastros canônicos diferentes e um destino ativo.");
        if (source.UserId is not null && target.UserId is not null && source.UserId != target.UserId) { allowed = false; warnings.Add("Contas de acesso distintas impedem esta unificação."); }
        if (source.Name != target.Name || source.Phone != target.Phone || source.Email != target.Email) warnings.Add("Os contatos diferem. Os dados do destino serão preservados; os de origem continuam no histórico.");
        var sourceIds = await Family(source.Id, ct); var targetIds = await Family(target.Id, ct);
        var links = await db.Set<CustomerSourceLink>().AsNoTracking().Where(x => x.CustomerId != null && (sourceIds.Contains(x.CustomerId.Value) || targetIds.Contains(x.CustomerId.Value)))
            .OrderBy(x => x.Id).Select(x => new { x.Id, x.CustomerId, x.Version }).ToArrayAsync(ct);
        if (links.Any(x => sourceIds.Contains(x.CustomerId!.Value)) && links.Any(x => targetIds.Contains(x.CustomerId!.Value))
            && await db.Set<CustomerSourceLink>().AnyAsync(x => x.Kind == "students" && x.CustomerId != null && sourceIds.Contains(x.CustomerId.Value), ct)
            && await db.Set<CustomerSourceLink>().AnyAsync(x => x.Kind == "students" && x.CustomerId != null && targetIds.Contains(x.CustomerId.Value), ct))
            warnings.Add("Ambos possuem fichas de aluno. A unificação preserva matrículas e presenças históricas; confira possíveis duplicidades na escola.");
        var token = Fingerprint(new { source.Id, SourceVersion = source.Version, SourceUser = source.UserId, SourceAlias = source.MergedIntoId, Target = target.Id, TargetVersion = target.Version, TargetUser = target.UserId, TargetAlias = target.MergedIntoId, links });
        return new(source.Id, target.Id, source.Version, target.Version, token, allowed, warnings, links.Count(x => sourceIds.Contains(x.CustomerId!.Value)), links.Count(x => targetIds.Contains(x.CustomerId!.Value)));
    }
    public Task<CustomerMergeResult> Merge(CustomerMergeInput input, Guid actor, CancellationToken ct) => Write(async () =>
    {
        var hash = Fingerprint(new { input, actor });
        if (await Replay<CustomerMergeResult>(input.OperationId, "merge", hash, ct) is { } previous) return previous;
        var preview = await PreviewMerge(new(input.SourceId, input.TargetId), ct);
        Require(preview.CanMerge && preview.PreviewToken == input.PreviewToken && preview.SourceVersion == input.SourceVersion && preview.TargetVersion == input.TargetVersion,
            "A conferência da unificação mudou ou está bloqueada. Confira novamente.", 409);
        var source = (await Raw(input.SourceId, ct))!; var target = (await Raw(input.TargetId, ct))!;
        var transferred = source.UserId is not null && target.UserId is null ? source.UserId : null;
        var merge = new CustomerMerge(source.Id, target.Id, transferred, Customer.Text(input.Reason, 500, "Motivo da unificação"));
        if (transferred is not null)
        {
            source.AssignUser(null);
            // Free the unique user association before assigning it to the target.
            // Both saves remain inside this command's single transaction.
            await db.SaveChangesAsync(ct);
            target.AssignUser(transferred);
        }
        source.MergeInto(target.Id); db.Add(merge);
        return Remember(input.OperationId, "merge", hash, new CustomerMergeResult(merge.Id, target.Id, source.Id, source.Version, target.Version, false));
    }, ct);
    public Task<CustomerMergeResult> Undo(Guid mergeId, CustomerUndoInput input, Guid actor, CancellationToken ct) => Write(async () =>
    {
        var hash = Fingerprint(new { mergeId, input, actor });
        if (await Replay<CustomerMergeResult>(input.OperationId, "undo", hash, ct) is { } previous) return previous;
        var merge = await db.Set<CustomerMerge>().SingleOrDefaultAsync(x => x.Id == mergeId, ct) ?? throw new CustomerRuleException("Unificação não encontrada.", 404);
        Require(!merge.Undone, "Esta unificação já foi desfeita.", 409);
        var source = (await Raw(merge.SourceId, ct))!; var target = (await Raw(merge.TargetId, ct))!;
        Version(source, input.SourceVersion); Version(target, input.TargetVersion);
        Require(source.MergedIntoId == target.Id && target.MergedIntoId is null, "Os vínculos mudaram. Revise a sequência de unificações antes de desfazer.", 409);
        if (merge.TransferredUserId is Guid user)
        {
            Require(source.UserId is null && target.UserId == user, "A associação de acesso mudou. Peça à gestão para conferir o retorno.", 409);
            target.AssignUser(null); await db.SaveChangesAsync(ct); source.AssignUser(user);
        }
        source.UndoMerge(target.Id);
        if (merge.TransferredUserId is Guid restoredUser)
        {
            var sourceLink = await SourceLink("users", restoredUser, null, ct);
            if (sourceLink is null) AddLink("users", restoredUser, null, source.Id);
            else if (sourceLink.CustomerId != source.Id)
            {
                db.Add(new CustomerSourceChange(sourceLink.Id, sourceLink.CustomerId, source.Id));
                sourceLink.Replace(source.Id);
            }
        }
        merge.Undo();
        return Remember(input.OperationId, "undo", hash, new CustomerMergeResult(merge.Id, target.Id, source.Id, source.Version, target.Version, true));
    }, ct);
}
