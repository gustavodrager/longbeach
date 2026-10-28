using System.Data;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Purchases;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace LongBeach.Infrastructure.Bar;
public sealed partial class BarCatalogService(LongBeachDbContext db) : IBarCatalog
{
    public async Task<IReadOnlyList<BarProductCategory>> Categories(CancellationToken ct) =>
        await db.Set<BarProductCategory>().AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);
    public async Task<BarProductCategory> CreateCategory(CategoryInput input, CancellationToken ct)
    {
        var category = new BarProductCategory(input.Name);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await LockCategories(ct);
        if (await db.Set<BarProductCategory>().AnyAsync(x => x.Name == category.Name, ct)) throw new BarRuleException("Categoria já cadastrada.");
        db.Add(category); await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return category;
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
        var useDefaultCategory = input.CategoryId is null || input.CategoryId == Guid.Empty;
        // Creation keeps the category lock's fresh ReadCommitted view. Changes to
        // existing stock definitions participate in the same serializable graph
        // as first purchases, sales, recipes, tabs and inventory snapshots.
        await using var transaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(id is null ? IsolationLevel.ReadCommitted : IsolationLevel.Serializable, ct) : null;
        if (id is not null && db.Database.CurrentTransaction!.GetDbTransaction().IsolationLevel != IsolationLevel.Serializable)
            throw new InvalidOperationException("A edição do catálogo exige uma transação serializável.");
        Guid categoryId;
        if (useDefaultCategory)
        {
            await LockCategories(ct);
            var category = await db.Set<BarProductCategory>().SingleOrDefaultAsync(x => x.Name == "Sem categoria", ct);
            if (category is null)
            {
                category = new BarProductCategory("Sem categoria");
                db.Add(category);
            }
            categoryId = category.Id;
        }
        else
        {
            categoryId = input.CategoryId!.Value;
            if (!await db.Set<BarProductCategory>().AnyAsync(x => x.Id == categoryId, ct)) throw new BarRuleException("Categoria não encontrada.");
        }
        BarProduct product;
        if (id is null)
        {
            product = new BarProduct(string.IsNullOrWhiteSpace(input.Code) ? $"LB-{Guid.NewGuid():N}" : input.Code, input.Name, input.ShortName, categoryId, input.SaleUnit,
                input.PurchaseUnit, input.ConversionFactor, input.SalePrice, input.AverageCost, input.MinimumStock,
                input.ControlsStock, input.Favorite, input.DisplayOrder);
            if (!input.Active) product.Change(input.Name, input.ShortName, categoryId, input.SaleUnit, input.PurchaseUnit,
                input.ConversionFactor, input.SalePrice, input.AverageCost, input.MinimumStock, input.ControlsStock, input.Favorite, input.DisplayOrder, false);
            if (await db.Set<BarProduct>().AnyAsync(x => x.Code == product.Code, ct)) throw new BarRuleException("Código já cadastrado.");
            db.Add(product);
        }
        else
        {
            product = await db.Set<BarProduct>().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new BarRuleException("Produto não encontrado.");
            var entry = db.Entry(product);
            if (entry.State != EntityState.Unchanged)
                throw new BarRuleException("Conclua ou descarte a edição pendente do produto antes de salvar outra alteração.");
            // A context reused by a compound command may hold an older identity
            // map entry. Read its current definition inside this transaction.
            await entry.ReloadAsync(ct);
            if (input.Version != product.Version) throw new BarRuleException("Produto alterado por outro usuário. Recarregue o cadastro.");
            if ((BarRules.Text(input.SaleUnit, 20, "Unidade de venda") != product.SaleUnit || input.ControlsStock != product.ControlsStock)
                && await HasStockHistory(product.Id, ct))
                throw new BarRuleException("Produto com saldo, histórico ou operações vinculadas: preserve a unidade e o controle de estoque. Cadastre outro produto para mudar essas regras.");
            product.Change(input.Name, input.ShortName, categoryId, input.SaleUnit, input.PurchaseUnit,
                input.ConversionFactor, input.SalePrice, input.AverageCost, input.MinimumStock, input.ControlsStock, input.Favorite, input.DisplayOrder, input.Active);
        }
        if(input.MainSupplierId is not null && !await db.Set<LongBeach.Domain.Purchases.Supplier>().AnyAsync(x=>x.Id==input.MainSupplierId,ct))throw new BarRuleException("Fornecedor principal inexistente.");
        product.SetMetadata(input.Barcode,input.ImageUrl,input.MainSupplierId);
        product.SetPreparation(input.Prepared);
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Managed(product);
    }
    private async Task<bool> HasStockHistory(Guid productId, CancellationToken ct)
    {
        db.ChangeTracker.DetectChanges();
        if (db.ChangeTracker.Entries().Any(entry => (entry.State is EntityState.Added or EntityState.Modified) && (entry.Entity switch
        {
            BarRecipeIngredient item => item.ProductId == productId,
            BarRecipeVersion recipe => recipe.ProductId == productId,
            StockMovement movement => movement.ProductId == productId,
            StockBalance balance => balance.ProductId == productId && (balance.Quantity != 0 || balance.Reserved != 0),
            InventoryCountItem item => item.ProductId == productId,
            PurchaseItem item => item.ProductId == productId,
            BarSaleItem item => item.ProductId == productId,
            BarTabItem item => item.ProductId == productId,
            _ => false
        }))) return true;
        return await db.Set<BarRecipeIngredient>().AnyAsync(x => x.ProductId == productId, ct)
        || await db.Set<BarRecipeVersion>().AnyAsync(x => x.ProductId == productId, ct)
        || await db.Set<StockMovement>().AnyAsync(x => x.ProductId == productId, ct)
        || await db.Set<StockBalance>().AnyAsync(x => x.ProductId == productId && (x.Quantity != 0 || x.Reserved != 0), ct)
        || await db.Set<InventoryCountItem>().AnyAsync(x => x.ProductId == productId, ct)
        || await db.Set<PurchaseItem>().AnyAsync(x => x.ProductId == productId, ct)
        || await db.Set<BarSaleItem>().AnyAsync(x => x.ProductId == productId, ct)
        || await db.Set<BarTabItem>().AnyAsync(x => x.ProductId == productId, ct);
    }
    // Compartilha a serialização com a importação de catálogo e o cadastro manual.
    private Task<int> LockCategories(CancellationToken ct) =>
        db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(19771005)", ct);
    private static CatalogProduct Public(BarProduct x) => new(x.Id, x.Code, x.Name, x.ShortName, x.CategoryId, x.SaleUnit,
        x.SalePrice, x.ControlsStock, x.MinimumStock, x.Favorite, x.DisplayOrder, x.Active, x.Version,x.Barcode,x.ImageUrl,x.Prepared);
    private static ManagedProduct Managed(BarProduct x) => new(Public(x), x.PurchaseUnit, x.ConversionFactor, x.AverageCost, x.LastCost,x.MainSupplierId);
}
