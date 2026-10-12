using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
namespace LongBeach.Infrastructure.Bar;
public sealed partial class BarStockService(LongBeachDbContext db, IConfiguration? config = null, TimeProvider? time = null) : IBarStock
{
    public async Task<IReadOnlyList<StockLocation>> Locations(CancellationToken ct) => await db.Set<StockLocation>().AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);
    public async Task<StockLocation> CreateLocation(LocationInput input, CancellationToken ct)
    { var location = new StockLocation(input.Name); db.Add(location); await db.SaveChangesAsync(ct); return location; }
    public async Task<object> Balances(bool costs, CancellationToken ct)
    {
        var balances = await db.Set<StockBalance>().AsNoTracking().ToListAsync(ct);
        var products = await db.Set<BarProduct>().AsNoTracking().ToDictionaryAsync(x => x.Id, ct);
        return balances.Select(x => new { x.Id, x.ProductId, x.LocationId, x.Quantity, x.Reserved, x.Available, x.Version,
            Name = products[x.ProductId].Name, Low = x.Available < products[x.ProductId].MinimumStock,
            UnitCost = costs ? (decimal?)products[x.ProductId].AverageCost : null }).ToArray();
    }
    public async Task<object> Movements(bool costs, CancellationToken ct) => (await db.Set<StockMovement>().AsNoTracking()
        .OrderByDescending(x => x.CreatedAtUtc).Take(500).ToListAsync(ct)).Select(x => new { x.Id, x.ProductId, x.LocationId, x.Quantity,
            x.Before, x.After, x.Kind, x.Reason, x.ActorId, x.OriginId, x.CreatedAtUtc, UnitCost = costs ? (decimal?)x.UnitCost : null }).ToArray();
    public async Task Transfer(TransferInput input, Guid actor, CancellationToken ct)
    {
        BarRules.Quantity(input.Quantity); BarRules.Text(input.Reason, 500, "Motivo");
        if (input.OperationId == Guid.Empty || input.FromLocationId == input.ToLocationId) throw new BarRuleException("Origem, destino e operação inválidos.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (await db.Set<StockMovement>().AnyAsync(x => x.OriginId == input.OperationId, ct)) throw new BarRuleException("Operação já registrada; consulte as movimentações.");
        var product = await Product(input.ProductId, ct);
        var from = await Balance(input.ProductId, input.FromLocationId, ct); var to = await Balance(input.ProductId, input.ToLocationId, ct);
        db.Add(new StockMovement(from, -input.Quantity, product.AverageCost, "TransferOut", input.Reason, input.OperationId, actor));
        db.Add(new StockMovement(to, input.Quantity, product.AverageCost, "TransferIn", input.Reason, input.OperationId, actor));
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public async Task Output(StockOutputInput input, string kind, Guid actor, bool supervisor, CancellationToken ct)
    {
        BarRules.Quantity(input.Quantity); if (input.OperationId == Guid.Empty) throw new BarRuleException("Identificador da operação obrigatório.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (await db.Set<StockMovement>().AnyAsync(x => x.OriginId == input.OperationId, ct)) throw new BarRuleException("Operação já registrada.");
        var product = await Product(input.ProductId, ct); var balance = await Balance(input.ProductId, input.LocationId, ct);
        var approvalLimit = config?.GetValue<decimal>("Bar:StockOutputApprovalLimit") ?? 100m;
        if(!supervisor && input.Quantity*product.AverageCost > approvalLimit)throw new BarRuleException("Saída acima do limite exige supervisor.");
        db.Add(new StockMovement(balance, -input.Quantity, product.AverageCost, kind, input.Reason, input.OperationId, actor));
        db.Add(new LongBeach.Domain.Payments.BarEvent(kind=="Loss"?"InventoryLossApproved":"InternalConsumptionRegistered",input.OperationId,input.Quantity*product.AverageCost));
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public async Task<InventoryCount> CreateCount(CountInput input, Guid actor, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        if (!await db.Set<StockLocation>().AnyAsync(x => x.Id == input.LocationId, ct)) throw new BarRuleException("Local inexistente.");
        if (input.Initial && (await db.Set<StockMovement>().AnyAsync(x => x.LocationId == input.LocationId, ct) || await db.Set<InventoryCount>().AnyAsync(x => x.LocationId == input.LocationId && x.Initial && x.State == "Approved", ct))) throw new BarRuleException("Local já possui movimentos; use inventário regular.");
        var count = new InventoryCount(input.LocationId, input.Initial, actor);
        foreach (var product in await db.Set<BarProduct>().Where(x => x.Active && x.ControlsStock).ToListAsync(ct))
        {
            var balance = await Balance(product.Id, input.LocationId, ct);
            count.Items.Add(new InventoryCountItem(count.Id, product.Id, balance.Quantity, balance.Version, product.AverageCost));
        }
        db.Add(count); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return count;
    }
    public async Task<IReadOnlyList<InventoryCount>> Counts(CancellationToken ct) => await db.Set<InventoryCount>().AsNoTracking().Include(x => x.Items).OrderByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync(ct);
    public async Task<InventoryCount> Count(Guid id, CountItemInput input, CancellationToken ct)
    { var count = await GetCount(id, ct); count.Count(input.ProductId, input.Quantity); await db.SaveChangesAsync(ct); return count; }
    public async Task<InventoryCount> CancelCount(Guid id,string reason,CancellationToken ct) {var count=await GetCount(id,ct);count.Cancel(reason);await db.SaveChangesAsync(ct);return count;}
    public async Task<InventoryCount> Approve(Guid id, string reason, Guid actor, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var count = await GetCount(id, ct); count.Approve(actor, reason);
        foreach (var item in count.Items)
        {
            var balance = await Balance(item.ProductId, count.LocationId, ct);
            if (balance.Version != item.BalanceVersion || balance.Reserved != 0) throw new BarRuleException("Houve movimento após a fotografia; refaça a contagem antes de aprovar.");
            var delta = item.Counted!.Value - item.Theoretical;
            if (delta != 0) db.Add(new StockMovement(balance, delta, item.UnitCost, count.Initial ? "InitialCount" : "InventoryAdjustment", reason, count.Id, actor));
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return count;
    }
    private async Task<InventoryCount> GetCount(Guid id, CancellationToken ct) => await db.Set<InventoryCount>().Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new BarRuleException("Contagem não encontrada.");
    internal async Task<StockBalance> Balance(Guid productId, Guid locationId, CancellationToken ct)
    {
        if (!await db.Set<StockLocation>().AnyAsync(x => x.Id == locationId, ct)) throw new BarRuleException("Local inexistente.");
        var balance = db.Set<StockBalance>().Local.SingleOrDefault(x => x.ProductId == productId && x.LocationId == locationId)
            ?? await db.Set<StockBalance>().SingleOrDefaultAsync(x => x.ProductId == productId && x.LocationId == locationId, ct);
        if (balance is null) { balance = new StockBalance(productId, locationId); db.Add(balance); }
        return balance;
    }
    private async Task<BarProduct> Product(Guid id, CancellationToken ct)
    {
        var product = await db.Set<BarProduct>().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new BarRuleException("Produto inexistente.");
        if (!product.ControlsStock) throw new BarRuleException("Produto não controla estoque."); return product;
    }
}
