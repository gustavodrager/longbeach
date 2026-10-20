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
        var recipes = await db.Set<BarRecipeVersion>().AsNoTracking().Select(x => x.ProductId).Distinct().ToListAsync(ct);
        var eligible = products.Values.Where(p => p.Active && p.ControlsStock && (!p.Prepared || !recipes.Contains(p.Id))).Select(p => p.Id).ToHashSet();
        // Missing balances are zero for the same products considered by the summary alert.
        var locations = await db.Set<StockLocation>().AsNoTracking().Select(x => x.Id).ToListAsync(ct);
        var existing = balances.Select(x => (x.ProductId, x.LocationId)).ToHashSet();
        var result = balances.Select(x => View(products[x.ProductId], x.LocationId, x)).ToList();
        foreach (var productId in eligible)
            foreach (var locationId in locations)
                if (!existing.Contains((productId, locationId))) result.Add(View(products[productId], locationId, null));
        return result.OrderBy(x => x.Name).ThenBy(x => x.ProductId).ToArray();
        StockBalanceView View(BarProduct p, Guid location, StockBalance? b) => new(
            b?.Id ?? Guid.Empty, p.Id, location, b?.Quantity ?? 0, b?.Reserved ?? 0, b?.Available ?? 0, b?.Version ?? 0,
            p.Name, eligible.Contains(p.Id) && (b?.Available ?? 0) <= p.MinimumStock, costs ? p.AverageCost : null,
            p.MinimumStock, p.SaleUnit, eligible.Contains(p.Id), p.Active, p.ControlsStock);
    }
    private sealed record StockBalanceView(Guid Id, Guid ProductId, Guid LocationId, decimal Quantity, decimal Reserved,
        decimal Available, int Version, string Name, bool Low, decimal? UnitCost, decimal MinimumStock, string Unit,
        bool AlertEligible, bool Active, bool ControlsStock);

    public async Task<object> MovementHistory(Guid? locationId, string? search, string? kind, DateOnly? from, DateOnly? to, int page, CancellationToken ct)
    {
        if (from > to || page < 1 || page > 100000) throw new BarRuleException("Confira o período e a página do histórico.");
        var query = db.Set<StockMovement>().AsNoTracking().AsQueryable();
        if (locationId.HasValue) query = query.Where(x => x.LocationId == locationId);
        if (!string.IsNullOrWhiteSpace(kind)) query = query.Where(x => x.Kind == kind);
        // The operational calendar uses Brasília time; the final day is inclusive.
        if (from.HasValue) { var start = new DateTimeOffset(from.Value.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(-3)).UtcDateTime; query = query.Where(x => x.CreatedAtUtc >= start); }
        if (to.HasValue) { if (to.Value == DateOnly.MaxValue) throw new BarRuleException("Data final inválida."); var end = new DateTimeOffset(to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(-3)).UtcDateTime; query = query.Where(x => x.CreatedAtUtc < end); }
        var rows = from m in query
                   join p in db.Set<BarProduct>() on m.ProductId equals p.Id
                   join l in db.Set<StockLocation>() on m.LocationId equals l.Id
                   join u in db.Users on m.ActorId equals u.Id into actors
                   from actor in actors.DefaultIfEmpty()
                   select new { m.Id, m.ProductId, Name = p.Name, Unit = p.SaleUnit, m.LocationId, LocationName = l.Name,
                       m.Quantity, m.Before, m.After, m.Kind, m.Reason, m.CreatedAtUtc, m.OriginId, m.ActorId, ActorName = actor == null ? null : actor.Name };
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLower(); rows = rows.Where(x => x.Name.ToLower().Contains(term)); }
        var total = await rows.CountAsync(ct);
        var actualPage = Math.Min(page, Math.Max(1, (int)Math.Ceiling(total / 20m)));
        return new { Items = await rows.OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id).Skip((actualPage - 1) * 20).Take(20).ToListAsync(ct), Total = total, Page = actualPage, PageSize = 20 };
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
    public async Task<InventoryCount> Approve(Guid id, string reason, Guid actor, CancellationToken ct, bool zeroUncounted = false)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var count = await GetCount(id, ct); count.Approve(actor, reason, zeroUncounted);
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
