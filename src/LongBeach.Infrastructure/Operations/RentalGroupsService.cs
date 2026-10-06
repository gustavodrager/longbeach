using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Operations;
using LongBeach.Contracts.Operations;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using static LongBeach.Application.Operations.RentalGroupRules;

namespace LongBeach.Infrastructure.Operations;

public sealed class RentalGroupsService(LongBeachDbContext db, TimeProvider time) : IRentalGroups
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private DateOnly Today => DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime.AddHours(-3));
    private static JsonElement Parse(string json) => JsonSerializer.Deserialize<JsonElement>(json);
    private static Dictionary<string, JsonElement[]> Snapshot(IEnumerable<OperationalRecord> rows) => rows.GroupBy(r => r.Kind).ToDictionary(g => g.Key, g => g.Select(r => Parse(r.Payload)).ToArray());
    private static JsonElement Group(Guid id, IEnumerable<OperationalRecord> rows) => Parse(rows.SingleOrDefault(r => r.Kind == "rentalGroups" && r.Id == id)?.Payload ?? throw new RentalRuleException("Grupo mensalista não encontrado."));
    public async Task<RentalMonthPreview> Preview(Guid groupId, string month, CancellationToken ct) { var rows = await db.OperationalRecords.AsNoTracking().ToListAsync(ct); return Build(Group(groupId, rows), month, rows); }
    private RentalMonthPreview Build(JsonElement group, string month, IReadOnlyList<OperationalRecord> records)
    {
        if (!Month(month, out var first)) throw new RentalRuleException("Informe a competência no formato ano-mês.");
        var dates = Dates(group, month); var errors = new List<string>(); var warnings = new List<string>();
        var existing = records.SingleOrDefault(r => r.Id == StableId("month", Id(group), month));
        if (existing is not null)
        {
            if (existing.Kind != "rentalMonths") throw new RentalRuleException("Identificador de competência já em uso.", true);
            var saved = Parse(existing.Payload);
            return new(Id(group), month, group.GetProperty("version").GetInt32(), saved.GetProperty("dates").EnumerateArray().Select(d => d.GetString()!).ToArray(), Money(saved, "amount"), Text(saved, "dueDate"), [], ["Este mês já foi gerado. As reservas e a cobrança existentes serão preservadas."], existing.Id);
        }
        if (Text(group, "status") != "Ativo") errors.Add("Ative o grupo antes de gerar os encontros.");
        if (dates.Length == 0) errors.Add("O acordo não possui encontros nesta competência.");
        var fifth = dates.Any(d => int.Parse(d[8..]) >= 29);
        var amount = Money(group, "monthlyAmount");
        if (fifth && Text(group, "fifthPolicy") == "A confirmar") { warnings.Add("Quinto encontro a confirmar: os horários podem ser reservados, mas o total do mês ainda precisa ser combinado."); amount = null; }
        if (fifth && Text(group, "fifthPolicy") == "Extra")
        {
            if (Money(group, "extraAmount") is not decimal extra || extra <= 0) { warnings.Add("Defina o valor do quinto encontro antes de gerar cobrança."); amount = null; }
            else if (amount is not null) amount += extra;
        }
        if (amount > 999_999_999) errors.Add("O total da competência ultrapassa o limite permitido.");
        if (amount is null) warnings.Add("Valor a combinar: será possível gerar os encontros sem cobrança.");
        if (dates.Length < 4) warnings.Add("Mês parcial: não há rateio automático. Confira o valor antes de gerar a cobrança.");
        if (dates.Any(d => DateOnly.ParseExact(d, "yyyy-MM-dd") < Today)) warnings.Add("Há datas passadas. A geração registra as reservas, sem afirmar presença nem pagamento.");
        warnings.Add("Feriados e reposições devem ser combinados com o grupo. A mensalidade permanece a mesma até uma alteração explícita no financeiro.");
        var snapshot = Snapshot(records); var reservations = snapshot.GetValueOrDefault("reservations", []).ToList();
        foreach (var date in dates)
        {
            var body = JsonSerializer.SerializeToElement(Reservation(group, month, date));
            if (records.Any(r => r.Id == Id(body))) { errors.Add($"{date}: identificador já utilizado."); continue; }
            var error = OperationalValidation.Validate("reservations", Id(body), body, snapshot, Today);
            if (error is not null) errors.Add($"{date}: {error}");
            reservations.Add(body); snapshot["reservations"] = reservations.ToArray();
        }
        var due = Money(group, "dueDay") is decimal day ? new DateOnly(first.Year, first.Month, Math.Min((int)day, DateTime.DaysInMonth(first.Year, first.Month))).ToString("yyyy-MM-dd") : "";
        if (due == "") warnings.Add("Vencimento a confirmar: os encontros podem ser gerados sem cobrança.");
        return new(Id(group), month, OperationalValidation.Version(group), dates, amount, due, errors.ToArray(), warnings.ToArray(), null);
    }
    public async Task<JsonElement> Generate(Guid groupId, RentalMonthInput input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
        var rows = await db.OperationalRecords.ToListAsync(ct); var group = Group(groupId, rows);
        var preview = Build(group, input.Month, rows);
        if (preview.ExistingMonthId is Guid previous)
        {
            var saved = Parse(rows.Single(r => r.Id == previous).Payload);
            if (saved.GetProperty("createCharge").GetBoolean() != input.CreateCharge) throw new RentalRuleException("Este mês já foi gerado com outra opção de cobrança. Consulte o financeiro antes de alterar.", true);
            return saved;
        }
        if (input.GroupVersion != OperationalValidation.Version(group)) throw new RentalRuleException("O acordo mudou. Atualize e revise o mês antes de confirmar.", true);
        if (preview.Errors.Length > 0) throw new RentalRuleException(string.Join(" ", preview.Errors));
        if (input.CreateCharge && preview.Amount is not > 0) throw new RentalRuleException("Defina um valor maior que zero para gerar a cobrança mensal.");
        if (input.CreateCharge && preview.DueDate == "") throw new RentalRuleException("Confirme o vencimento antes de gerar a cobrança mensal.");
        var monthId = StableId("month", groupId, input.Month);
        foreach (var date in preview.Dates) { var row = Reservation(group, input.Month, date); db.Add(new OperationalRecord(Id(JsonSerializer.SerializeToElement(row)), "reservations", Text(group, "name"), row.ToJsonString())); }
        var monthRow = new JsonObject { ["id"] = monthId.ToString(), ["version"] = 1, ["name"] = $"{Text(group, "name")} · {input.Month}", ["rentalGroupId"] = groupId.ToString(), ["month"] = input.Month,
            ["dates"] = JsonSerializer.SerializeToNode(preview.Dates), ["amount"] = preview.Amount, ["dueDate"] = preview.DueDate, ["createCharge"] = input.CreateCharge,
            ["groupVersion"] = input.GroupVersion, ["fifthPolicy"] = Text(group, "fifthPolicy"), ["createdAtUtc"] = time.GetUtcNow().ToString("O"),
            ["members"] = JsonSerializer.SerializeToNode(Members(group).Where(m => Text(m, "status") == "Ativo").Select(m => new { id = Id(m), name = Text(m, "name") })) };
        var record = new OperationalRecord(monthId, "rentalMonths", monthRow["name"]!.GetValue<string>(), monthRow.ToJsonString());
        db.Add(record); rows.Add(record);
        if (input.CreateCharge)
        {
            var chargeId = StableId("charge", groupId, input.Month);
            if (rows.Any(r => r.Id == chargeId)) throw new RentalRuleException("A identificação da cobrança já está em uso.", true);
            var charge = JsonSerializer.SerializeToElement(new { id = chargeId, version = 1, name = $"Mensalista · {Text(group, "name")} · {input.Month}", direction = "Receber", origin = "Locações", amount = preview.Amount,
                dueDate = preview.DueDate, status = "Pendente", paidDate = "", notes = "Cobrança única do aluguel mensal. Consumo do bar é separado.", sourceId = monthId, sourceKind = "rentalMonths", month = input.Month });
            var error = OperationalValidation.Validate("financeEntries", chargeId, charge, Snapshot(rows), Today);
            if (error is not null) throw new RentalRuleException(error);
            db.Add(new OperationalRecord(chargeId, "financeEntries", Text(charge, "name"), charge.GetRawText()));
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Parse(record.Payload);
    }
    public async Task<IReadOnlyList<RentalBarSummary>> Bar(Guid groupId, string month, CancellationToken ct)
    {
        if (!Month(month, out _)) throw new RentalRuleException("Informe a competência no formato ano-mês.");
        var records = await db.OperationalRecords.AsNoTracking().Where(r => r.Kind == "rentalBarLinks" || r.Kind == "reservations").ToListAsync(ct);
        var meetings = records.Where(r => r.Kind == "reservations").Select(r => Parse(r.Payload)).Where(r => Id(r, "rentalGroupId") == groupId && Text(r, "rentalMonth") == month).Select(r => Id(r)).ToHashSet();
        var links = records.Where(r => r.Kind == "rentalBarLinks").Select(r => Parse(r.Payload)).Where(r => Id(r, "rentalGroupId") == groupId && meetings.Contains(Id(r, "reservationId"))).ToDictionary(r => Id(r, "tabId"));
        var ids = links.Keys.ToArray();
        var tabs = await db.Set<BarTab>().AsNoTracking().Where(t => ids.Contains(t.Id)).OrderBy(t => t.Number).ToListAsync(ct);
        var items = (await db.Set<BarTabItem>().AsNoTracking().Where(i => ids.Contains(i.TabId)).ToListAsync(ct)).ToLookup(i => i.TabId);
        var payments = (await db.Set<BarTabPayment>().AsNoTracking().Where(p => ids.Contains(p.TabId)).ToListAsync(ct)).ToLookup(p => p.TabId);
        return tabs.Select(tab => { var link = links[tab.Id]; var total = BarTabsService.Calculate(items[tab.Id], payments[tab.Id], tab.Discount); return new RentalBarSummary(tab.Id, tab.Number, tab.Name, tab.State, Id(link, "reservationId"), Id(link, "memberId") is var member && member != Guid.Empty ? member : null, OperationalValidation.Version(link), total.Total, total.Paid, total.Due); }).ToArray();
    }
    public async Task UnlinkBar(Guid groupId, Guid tabId, int version, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
        var id = StableId("bar-link", tabId, "unique");
        var record = await db.OperationalRecords.SingleOrDefaultAsync(r => r.Id == id && r.Kind == "rentalBarLinks", ct) ?? throw new RentalRuleException("Vínculo não encontrado.");
        var saved = Parse(record.Payload);
        if (Id(saved, "rentalGroupId") == Guid.Empty && Id(saved, "previousGroupId") == groupId && OperationalValidation.Version(saved) == version + 1) return;
        if (Id(saved, "rentalGroupId") != groupId || OperationalValidation.Version(saved) != version) throw new RentalRuleException("O vínculo mudou. Atualize antes de desvincular.", true);
        var next = JsonNode.Parse(record.Payload)!.AsObject(); next["previousGroupId"] = groupId.ToString(); next["rentalGroupId"] = ""; next["reservationId"] = ""; next["memberId"] = null; next["version"] = version + 1;
        record.Update(record.Name, next.ToJsonString()); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public async Task LinkBar(Guid groupId, Guid tabId, RentalBarLinkInput input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
        var rows = await db.OperationalRecords.ToListAsync(ct); var group = Group(groupId, rows);
        var meeting = rows.Where(r => r.Kind == "reservations" && r.Id == input.ReservationId).Select(r => Parse(r.Payload)).SingleOrDefault();
        if (meeting.ValueKind == JsonValueKind.Undefined || Id(meeting, "rentalGroupId") != groupId || Text(meeting, "status") == "Cancelada") throw new RentalRuleException("Escolha um encontro válido deste grupo.");
        if (input.MemberId is Guid member && !Members(group).Any(m => Id(m) == member)) throw new RentalRuleException("O integrante não pertence a este grupo.");
        if (!await db.Set<BarTab>().AnyAsync(t => t.Id == tabId, ct)) throw new RentalRuleException("Comanda não encontrada.");
        var id = StableId("bar-link", tabId, "unique"); var old = rows.SingleOrDefault(r => r.Id == id);
        if (old is not null)
        {
            if (old.Kind != "rentalBarLinks") throw new RentalRuleException("Identificador em uso.", true);
            var previous = Parse(old.Payload);
            if (Id(previous, "rentalGroupId") != Guid.Empty && Id(previous, "rentalGroupId") != groupId) throw new RentalRuleException("Esta comanda já está vinculada a outro grupo.", true);
            if (Id(previous, "reservationId") == input.ReservationId && Id(previous, "memberId") == (input.MemberId ?? Guid.Empty)) return;
            if (Id(previous, "rentalGroupId") != Guid.Empty && input.Version != OperationalValidation.Version(previous)) throw new RentalRuleException("O vínculo da comanda mudou. Atualize antes de corrigir.", true);
        }
        var json = JsonSerializer.Serialize(new { id, version = old is null ? 1 : OperationalValidation.Version(Parse(old.Payload)) + 1, name = "Vínculo de comanda", tabId, rentalGroupId = groupId, input.ReservationId, input.MemberId }, Json);
        if (old is null) db.Add(new OperationalRecord(id, "rentalBarLinks", "Vínculo de comanda", json)); else old.Update(old.Name, json);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
}
