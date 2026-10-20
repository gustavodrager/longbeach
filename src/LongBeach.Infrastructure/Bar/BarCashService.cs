using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Bar;
public sealed class BarCashService(LongBeachDbContext db) : IBarCash
{
    public async Task<CashHistoryPage> History(string? search, string? state, int page, CancellationToken ct)
    {
        var query = from session in db.Set<CashSession>().AsNoTracking()
                    join register in db.Set<CashRegister>() on session.RegisterId equals register.Id
                    join owner in db.Users on session.OpenedBy equals owner.Id into owners
                    from user in owners.DefaultIfEmpty()
                    select new { session.Id, session.OpenedBy, Responsible = user == null ? "Responsável indisponível" : user.Name, Register = register.Name, session.Terminal, session.State, session.Opening, session.Expected, session.CreatedAtUtc };
        if (state == "open") query = query.Where(x => x.State != "Closed");
        if (state == "closed") query = query.Where(x => x.State == "Closed");
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLower(); query = query.Where(x => x.Responsible.ToLower().Contains(term) || x.Register.ToLower().Contains(term) || x.Terminal.ToLower().Contains(term)); }
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.State == "Closed").ThenByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Skip((Math.Clamp(page, 1, 100000) - 1) * 20).Take(20).ToListAsync(ct);
        return new(rows.Select(x => new CashHistoryRow(x.Id,x.OpenedBy,x.Responsible,x.Register,x.Terminal,x.State,x.Opening,x.Expected,x.CreatedAtUtc)).ToArray(), total);
    }
    public async Task<CashHistoryRow?> Current(CancellationToken ct) =>
        (await History(null, "open", 1, ct)).Items.FirstOrDefault();
    public async Task<CashDetails> Details(Guid id, CancellationToken ct)
    {
        var session = await Session(id, ct);
        var movements = await db.Set<CashMovement>().AsNoTracking().Where(x => x.SessionId == id).OrderByDescending(x => x.CreatedAtUtc).Select(x => new CashLedgerRow(x.Id, x.Kind, x.Amount, x.Reason, x.CreatedAtUtc)).ToListAsync(ct);
        var closings = await db.Set<CashClosing>().AsNoTracking().Where(x => x.SessionId == id).OrderByDescending(x => x.CreatedAtUtc).Select(x => new CashClosingRow(x.Id, x.Expected, x.Counted, x.Difference, x.Reason, x.CreatedAtUtc)).ToListAsync(ct);
        var pending = await db.Set<BarSale>().AnyAsync(x => x.SessionId == id && x.State == "AwaitingPayment", ct);
        var terminal = await db.Set<BarTabPayment>().AsNoTracking().Where(x => x.SessionId == id && x.Method == "TerminalManual" && x.State == "Approved")
            .GroupBy(x => x.TerminalType).Select(g => new TerminalReceiptTotal(g.Key!, g.Sum(x => x.Amount), g.Sum(x => x.Refunded))).ToListAsync(ct);
        return new(movements, closings, pending, session.Expected, terminal);
    }
    public async Task<IReadOnlyList<CashRegister>> Registers(CancellationToken ct) => await db.Set<CashRegister>().AsNoTracking().ToListAsync(ct);
    public Task<CashRegister> CreateRegister(string name, CancellationToken ct) => throw new BarRuleException("O Caixa do Bar é automático. Abra um turno para operar.");
    public async Task<IReadOnlyList<CashSession>> Sessions(CancellationToken ct) => await db.Set<CashSession>().AsNoTracking().OrderBy(x => x.State == "Closed").ThenByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync(ct);
    public async Task<IReadOnlyList<CashSession>> Sessions(Guid actor, bool all, CancellationToken ct) => await db.Set<CashSession>().AsNoTracking().Where(x => all || x.OpenedBy == actor).OrderBy(x => x.OpenedBy != actor).ThenBy(x => x.State == "Closed").ThenByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync(ct);
    public async Task<CashSession> Open(OpenCashInput input, Guid actor, CancellationToken ct)
    {
        var id = await Operation(input.OperationId, new { action = "cashOpen", input, actor }, async () =>
        {
            if (actor == Guid.Empty) throw new BarRuleException("Atendente obrigatório.");
            if (await db.Set<CashSession>().AnyAsync(x => x.OpenedBy == actor && (x.State == "Open" || x.State == "Reopened"), ct)) throw new BarRuleException("Você já tem um caixa aberto.");
            await RequireAvailableCash(ct);
            if (!await db.Set<StockLocation>().AnyAsync(x => x.Id == input.LocationId, ct)) throw new BarRuleException("Local não encontrado.");
            var register = await db.Set<CashRegister>().SingleOrDefaultAsync(x => x.Name == "Caixa do Bar", ct);
            if (register is null) { register = new CashRegister("Caixa do Bar"); db.Add(register); }
            var session = new CashSession(register.Id, input.LocationId, actor, input.Terminal, input.Opening);
            db.Add(session); db.Add(CashMovement.Opening(session,actor)); await db.SaveChangesAsync(ct); return session.Id;
        }, ct);
        return await Session(id, ct);
    }
    public async Task<CashSession> Move(Guid id, CashMovementInput input, string kind, Guid actor, CancellationToken ct)
    {
        var result = await Operation(input.OperationId, new { action = "cashMove", id, input, kind, actor }, async () =>
        {
            BarRules.Money(input.Amount); if (input.Amount == 0 || kind is not ("Supply" or "Withdraw" or "Expense")) throw new BarRuleException("Valor e tipo de movimentação obrigatórios.");
            var session = await LockedSession(id, ct);
            if (session.OpenedBy != actor) throw new BarRuleException("Você só pode movimentar seu próprio caixa.");
            var previous = await db.Set<CashMovement>().SingleOrDefaultAsync(x => x.OriginId == input.OperationId && x.Kind == kind, ct);
            if (previous is not null) { if (previous.SessionId != id || previous.ActorId != actor || previous.Amount != (kind == "Supply" ? input.Amount : -input.Amount) || previous.Reason != input.Reason.Trim()) throw new BarRuleException("Chave reutilizada para outra movimentação."); return session.Id; }
            db.Add(new CashMovement(session, kind == "Supply" ? input.Amount : -input.Amount, kind, input.Reason, actor, input.OperationId));
            await db.SaveChangesAsync(ct); return session.Id;
        }, ct);
        return await Session(result, ct);
    }
    public async Task<CashClosing> Close(Guid id, CloseCashInput input, Guid actor, bool supervisor, CancellationToken ct)
    {
        // Keep fingerprints of older clients stable when the optional balance check is absent.
        object fingerprintInput = input.Expected is null ? new { input.Counted, input.Reason, input.OperationId } : input;
        var closingId = await Operation(input.OperationId, new { action = "cashClose", id, input = fingerprintInput, actor, supervisor }, async () =>
        {
            var session = await LockedSession(id, ct);
            if (session.OpenedBy != actor && !supervisor) throw new BarRuleException("Você só pode fechar o próprio caixa.");
            if (session.OpenedBy != actor) BarRules.Text(input.Reason, 500, "Motivo do fechamento pela supervisão");
            if(await db.Set<BarSale>().AnyAsync(x=>x.SessionId==id && x.State=="AwaitingPayment",ct)) throw new BarRuleException("Há cobrança Pix pendente; consulte antes de fechar o caixa.");
            if (input.Expected is not null && input.Expected != session.Expected) throw new BarRuleException("O saldo mudou. Atualize o saldo e confira a diferença antes de confirmar novamente.");
            var closing = new CashClosing(session, input.Counted, input.Reason, actor, supervisor);
            db.Add(closing);
            if(closing.Difference!=0) { db.Add(CashMovement.ClosingDifference(session,closing,actor)); db.Add(new LongBeach.Domain.Payments.BarEvent("CashDifferenceApproved",closing.Id,closing.Difference)); }
            await db.SaveChangesAsync(ct); return closing.Id;
        }, ct);
        return await db.Set<CashClosing>().SingleAsync(x => x.Id == closingId, ct);
    }
    public Task<CashSession> Reopen(Guid id, string reason, Guid actor, CancellationToken ct) => Reopen(id, reason, actor, null, ct);
    public async Task<CashSession> Reopen(Guid id, string reason, Guid actor, Guid? operationId, CancellationToken ct)
    {
        var sessionId = await Operation(operationId, new { action = "cashReopen", id, reason, actor }, async () =>
        {
            await RequireAvailableCash(ct);
            var session = await LockedSession(id, ct);
            if (await db.Set<CashSession>().AnyAsync(x => x.Id != id && x.OpenedBy == session.OpenedBy && (x.State == "Open" || x.State == "Reopened"), ct)) throw new BarRuleException("O responsável já tem outro caixa aberto. Confira o turno antes de reabrir.");
            session.Reopen(); db.Add(new CashMovement(session, 0, "Reopen", reason, actor, operationId ?? Guid.NewGuid())); await db.SaveChangesAsync(ct); return session.Id;
        }, ct);
        return await Session(sessionId, ct);
    }
    private async Task RequireAvailableCash(CancellationToken ct)
    {
        // Serialize opening/reopening, including sessions created by older clients.
        await db.Database.ExecuteSqlRawAsync("LOCK TABLE cash_sessions, cash_registers IN SHARE ROW EXCLUSIVE MODE", ct);
        if (await db.Set<CashSession>().AnyAsync(x => x.State == "Open" || x.State == "Reopened", ct))
            throw new BarRuleException("O Caixa do Bar já está aberto. O responsável deve fechar o turno antes de uma nova abertura.");
    }
    private async Task<Guid> Operation(Guid? operationId, object payload, Func<Task<Guid>> action, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            string? fingerprint = null;
            if (operationId is not null)
            {
                if (operationId == Guid.Empty) throw new BarRuleException("Chave de operação obrigatória.");
                fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload))));
                var key = BitConverter.ToInt64(SHA256.HashData(operationId.Value.ToByteArray()), 0);
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({key})", ct);
                if (await db.Set<BarTabPayment>().AnyAsync(x => x.OperationId == operationId, ct) || await db.Set<BarTabRefund>().AnyAsync(x => x.OperationId == operationId, ct)) throw new BarRuleException("Chave já usada por outra operação.");
                var previous = await db.Set<BarTabOperation>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == operationId, ct);
                if (previous is not null)
                {
                    if (previous.Fingerprint != fingerprint) throw new BarRuleException("Chave reutilizada para outra operação.");
                    return JsonSerializer.Deserialize<Guid>(previous.ResponseJson);
                }
            }
            var result = await action();
            if (operationId is not null) { db.Add(new BarTabOperation(operationId.Value, fingerprint!, JsonSerializer.Serialize(result))); await db.SaveChangesAsync(ct); }
            await tx.CommitAsync(ct); return result;
        }
        catch (Exception ex) when (ex.GetBaseException() is Npgsql.PostgresException { SqlState: "40001" or "40P01" })
        {
            db.ChangeTracker.Clear();
            throw new BarRuleException("O caixa mudou durante a operação. Atualize os dados e tente novamente.");
        }
        catch { db.ChangeTracker.Clear(); throw; }
    }
    private async Task<CashSession> LockedSession(Guid id, CancellationToken ct)
    {
        var session = await db.Set<CashSession>().FromSqlInterpolated($"SELECT * FROM cash_sessions WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct) ?? throw new BarRuleException("Sessão não encontrada.");
        await db.Entry(session).ReloadAsync(ct); return session;
    }
    private async Task<CashSession> Session(Guid id, CancellationToken ct) => await db.Set<CashSession>().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new BarRuleException("Sessão não encontrada.");
}
