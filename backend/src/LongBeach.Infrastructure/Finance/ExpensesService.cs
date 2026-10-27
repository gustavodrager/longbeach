using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Auditing;
using LongBeach.Domain.Operations;
using LongBeach.Domain.Purchases;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Finance;

public sealed class ExpensesService(LongBeachDbContext db, IAuditContext audit, TimeProvider clock) : IExpenses
{
    private sealed record PaymentRecord(Guid ExpenseId, decimal Amount, DateOnly PaidDate, string PaymentMethod,
        string? AccountReference, Guid ActorId, string Fingerprint);
    private sealed record CancellationRecord(Guid ExpenseId, string Reason, Guid ActorId, string Fingerprint);
    private static string Serialize<T>(T value) => JsonSerializer.Serialize(value, ExpenseRules.Json);
    private static string Hash<T>(T value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Serialize(value))));
    private static JsonObject Body(OperationalRecord row) => JsonNode.Parse(row.Payload)!.AsObject();
    private static JsonElement Element(OperationalRecord row) => JsonSerializer.SerializeToElement(Body(row));
    private static string Text(JsonObject row, string key) => row[key]?.ToString() ?? "";
    private static int Version(JsonObject row) => row["version"]?.GetValue<int>() ?? 0;
    private static ExpenseMetadata? Metadata(JsonObject row) => row["expense"]?.Deserialize<ExpenseMetadata>(ExpenseRules.Json);
    private static bool Payable(OperationalRecord row) => row.Kind == "financeEntries" && Text(Body(row), "direction") == "Pagar";
    private Guid Actor => audit.UserId ?? throw new ExpenseRuleException("A sessão precisa identificar quem registrou a operação.");
    private Task Lock(CancellationToken ct) => db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
    private async Task<OperationalRecord> Find(Guid id, CancellationToken ct)
    {
        var row = await db.OperationalRecords.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (row is null || !Payable(row)) throw new ExpenseRuleException("Despesa não encontrada.");
        return row;
    }
    private static ExpenseRow Row(OperationalRecord row)
    {
        var body = Body(row); var metadata = Metadata(body); var amount = body["amount"]!.GetValue<decimal>();
        var legacyState = Text(body, "status");
        var paid = metadata?.PaidAmount ?? (legacyState == "Pago" ? amount : 0m);
        var remaining = ExpenseRules.Remaining(amount, paid, legacyState);
        var due = DateOnly.ParseExact(Text(body, "dueDate"), "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var status = legacyState == "Cancelado" ? "Canceled" : remaining == 0m ? "Paid" : paid > 0m ? "Partial" : "Pending";
        return new(row.Id, row.Name, metadata?.Kind ?? "Expense", metadata?.Category ?? "General",
            metadata?.Beneficiary ?? Text(body, "name"), metadata is null ? due : metadata.DueDate,
            metadata?.ExpenseDate ?? due, amount, paid, remaining, status, metadata?.PaidBy ?? (legacyState == "Pago" ? "Company" : "Pending"),
            metadata?.PartnerId, metadata?.PartnerName, metadata?.TeamMemberId, metadata?.Reference,
            Text(body, "origin"), metadata is not null, metadata?.PurchaseId, Version(body), metadata?.TeamBasis,
            metadata?.ReferenceMonth, metadata?.WorkDate, metadata?.Shift, Text(body, "allocationScope") is { Length: > 0 } scope ? scope : null,
            Text(body, "businessUnitId") is { Length: > 0 } unit ? unit : null);
    }
    public async Task<ExpensePage> List(string? filter, string? state, string? search, int page, int pageSize, CancellationToken ct)
    {
        filter ??= "All"; state ??= "Open";
        if (filter is not ("All" or "Expenses" or "Team" or "Partners") || state is not ("Open" or "Completed" or "All") || page < 1 || pageSize is < 1 or > 100 || search?.Length > 240)
            throw new ExpenseRuleException("Confira os filtros e a página de despesas.");
        var records = await db.OperationalRecords.AsNoTracking().Where(x => x.Kind == "financeEntries" && EF.Functions.JsonContains(x.Payload, "{\"direction\":\"Pagar\"}")).ToListAsync(ct);
        var rows = records.Where(Payable).Select(Row).ToArray(); var today = ExpenseRules.Today(clock);
        var owing = rows.Where(x => x.RemainingAmount > 0m).ToArray();
        var summary = new ExpenseSummary(owing.Sum(x => x.RemainingAmount), owing.Where(x => x.DueDate < today).Sum(x => x.RemainingAmount),
            owing.Where(x => x.PaidBy == "Partner").Sum(x => x.RemainingAmount), owing.Length);
        var query = rows.Where(x => filter switch { "Expenses" => x.Kind == "Expense" && x.PaidBy != "Partner", "Team" => x.Kind == "Team", "Partners" => x.PaidBy == "Partner", _ => true })
            .Where(x => state == "All" || (state == "Open" ? x.RemainingAmount > 0m : x.RemainingAmount == 0m));
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(x => new[] { x.Description, x.Beneficiary, x.PartnerName, x.Reference }.Any(value => value?.Contains(search.Trim(), StringComparison.OrdinalIgnoreCase) == true));
        var filtered = query.OrderBy(x => x.RemainingAmount == 0m).ThenBy(x => x.DueDate ?? DateOnly.MaxValue).ThenByDescending(x => x.ExpenseDate).ThenBy(x => x.Id).ToArray();
        var total = filtered.Length; page = Math.Min(page, Math.Max(1, (total + pageSize - 1) / pageSize));
        return new(filtered.Skip((page - 1) * pageSize).Take(pageSize).ToArray(), summary, page, pageSize, total, today);
    }
    public async Task<ExpenseDetail> Detail(Guid id, CancellationToken ct)
    {
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var detail = await ToDetail(await Find(id, ct), ct);
        await snapshot.CommitAsync(ct); return detail;
    }
    public async Task<ExpensePaidSummary> PaidSummary(DateOnly from, DateOnly through, CancellationToken ct)
    {
        if (from == default || through < from || through.DayNumber - from.DayNumber > 3660)
            throw new ExpenseRuleException("Escolha um período válido de até dez anos para consultar despesas pagas.");
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var journal = await db.OperationalRecords.AsNoTracking().Where(x => x.Kind == ExpenseRules.PaymentKind).Select(x => x.Payload).ToListAsync(ct);
        var payments = journal.Select(x => JsonSerializer.Deserialize<PaymentRecord>(x, ExpenseRules.Json)!).Where(x => x.PaidDate >= from && x.PaidDate <= through).ToArray();
        var candidates = await db.OperationalRecords.AsNoTracking().Where(x => x.Kind == "financeEntries" && EF.Functions.JsonContains(x.Payload, "{\"direction\":\"Pagar\",\"status\":\"Pago\"}")).ToListAsync(ct);
        var legacy = candidates.Select(Body).Where(body => Metadata(body) is null && DateOnly.TryParseExact(Text(body, "paidDate"), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) && day >= from && day <= through).ToArray();
        var result = new ExpensePaidSummary(payments.Sum(x => x.Amount) + legacy.Sum(body => body["amount"]!.GetValue<decimal>()), payments.Length + legacy.Length);
        await snapshot.CommitAsync(ct); return result;
    }
    private async Task<ExpenseDetail> ToDetail(OperationalRecord row, CancellationToken ct)
    {
        var expenseKey = row.Id.ToString();
        var payments = await db.OperationalRecords.AsNoTracking().Where(x => x.Kind == ExpenseRules.PaymentKind && x.Name == expenseKey).ToListAsync(ct);
        var history = payments.Select(x => (Record: x, Data: JsonSerializer.Deserialize<PaymentRecord>(x.Payload, ExpenseRules.Json)!))
            .Where(x => x.Data.ExpenseId == row.Id).OrderBy(x => x.Data.PaidDate).ThenBy(x => x.Record.CreatedAtUtc)
            .Select(x => new ExpensePayment(x.Record.Id, x.Data.Amount, x.Data.PaidDate, x.Data.PaymentMethod, x.Data.AccountReference, x.Record.CreatedAtUtc)).ToArray();
        var body = Body(row);
        return new(Row(row), history, Text(body, "notes") is { Length: > 0 } notes ? notes : null,
            Text(body, "documentReference") is { Length: > 0 } document ? document : null,
            Text(body, "expenseCancellationReason") is { Length: > 0 } reason ? reason : null);
    }
    public async Task<ExpenseOptions> Options(CancellationToken ct)
    {
        var rows = await db.OperationalRecords.AsNoTracking().Where(x => x.Kind == ExpenseRules.PartnerKind || x.Kind == "team").OrderBy(x => x.Name).ToListAsync(ct);
        var partners = rows.Where(x => x.Kind == ExpenseRules.PartnerKind).Select(x => new ExpensePartner(x.Id, x.Name)).ToArray();
        var team = rows.Where(x => x.Kind == "team").Select(x =>
        {
            var body = Body(x);
            return new ExpenseTeamOption(x.Id, x.Name, body["payAmount"]?.GetValue<decimal?>(), Text(body, "payBasis"), Text(body, "paymentFrequency"), Text(body, "paymentDay"));
        }).ToArray();
        return new(partners, team, true);
    }
    public async Task<ExpensePartner> CreatePartner(ExpensePartnerInput input, CancellationToken ct)
    {
        if (input.Id == Guid.Empty) throw new ExpenseRuleException("Informe a chave do sócio.");
        var name = ExpenseRules.Required(input.Name, 160, "o nome do sócio");
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(ct);
        var existing = await db.OperationalRecords.SingleOrDefaultAsync(x => x.Id == input.Id, ct);
        if (existing is not null)
        {
            if (existing.Kind != ExpenseRules.PartnerKind || existing.Name != name) throw new ExpenseRuleException("Esta chave já pertence a outro cadastro.", true);
            return new(existing.Id, existing.Name);
        }
        var partners = await db.OperationalRecords.Where(x => x.Kind == ExpenseRules.PartnerKind).ToListAsync(ct);
        var same = partners.SingleOrDefault(x => string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
        if (same is not null) return new(same.Id, same.Name);
        db.Add(new OperationalRecord(input.Id, ExpenseRules.PartnerKind, name, Serialize(new { id = input.Id, name })));
        Audit("ExpensePartnerCreated", input.Id, new { PartnerId = input.Id });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(input.Id, name);
    }
    public async Task<ExpensePurchaseOption> PurchaseOption(Guid id, CancellationToken ct)
    {
        var purchase = await db.Set<Purchase>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new ExpenseRuleException("Compra não encontrada.");
        if (purchase.State == "Canceled") throw new ExpenseRuleException("A compra está cancelada.");
        var supplier = await db.Set<Supplier>().AsNoTracking().SingleAsync(x => x.Id == purchase.SupplierId, ct);
        var existing = await ActivePurchaseExpense(id, ct);
        var date = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(purchase.PurchasedAtUtc ?? purchase.CreatedAtUtc, TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo")).DateTime);
        return new(id, $"Compra · {supplier.Name}", purchase.Total, date, existing?.Id);
    }
    private async Task<OperationalRecord?> ActivePurchaseExpense(Guid id, CancellationToken ct)
    {
        var rows = await db.OperationalRecords.Where(x => x.Kind == "financeEntries").ToListAsync(ct);
        return rows.FirstOrDefault(x => Payable(x) && Text(Body(x), "status") != "Cancelado" &&
            (Metadata(Body(x))?.PurchaseId == id || Text(Body(x), "sourceKind") == "barPurchases" && Text(Body(x), "sourceId") == id.ToString()));
    }
    public async Task<ExpenseDetail> Create(Guid id, ExpenseInput input, CancellationToken ct)
    {
        if (id == Guid.Empty) throw new ExpenseRuleException("Informe a chave da despesa.");
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(ct);
        // Replay is checked against the saved source snapshot before consulting its current state.
        // A lost response can be retried even if the purchase was subsequently canceled or renamed.
        var existing = await db.OperationalRecords.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (existing is not null)
        {
            if (!Payable(existing) || Metadata(Body(existing)) is not { } saved)
                throw new ExpenseRuleException("Esta chave já foi usada em outro registro.", true);
            var replay = input;
            if (input.PurchaseId is not null && input.PurchaseId == saved.PurchaseId)
                replay = input with { Description = existing.Name, Amount = Body(existing)["amount"]!.GetValue<decimal>(), ExpenseDate = saved.ExpenseDate,
                    Kind = "Expense", Origin = "Bar", AllocationScope = "Unit", BusinessUnitId = "bar" };
            if (saved.RequestHash != Hash(ExpenseRules.Normalize(replay, ExpenseRules.Today(clock))))
                throw new ExpenseRuleException("Esta chave já foi usada com outros dados. Abra a despesa existente.", true);
            return await ToDetail(existing, ct);
        }
        if (input.PurchaseId is { } purchaseId)
        {
            var purchase = await PurchaseOption(purchaseId, ct);
            if (purchase.ExpenseId is not null && purchase.ExpenseId != id) throw new ExpenseRuleException("Esta compra já possui um lançamento financeiro. Abra o registro existente.", true);
            input = input with { Description = purchase.Description, Amount = purchase.Amount, ExpenseDate = purchase.ExpenseDate, Kind = "Expense", Origin = "Bar", AllocationScope = "Unit", BusinessUnitId = "bar" };
        }
        input = ExpenseRules.Normalize(input, ExpenseRules.Today(clock));
        var allocationError = BusinessAllocationRules.Validate(input.Origin, input.AllocationScope, input.BusinessUnitId);
        if (allocationError is not null) throw new ExpenseRuleException(allocationError);
        var fingerprint = Hash(input);
        string? partnerName = null;
        if (input.PartnerId is { } partner)
        {
            var registered = await db.OperationalRecords.SingleOrDefaultAsync(x => x.Id == partner && x.Kind == ExpenseRules.PartnerKind, ct)
                ?? throw new ExpenseRuleException("Sócio não encontrado. Cadastre seu nome antes de continuar.");
            partnerName = registered.Name;
        }
        var beneficiary = input.Beneficiary; var reference = input.Reference;
        if (input.Kind == "Team")
        {
            var person = await db.OperationalRecords.SingleOrDefaultAsync(x => x.Id == input.TeamMemberId && x.Kind == "team", ct)
                ?? throw new ExpenseRuleException("Pessoa da equipe não encontrada.");
            beneficiary = person.Name;
            reference = input.TeamBasis == "Monthly" ? input.ReferenceMonth : $"{input.WorkDate:yyyy-MM-dd}{(input.Shift is null ? "" : " · " + input.Shift)}";
            var expenses = await db.OperationalRecords.Where(x => x.Kind == "financeEntries").ToListAsync(ct);
            if (expenses.Where(Payable).Select(x => (Body: Body(x), Data: Metadata(Body(x)))).Any(x => Text(x.Body, "status") != "Cancelado" && x.Data is not null && x.Data.TeamMemberId == input.TeamMemberId && x.Data.TeamBasis == input.TeamBasis &&
                (input.TeamBasis == "Monthly" ? x.Data.ReferenceMonth == input.ReferenceMonth : x.Data.WorkDate == input.WorkDate && string.Equals(x.Data.Shift, input.Shift, StringComparison.OrdinalIgnoreCase))))
                throw new ExpenseRuleException("Já existe um lançamento para esta pessoa e referência. Abra o registro existente.", true);
        }
        var paid = input.PaidBy == "Company" ? input.Amount : 0m;
        var metadata = new ExpenseMetadata(1, input.Kind, input.Category, beneficiary, input.ExpenseDate, input.DueDate, input.PaidBy,
            input.PartnerId, partnerName, input.TeamMemberId, input.TeamBasis, input.ReferenceMonth, input.WorkDate, input.Shift, reference, input.PurchaseId, paid, fingerprint);
        var payload = new JsonObject
        {
            ["id"] = id.ToString(), ["name"] = input.Description, ["direction"] = "Pagar", ["amount"] = input.Amount,
            ["dueDate"] = (input.DueDate ?? input.ExpenseDate).ToString("yyyy-MM-dd"), ["paidDate"] = input.PaidDate?.ToString("yyyy-MM-dd") ?? "",
            ["status"] = paid == input.Amount ? "Pago" : "Pendente", ["origin"] = input.Origin,
            ["sourceKind"] = input.PurchaseId is null ? "" : "barPurchases", ["sourceId"] = input.PurchaseId?.ToString() ?? "",
            ["month"] = input.ReferenceMonth ?? input.ExpenseDate.ToString("yyyy-MM"), ["notes"] = input.Notes,
            ["documentReference"] = input.DocumentReference, ["paymentMethod"] = input.PaymentMethod,
            ["paymentAccountReference"] = input.AccountReference, ["allocationScope"] = input.AllocationScope,
            ["businessUnitId"] = input.BusinessUnitId, ["version"] = 1, ["expense"] = JsonSerializer.SerializeToNode(metadata, ExpenseRules.Json)
        };
        var record = new OperationalRecord(id, "financeEntries", input.Description, payload.ToJsonString()); db.Add(record);
        if (paid > 0m) AddPayment(id, new(Guid.NewGuid(), paid, input.PaidDate!.Value, 0, input.PaymentMethod, input.AccountReference));
        Audit("ExpenseCreated", id, new { input.Amount, input.PaidBy, input.Kind, input.PartnerId, input.TeamMemberId, input.ReferenceMonth, input.WorkDate, input.PurchaseId, input.DueDate, PaidAmount = paid });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return await ToDetail(record, ct);
    }
    public async Task<ExpenseDetail> Pay(Guid id, ExpensePaymentInput input, CancellationToken ct)
    {
        input = ExpenseRules.Normalize(input, ExpenseRules.Today(clock));
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(ct);
        var record = await Find(id, ct); var body = Body(record);
        var fingerprint = PaymentHash(id, input);
        var previous = await db.OperationalRecords.SingleOrDefaultAsync(x => x.Id == input.OperationId, ct);
        if (previous is not null)
        {
            if (previous.Kind != ExpenseRules.PaymentKind || JsonSerializer.Deserialize<PaymentRecord>(previous.Payload, ExpenseRules.Json)!.Fingerprint != fingerprint)
                throw new ExpenseRuleException("Esta chave já foi usada em outra operação.", true);
            return await ToDetail(record, ct);
        }
        if (Version(body) != input.Version) throw new ExpenseRuleException("A despesa mudou. Atualize os dados e confira o saldo antes de pagar.", true);
        var metadata = Metadata(body); var amount = body["amount"]!.GetValue<decimal>(); var state = Text(body, "status");
        var paid = metadata?.PaidAmount ?? (state == "Pago" ? amount : 0m);
        ExpenseRules.PaymentAllowed(amount, paid, input.Amount, state);
        // A legacy payable becomes managed on its first partial payment; future old-client edits are blocked.
        metadata ??= new(1, "Expense", "General", Text(body, "name"), DateOnly.ParseExact(Text(body, "dueDate"), "yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateOnly.ParseExact(Text(body, "dueDate"), "yyyy-MM-dd", CultureInfo.InvariantCulture), "Pending", null, null, null, null, null, null, null,
            null, null, 0m, "legacy");
        var after = paid + input.Amount;
        body["expense"] = JsonSerializer.SerializeToNode(metadata with { PaidAmount = after }, ExpenseRules.Json);
        body["status"] = after == amount ? "Pago" : "Pendente";
        body["paidDate"] = after == amount ? input.PaidDate.ToString("yyyy-MM-dd") : "";
        body["version"] = checked(Version(body) + 1);
        record.Update(record.Name, body.ToJsonString()); AddPayment(id, input);
        Audit("ExpensePaymentRecorded", id, new { input.OperationId, input.Amount, input.PaidDate, BeforePaidAmount = paid, PaidAmount = after, RemainingAmount = amount - after });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return await ToDetail(record, ct);
    }
    public async Task<ExpenseDetail> Cancel(Guid id, ExpenseCancelInput input, CancellationToken ct)
    {
        if (input.OperationId == Guid.Empty || input.Version < 0) throw new ExpenseRuleException("Confira a chave da operação e a versão do lançamento.");
        var reason = ExpenseRules.Required(input.Reason, 500, "o motivo do cancelamento");
        var fingerprint = Hash(new { ExpenseId = id, Reason = reason });
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(ct);
        var record = await Find(id, ct); var body = Body(record);
        var previous = await db.OperationalRecords.SingleOrDefaultAsync(x => x.Id == input.OperationId, ct);
        if (previous is not null)
        {
            if (previous.Kind != "expenseOperations" || JsonSerializer.Deserialize<CancellationRecord>(previous.Payload, ExpenseRules.Json)!.Fingerprint != fingerprint)
                throw new ExpenseRuleException("Esta chave já foi usada em outra operação.", true);
            return await ToDetail(record, ct);
        }
        if (Version(body) != input.Version) throw new ExpenseRuleException("A despesa mudou. Atualize os dados antes de cancelar.", true);
        var metadata = Metadata(body);
        if (Text(body, "status") != "Pendente" || metadata?.PaidAmount > 0m || metadata?.PaidBy is "Company" or "Partner")
            throw new ExpenseRuleException("Só é possível cancelar uma pendência sem pagamentos ou adiantamento de sócio. Confira os acertos já registrados.", true);
        // Mark legacy cancellations as managed, preserving the original record and prohibiting old-client reactivation.
        metadata ??= new(1, "Expense", "General", Text(body, "name"), DateOnly.ParseExact(Text(body, "dueDate"), "yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateOnly.ParseExact(Text(body, "dueDate"), "yyyy-MM-dd", CultureInfo.InvariantCulture), "Pending", null, null, null, null, null, null, null,
            null, null, 0m, "legacy");
        body["expense"] = JsonSerializer.SerializeToNode(metadata, ExpenseRules.Json);
        body["status"] = "Cancelado"; body["expenseCancellationReason"] = reason; body["version"] = checked(Version(body) + 1);
        record.Update(record.Name, body.ToJsonString());
        db.Add(new OperationalRecord(input.OperationId, "expenseOperations", id.ToString(), Serialize(new CancellationRecord(id, reason, Actor, fingerprint))));
        Audit("ExpenseCanceled", id, new { input.OperationId, Amount = body["amount"]!.GetValue<decimal>(), ReasonRecorded = true });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return await ToDetail(record, ct);
    }
    private static string PaymentHash(Guid id, ExpensePaymentInput input) => Hash(new { ExpenseId = id, input.Amount, input.PaidDate, input.PaymentMethod, input.AccountReference });
    private void AddPayment(Guid id, ExpensePaymentInput input) => db.Add(new OperationalRecord(input.OperationId, ExpenseRules.PaymentKind, id.ToString(),
        Serialize(new PaymentRecord(id, input.Amount, input.PaidDate, input.PaymentMethod, input.AccountReference, Actor, PaymentHash(id, input)))));
    private void Audit(string action, Guid id, object details) => db.AuditLogs.Add(AuditLog.Create(Actor, action, "Expense", id.ToString(), Serialize(details), audit.IpAddress, audit.UserAgent, audit.CorrelationId, clock.GetUtcNow()));
}
