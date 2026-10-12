namespace LongBeach.Contracts.Bar;

public sealed record StockValuationRow(Guid ProductId, string Name, string Unit, decimal Quantity,
    decimal Reserved, decimal Available, decimal? UnitCost, string CostStatus, decimal SalePrice,
    string SaleStatus, decimal? StockCost, decimal? SalePotential, decimal? GrossProfit);

public sealed record StockValuationResponse(Guid LocationId, string LocationName, DateTimeOffset UpdatedAtUtc,
    decimal StockCost, decimal SalePotential, decimal ComparableSalePotential, decimal ComparableCost,
    decimal? GrossProfit, decimal? GrossMarginPercent, int MissingCostProducts, int IncompleteCostProducts,
    int SaleProducts, int ExcludedSaleProducts, IReadOnlyList<StockValuationRow> Rows);
