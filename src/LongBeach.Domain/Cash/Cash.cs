using LongBeach.Domain.Common;
using LongBeach.Domain.Bar;
namespace LongBeach.Domain.Cash;
public sealed class CashRegister : Entity
{
    private CashRegister() { }
    public CashRegister(string name) : base(Guid.NewGuid()) => Name = BarRules.Text(name, 100, "Caixa");
    public string Name { get; private set; } = "";
}
public sealed class CashSession : Entity
{
    private CashSession() { }
    public CashSession(Guid registerId, Guid locationId, Guid actor, string terminal, decimal opening) : base(Guid.NewGuid())
    { RegisterId = registerId; LocationId = locationId; OpenedBy = actor; Terminal = BarRules.Text(terminal, 100, "Terminal"); Opening = BarRules.Money(opening); Expected = Opening; }
    public Guid RegisterId { get; private set; }
    public Guid LocationId { get; private set; }
    public Guid OpenedBy { get; private set; }
    public string Terminal { get; private set; } = "";
    public string State { get; private set; } = "Open";
    public decimal Opening { get; private set; }
    public decimal Expected { get; private set; }
    public int Version { get; private set; }
    public void EnsureOpen() { if (State != "Open" && State != "Reopened") throw new BarRuleException("Caixa fechado."); }
    public void Move(decimal amount) { EnsureOpen(); if (Expected + amount < 0) throw new BarRuleException("Dinheiro insuficiente no caixa."); Expected += amount; Version++; }
    public void AdjustClosing(decimal difference) { if(State!="Closed")throw new BarRuleException("Ajuste exige fechamento aprovado.");Expected+=difference;Version++; }
    public void Close() { EnsureOpen(); State = "Closed"; Version++; }
    public void Reopen() { if (State != "Closed") throw new BarRuleException("Somente caixa fechado pode ser reaberto."); State = "Reopened"; Version++; }
}
public sealed class CashMovement : Entity
{
    private CashMovement() { }
    public CashMovement(CashSession session, decimal amount, string kind, string reason, Guid actor, Guid origin) : base(Guid.NewGuid())
    { session.Move(amount); SessionId = session.Id; Amount = amount; Kind = kind; Reason = BarRules.Text(reason, 500, "Motivo"); ActorId = actor; OriginId = origin; }
    public static CashMovement Opening(CashSession session,Guid actor) => new() {Id=Guid.NewGuid(),SessionId=session.Id,Amount=session.Opening,Kind="Opening",Reason="Fundo inicial",ActorId=actor,OriginId=session.Id};
    public static CashMovement ClosingDifference(CashSession session,CashClosing closing,Guid actor)
    {session.AdjustClosing(closing.Difference);return new(){Id=Guid.NewGuid(),SessionId=session.Id,Amount=closing.Difference,Kind="ClosingDifference",Reason=closing.Reason!,ActorId=actor,OriginId=closing.Id};}
    public Guid SessionId { get; private set; }
    public decimal Amount { get; private set; }
    public string Kind { get; private set; } = "";
    public string Reason { get; private set; } = "";
    public Guid ActorId { get; private set; }
    public Guid OriginId { get; private set; }
}
public sealed class CashClosing : Entity
{
    private CashClosing() { }
    public CashClosing(CashSession session, decimal counted, string? reason, Guid actor, bool approveDifference) : base(Guid.NewGuid())
    {
        session.EnsureOpen(); Counted = BarRules.Money(counted); Expected = session.Expected; Difference = Counted - Expected;
        if (Difference != 0) { Reason = BarRules.Text(reason, 500, "Justificativa da diferença"); if (!approveDifference) throw new BarRuleException("Diferença de caixa exige supervisor."); }
        SessionId = session.Id; ActorId = actor; session.Close();
    }
    public Guid SessionId { get; private set; }
    public decimal Expected { get; private set; }
    public decimal Counted { get; private set; }
    public decimal Difference { get; private set; }
    public string? Reason { get; private set; }
    public Guid ActorId { get; private set; }
}
