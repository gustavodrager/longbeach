using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Bar;

public sealed partial class BarStockService
{
    public async Task<StockValuationResponse> Valuation(CancellationToken ct)
    {
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var locations = await db.Set<StockLocation>().AsNoTracking().Where(l => l.Name.Trim().ToLower() == "bar").ToListAsync(ct);
        if (locations.Count != 1) throw new BarRuleException("Estoque Bar não configurado de forma única.");
        var location = locations.Single();
        var balances = await db.Set<StockBalance>().AsNoTracking().Where(b => b.LocationId == location.Id && b.Quantity > 0).ToListAsync(ct);
        var ids = balances.Select(b => b.ProductId).ToArray();
        var products = await db.Set<BarProduct>().AsNoTracking().Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);
        var candidates = await db.Set<StockMovement>().AsNoTracking()
            .Where(m => ids.Contains(m.ProductId) && m.Quantity > 0 && m.UnitCost == 0 && m.Kind != "TransferIn")
            .Select(m => m.ProductId).Distinct().ToArrayAsync(ct);
        var incomplete = new HashSet<Guid>();
        if (candidates.Length > 0)
        {
            var movements = await db.Set<StockMovement>().AsNoTracking().Where(m => candidates.Contains(m.ProductId)).ToListAsync(ct);
            var quantities = await db.Set<StockBalance>().AsNoTracking().Where(b => candidates.Contains(b.ProductId))
                .GroupBy(b => b.ProductId).Select(g => new { Id = g.Key, Quantity = g.Sum(b => b.Quantity) }).ToDictionaryAsync(g => g.Id, g => g.Quantity, ct);
            foreach (var group in movements.GroupBy(m => m.ProductId))
                if (StockValuationRules.HasUncostedStock(quantities.GetValueOrDefault(group.Key), group)) incomplete.Add(group.Key);
        }
        var response = StockValuationRules.Calculate(location, (time ?? TimeProvider.System).GetUtcNow(), balances, products, incomplete);
        await snapshot.CommitAsync(ct);
        return response;
    }
}
