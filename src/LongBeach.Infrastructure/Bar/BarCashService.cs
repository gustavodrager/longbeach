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
    public async Task<CashSession> Open(OpenCashInput input, Guid actor, CancellationToken ct)
    {
        if (!await db.Set<CashRegister>().AnyAsync(x => x.Id == input.RegisterId, ct) || !await db.Set<StockLocation>().AnyAsync(x => x.Id == input.LocationId, ct)) throw new BarRuleException("Caixa ou local não encontrado.");
        var session = new CashSession(input.RegisterId, input.LocationId, actor, input.Terminal, input.Opening);
        db.Add(session); db.Add(CashMovement.Opening(session,actor)); await db.SaveChangesAsync(ct); return session;
    }
    public async Task<CashSession> Move(Guid id, CashMovementInput input, string kind, Guid actor, CancellationToken ct)
    {
        BarRules.Money(input.Amount); if (input.Amount == 0 || input.OperationId == Guid.Empty) throw new BarRuleException("Valor e operação obrigatórios.");
        var session = await Session(id, ct);
        db.Add(new CashMovement(session, kind == "Supply" ? input.Amount : -input.Amount, kind, input.Reason, actor, input.OperationId));
        await db.SaveChangesAsync(ct); return session;
    }
    public async Task<CashClosing> Close(Guid id, CloseCashInput input, Guid actor, bool supervisor, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        if(await db.Set<LongBeach.Domain.Bar.BarSale>().AnyAsync(x=>x.SessionId==id && x.State=="AwaitingPayment",ct))throw new BarRuleException("Há cobrança Pix pendente; consulte antes de fechar o caixa.");
        var session = await Session(id, ct);
        var closing = new CashClosing(session, input.Counted, input.Reason, actor, supervisor);
        db.Add(closing); if(closing.Difference!=0){db.Add(CashMovement.ClosingDifference(session,closing,actor));db.Add(new LongBeach.Domain.Payments.BarEvent("CashDifferenceApproved",closing.Id,closing.Difference));} await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return closing;
    }
    public async Task<CashSession> Reopen(Guid id, string reason, Guid actor, CancellationToken ct)
    {
        var session = await Session(id, ct); session.Reopen();
        db.Add(new CashMovement(session, 0, "Reopen", reason, actor, Guid.NewGuid())); await db.SaveChangesAsync(ct); return session;
    }
    private async Task<CashSession> Session(Guid id, CancellationToken ct) => await db.Set<CashSession>().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new BarRuleException("Sessão não encontrada.");
}
