using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Bar;
public sealed class BarCatalogService(LongBeachDbContext db) : IBarCatalog
{
    public async Task<IReadOnlyList<BarProductCategory>> Categories(CancellationToken ct) =>
        await db.Set<BarProductCategory>().AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);
    public async Task<BarProductCategory> CreateCategory(CategoryInput input, CancellationToken ct)
    {
        var category = new BarProductCategory(input.Name);
        if (await db.Set<BarProductCategory>().AnyAsync(x => x.Name == category.Name, ct)) throw new BarRuleException("Categoria já cadastrada.");
        db.Add(category); await db.SaveChangesAsync(ct); return category;
    }
    public async Task<IReadOnlyList<CatalogProduct>> Catalog(CancellationToken ct) =>
        await RankedCatalog(ct);
    private async Task<IReadOnlyList<CatalogProduct>> RankedCatalog(CancellationToken ct)
    {
        var products = await db.Set<BarProduct>().AsNoTracking().Where(x=>x.Active).ToListAsync(ct);
        var ranking = await (from item in db.Set<BarSaleItem>() join sale in db.Set<BarSale>() on item.SaleId equals sale.Id
            where sale.State == "Paid" && sale.Reason == null group item by item.ProductId into g
            select new { Id=g.Key, Quantity=g.Sum(x=>x.Quantity) }).ToDictionaryAsync(x=>x.Id,x=>x.Quantity,ct);
        return products.OrderByDescending(x=>ranking.GetValueOrDefault(x.Id)).ThenByDescending(x=>x.Favorite).ThenBy(x=>x.DisplayOrder).ThenBy(x=>x.Name).Select(Public).ToArray();
    }
    public async Task<IReadOnlyList<ManagedProduct>> Products(CancellationToken ct) =>
        (await db.Set<BarProduct>().AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct)).Select(Managed).ToArray();
    public async Task<ManagedProduct> SaveProduct(Guid? id, ProductInput input, CancellationToken ct)
    {
        if (!await db.Set<BarProductCategory>().AnyAsync(x => x.Id == input.CategoryId, ct)) throw new BarRuleException("Categoria não encontrada.");
        BarProduct product;
        if (id is null)
        {
            product = new BarProduct(input.Code, input.Name, input.ShortName, input.CategoryId, input.SaleUnit,
                input.PurchaseUnit, input.ConversionFactor, input.SalePrice, input.AverageCost, input.MinimumStock,
                input.ControlsStock, input.Favorite, input.DisplayOrder);
            if (!input.Active) product.Change(input.Name, input.ShortName, input.CategoryId, input.SaleUnit, input.PurchaseUnit,
                input.ConversionFactor, input.SalePrice, input.AverageCost, input.MinimumStock, input.ControlsStock, input.Favorite, input.DisplayOrder, false);
            if (await db.Set<BarProduct>().AnyAsync(x => x.Code == product.Code, ct)) throw new BarRuleException("Código já cadastrado.");
            db.Add(product);
        }
        else
        {
            product = await db.Set<BarProduct>().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new BarRuleException("Produto não encontrado.");
            if (input.Version != product.Version) throw new BarRuleException("Produto alterado por outro usuário. Recarregue o cadastro.");
            if(input.SaleUnit!=product.SaleUnit&&await db.Set<BarRecipeIngredient>().AnyAsync(x=>x.ProductId==product.Id,ct))throw new BarRuleException("A unidade do estoque está vinculada a fichas técnicas. Cadastre outro produto para mudar essa unidade sem reinterpretar o histórico.");
            product.Change(input.Name, input.ShortName, input.CategoryId, input.SaleUnit, input.PurchaseUnit,
                input.ConversionFactor, input.SalePrice, input.AverageCost, input.MinimumStock, input.ControlsStock, input.Favorite, input.DisplayOrder, input.Active);
        }
        if(input.MainSupplierId is not null && !await db.Set<LongBeach.Domain.Purchases.Supplier>().AnyAsync(x=>x.Id==input.MainSupplierId,ct))throw new BarRuleException("Fornecedor principal inexistente.");
        product.SetMetadata(input.Barcode,input.ImageUrl,input.MainSupplierId);
        product.SetPreparation(input.Prepared);
        await db.SaveChangesAsync(ct); return Managed(product);
    }
    private static CatalogProduct Public(BarProduct x) => new(x.Id, x.Code, x.Name, x.ShortName, x.CategoryId, x.SaleUnit,
        x.SalePrice, x.ControlsStock, x.MinimumStock, x.Favorite, x.DisplayOrder, x.Active, x.Version,x.Barcode,x.ImageUrl,x.Prepared);
    private static ManagedProduct Managed(BarProduct x) => new(Public(x), x.PurchaseUnit, x.ConversionFactor, x.AverageCost, x.LastCost,x.MainSupplierId);
}
