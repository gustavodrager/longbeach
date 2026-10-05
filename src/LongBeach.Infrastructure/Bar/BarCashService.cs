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
    public async Task<IReadOnlyList<CashRegister>> Registers(CancellationToken ct) => await db.Set<CashRegister>().AsNoTracking().ToListAsync(ct);
    public async Task<CashRegister> CreateRegister(string name, CancellationToken ct) { var register = new CashRegister(name); db.Add(register); await db.SaveChangesAsync(ct); return register; }
    public async Task<IReadOnlyList<CashSession>> Sessions(CancellationToken ct) => await db.Set<CashSession>().AsNoTracking().OrderByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync(ct);
    public async Task<IReadOnlyList<CashSession>> Sessions(Guid actor, bool all, CancellationToken ct) => await db.Set<CashSession>().AsNoTracking().Where(x => all || x.OpenedBy == actor).OrderByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync(ct);
    public async Task<CashSession> Open(OpenCashInput input, Guid actor, CancellationToken ct)
    {
        var id = await Operation(input.OperationId, new { action = "cashOpen", input, actor }, async () =>
        {
            if (actor == Guid.Empty) throw new BarRuleException("Atendente obrigatório.");
            if (await db.Set<CashSession>().AnyAsync(x => x.OpenedBy == actor && (x.State == "Open" || x.State == "Reopened"), ct)) throw new BarRuleException("Você já tem um caixa aberto.");
            if (!await db.Set<CashRegister>().AnyAsync(x => x.Id == input.RegisterId, ct) || !await db.Set<StockLocation>().AnyAsync(x => x.Id == input.LocationId, ct)) throw new BarRuleException("Caixa ou local não encontrado.");
            var session = new CashSession(input.RegisterId, input.LocationId, actor, input.Terminal, input.Opening);
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
        var closingId = await Operation(input.OperationId, new { action = "cashClose", id, input, actor, supervisor }, async () =>
        {
            var session = await LockedSession(id, ct);
            if (session.OpenedBy != actor && !supervisor) throw new BarRuleException("Você só pode fechar o próprio caixa.");
            if (session.OpenedBy != actor) BarRules.Text(input.Reason, 500, "Motivo do fechamento pela supervisão");
            if(await db.Set<BarSale>().AnyAsync(x=>x.SessionId==id && x.State=="AwaitingPayment",ct)) throw new BarRuleException("Há cobrança Pix pendente; consulte antes de fechar o caixa.");
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
            var session = await LockedSession(id, ct);
            if (await db.Set<CashSession>().AnyAsync(x => x.Id != id && x.OpenedBy == session.OpenedBy && (x.State == "Open" || x.State == "Reopened"), ct)) throw new BarRuleException("O responsável já tem outro caixa aberto. Confira o turno antes de reabrir.");
            session.Reopen(); db.Add(new CashMovement(session, 0, "Reopen", reason, actor, operationId ?? Guid.NewGuid())); await db.SaveChangesAsync(ct); return session.Id;
        }, ct);
        return await Session(sessionId, ct);
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
        catch { db.ChangeTracker.Clear(); throw; }
    }
    private async Task<CashSession> LockedSession(Guid id, CancellationToken ct)
    {
        var session = await db.Set<CashSession>().FromSqlInterpolated($"SELECT * FROM cash_sessions WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct) ?? throw new BarRuleException("Sessão não encontrada.");
        await db.Entry(session).ReloadAsync(ct); return session;
    }
    private async Task<CashSession> Session(Guid id, CancellationToken ct) => await db.Set<CashSession>().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new BarRuleException("Sessão não encontrada.");
}
