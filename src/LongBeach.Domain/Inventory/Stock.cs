using LongBeach.Domain.Common;
using LongBeach.Domain.Bar;
namespace LongBeach.Domain.Inventory;
public sealed class StockLocation : Entity
{
    private StockLocation() { }
    public StockLocation(string name, Guid? id = null) : base(id ?? Guid.NewGuid()) => Name = BarRules.Text(name, 100, "Local");
    public string Name { get; private set; } = "";
}
public sealed class StockBalance : Entity
{
    private StockBalance() { }
    public StockBalance(Guid productId, Guid locationId) : base(Guid.NewGuid()) { ProductId = productId; LocationId = locationId; }
    public Guid ProductId { get; private set; }
    public Guid LocationId { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal Reserved { get; private set; }
    public int Version { get; private set; }
    public decimal Available => Quantity - Reserved;
    public void Move(decimal delta)
    {
        if (delta == 0 || decimal.Round(delta, 3) != delta || Quantity + delta < Reserved) throw new BarRuleException("Movimentação inválida ou estoque disponível insuficiente.");
        BarRules.Quantity(Quantity + delta, true);
        Quantity += delta; Version++;
    }
    public void Reserve(decimal quantity) { BarRules.Quantity(quantity); if (quantity > Available) throw new BarRuleException("Estoque insuficiente."); Reserved += quantity; Version++; }
    public void Release(decimal quantity) { BarRules.Quantity(quantity); if (quantity > Reserved) throw new BarRuleException("Reserva inválida."); Reserved -= quantity; Version++; }
}
public sealed class StockMovement : Entity
{
    private StockMovement() { }
    public StockMovement(StockBalance balance, decimal delta, decimal unitCost, string kind, string reason, Guid origin, Guid actor) : base(Guid.NewGuid())
    {
        Kind = BarRules.Text(kind, 40, "Tipo"); Reason = BarRules.Text(reason, 500, "Motivo");
        ProductId = balance.ProductId; LocationId = balance.LocationId; Before = balance.Quantity;
        balance.Move(delta); After = balance.Quantity; Quantity = delta; UnitCost = unitCost;
        Kind = BarRules.Text(kind, 40, "Tipo"); Reason = BarRules.Text(reason, 500, "Motivo"); OriginId = origin; ActorId = actor;
    }
    public Guid ProductId { get; private set; }
    public Guid LocationId { get; private set; }
    public decimal Before { get; private set; }
    public decimal After { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal UnitCost { get; private set; }
    public string Kind { get; private set; } = "";
    public string Reason { get; private set; } = "";
    public Guid OriginId { get; private set; }
    public Guid ActorId { get; private set; }
}
public sealed class InventoryCount : Entity
{
    private InventoryCount() { }
    public InventoryCount(Guid locationId, bool initial, Guid actor) : base(Guid.NewGuid()) { LocationId = locationId; Initial = initial; ActorId = actor; }
    public Guid LocationId { get; private set; }
    public bool Initial { get; private set; }
    public Guid ActorId { get; private set; }
    public Guid? ApprovedBy { get; private set; }
    public string State { get; private set; } = "Counting";
    public string? Reason { get; private set; }
    public int Version { get; private set; }
    public ICollection<InventoryCountItem> Items { get; private set; } = new List<InventoryCountItem>();
    public void Count(Guid productId, decimal counted)
    {
        EnsureOpen(); var item = Items.SingleOrDefault(x => x.ProductId == productId) ?? throw new BarRuleException("Produto fora da fotografia do inventário.");
        item.Count(counted); Version++;
    }
    public void Approve(Guid actor, string reason)
    {
        EnsureOpen(); if (Items.Count == 0 || Items.Any(x => x.Counted is null)) throw new BarRuleException("Conte todos os produtos antes da aprovação.");
        Reason = BarRules.Text(reason, 500, "Justificativa"); ApprovedBy = actor; State = "Approved"; Version++;
    }
    public void Cancel(string reason) { EnsureOpen(); Reason=BarRules.Text(reason,500,"Motivo do cancelamento");State="Canceled";Version++; }
    private void EnsureOpen() { if (State != "Counting") throw new BarRuleException("Inventário aprovado é imutável."); }
}
public sealed class InventoryCountItem : Entity
{
    private InventoryCountItem() { }
    public InventoryCountItem(Guid countId, Guid productId, decimal theoretical, int balanceVersion, decimal unitCost) : base(Guid.NewGuid())
    { CountId = countId; ProductId = productId; Theoretical = theoretical; BalanceVersion = balanceVersion; UnitCost = unitCost; }
    public Guid CountId { get; private set; }
    public Guid ProductId { get; private set; }
    public decimal Theoretical { get; private set; }
    public int BalanceVersion { get; private set; }
    public decimal UnitCost { get; private set; }
    public decimal? Counted { get; private set; }
    internal void Count(decimal counted) => Counted = BarRules.Quantity(counted, true);
}
