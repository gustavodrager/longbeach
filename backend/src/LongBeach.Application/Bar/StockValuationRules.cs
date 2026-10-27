using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;

namespace LongBeach.Application.Bar;

public static class StockValuationRules
{
    public static StockValuationResponse Calculate(StockLocation location, DateTimeOffset updatedAt,
        IReadOnlyList<StockBalance> balances, IReadOnlyDictionary<Guid, BarProduct> products,
        IReadOnlySet<Guid> incompleteCosts)
    {
        var rows = balances.Where(b => b.LocationId == location.Id && b.Quantity > 0)
            .Select(b =>
            {
                var p = products[b.ProductId];
                var costStatus = p.AverageCost <= 0 ? "missing" : incompleteCosts.Contains(p.Id) ? "incomplete" : "registered";
                var saleStatus = !p.Active ? "inactive" : !p.ControlsStock ? "untracked" : p.Prepared ? "prepared" : p.SalePrice <= 0 ? "no-price" : "direct";
                decimal? cost = p.AverageCost > 0 ? p.AverageCost : null;
                decimal? potential = saleStatus == "direct" ? Round(b.Available * p.SalePrice) : null;
                decimal? profit = potential is not null && costStatus == "registered"
                    ? potential - Round(b.Available * p.AverageCost) : null;
                return new StockValuationRow(p.Id, p.Name, p.SaleUnit, b.Quantity, b.Reserved, b.Available,
                    cost, costStatus, p.SalePrice, saleStatus, cost is null ? null : Round(b.Quantity * cost.Value), potential, profit);
            }).OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase).ToArray();
        var comparable = rows.Where(r => r.GrossProfit is not null && r.Available > 0).ToArray();
        var revenue = comparable.Sum(r => r.SalePotential!.Value);
        var costTotal = comparable.Sum(r => Round(r.Available * r.UnitCost!.Value));
        var saleRows = rows.Where(r => r.SaleStatus == "direct" && r.Available > 0).ToArray();
        decimal? profitTotal = comparable.Length > 0 || saleRows.Length == 0 ? revenue - costTotal : null;
        return new(location.Id, location.Name, updatedAt, rows.Sum(r => r.StockCost ?? 0),
            rows.Sum(r => r.SalePotential ?? 0), revenue, costTotal, profitTotal,
            revenue > 0 && profitTotal is not null ? Round(profitTotal.Value / revenue * 100) : null,
            rows.Count(r => r.CostStatus == "missing"), rows.Count(r => r.CostStatus == "incomplete"),
            saleRows.Length, rows.Count(r => r.SaleStatus != "direct"), rows);
    }

    // Walk the current stock cycle backwards across every location. Transfers are one
    // operation with a net zero delta; they must not make an uncosted batch look depleted.
    public static bool HasUncostedStock(decimal currentQuantity, IEnumerable<StockMovement> movements)
    {
        foreach (var operation in movements.GroupBy(m => m.OriginId).OrderByDescending(g => g.Max(m => m.CreatedAtUtc)))
        {
            if (currentQuantity <= 0) return false;
            if (operation.Any(m => m.Quantity > 0 && m.UnitCost == 0 && m.Kind != "TransferIn")) return true;
            currentQuantity -= operation.Sum(m => m.Quantity);
        }
        return false;
    }

    private static decimal Round(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
}
