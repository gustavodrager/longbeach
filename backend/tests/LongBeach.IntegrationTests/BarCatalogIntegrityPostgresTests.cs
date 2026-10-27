using System.Data;
using System.Data.Common;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Purchases;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace LongBeach.IntegrationTests;

public sealed class BarCatalogIntegrityPostgresTests
{
    [PostgresFact]
    public async Task Every_existing_use_locks_base_unit_and_stock_control_but_allows_metadata()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        foreach (var usage in new[] { "balance", "reservation", "history", "count", "purchase", "sale", "tab", "recipe", "ingredient" })
        {
            var db = isolated.Context;
            var product = await SeedProduct(db);
            await AddUsage(db, product, usage);
            var input = Input(product);
            await using (var writer = Context(isolated))
                await Assert.ThrowsAsync<BarRuleException>(() => new BarCatalogService(writer).SaveProduct(product.Id, input with { SaleUnit = "kg" }, default));
            await using (var writer = Context(isolated))
                await Assert.ThrowsAsync<BarRuleException>(() => new BarCatalogService(writer).SaveProduct(product.Id, input with { ControlsStock = false }, default));
            await using (var writer = Context(isolated))
            {
                var changed = await new BarCatalogService(writer).SaveProduct(product.Id,
                    input with { Name = "Nome atualizado", MinimumStock = 3, SalePrice = 6 }, default);
                Assert.Equal("Nome atualizado", changed.Product.Name);
                Assert.Equal(3, changed.Product.MinimumStock);
                Assert.Equal(6, changed.Product.SalePrice);
                Assert.Equal("un", changed.Product.SaleUnit);
                Assert.True(changed.Product.ControlsStock);
            }
        }
    }

    [PostgresFact]
    public async Task Unused_product_with_empty_balance_can_be_corrected_and_defaults_are_preserved()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        var service = new BarCatalogService(db);
        var created = await service.SaveProduct(null, new("", "Sem uso", "Sem uso", null,
            "un", "un", 1, 5, 2, 0, true, false, 0), default);
        db.Add(new StockBalance(created.Product.Id, StockModel.Bar));
        await db.SaveChangesAsync();
        var changed = await service.SaveProduct(created.Product.Id, new(created.Product.Code, "Corrigido", "Corrigido", Guid.Empty,
            "kg", "kg", 1, 6, 2, 1, false, false, 0, Version: created.Product.Version), default);
        Assert.StartsWith("LB-", created.Product.Code);
        Assert.Equal(created.Product.CategoryId, changed.Product.CategoryId);
        Assert.Equal("kg", changed.Product.SaleUnit);
        Assert.False(changed.Product.ControlsStock);
        Assert.Single(await db.Set<BarProductCategory>().Where(x => x.Name == "Sem categoria").ToListAsync());
    }

    [PostgresFact]
    public async Task Pending_usage_cannot_be_flushed_with_a_reinterpreted_definition()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        var product = await SeedProduct(db);
        var supplier = new Supplier("Fornecedor local");
        var purchase = new Purchase(supplier.Id, "pendente", Guid.NewGuid());
        purchase.Items.Add(new PurchaseItem(purchase.Id, product, 1, 12));
        db.AddRange(supplier, purchase);
        await Assert.ThrowsAsync<BarRuleException>(() => new BarCatalogService(db).SaveProduct(product.Id,
            Input(product) with { SaleUnit = "kg" }, default));
        await using var reader = Context(isolated);
        Assert.False(await reader.Set<PurchaseItem>().AnyAsync());
        Assert.Equal("un", (await reader.Set<BarProduct>().SingleAsync(x => x.Id == product.Id)).SaleUnit);
    }

    [PostgresFact]
    public async Task Product_stock_edit_without_quantity_keeps_the_outer_transaction_and_does_not_create_stock()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        var product = await SeedProduct(db);
        await using (var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable))
        {
            await new BarCatalogService(db).SaveProduct(product.Id, Input(product) with { SaleUnit = "kg" }, default);
            Assert.Same(transaction, db.Database.CurrentTransaction);
            await transaction.RollbackAsync();
        }
        db.ChangeTracker.Clear();
        product = await db.Set<BarProduct>().SingleAsync(x => x.Id == product.Id);
        Assert.Equal("un", product.SaleUnit);
        var result = await new BarCatalogService(db).SaveProductStock(product.Id,
            new(Input(product) with { Name = "Somente cadastro" }, null, null, Guid.NewGuid()), Guid.NewGuid(), default);
        Assert.Equal("Somente cadastro", result.Product.Name);
        Assert.False(await db.Set<StockBalance>().AnyAsync());
        Assert.False(await db.Set<StockMovement>().AnyAsync());
    }

    [PostgresFact]
    public async Task Definition_changes_and_first_uses_refuse_a_weaker_ambient_transaction()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        var product = await SeedProduct(db);
        var supplier = new Supplier("Fornecedor local");
        var actor = Guid.NewGuid();
        var register = new CashRegister("Caixa local");
        var session = new CashSession(register.Id, StockModel.Bar, actor, "Local", 0);
        db.AddRange(supplier, register, session);
        await db.SaveChangesAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        await Assert.ThrowsAsync<InvalidOperationException>(() => new BarCatalogService(db).SaveProduct(product.Id, Input(product), default));
        await Assert.ThrowsAsync<InvalidOperationException>(() => new BarPurchasesService(db).Create(
            new(supplier.Id, "Local", [new(product.Id, 1, 12)]), actor, default));
        await Assert.ThrowsAsync<InvalidOperationException>(() => new BarSalesService(db).Create(
            new(session.Id, [new(product.Id, 1)]), actor, default));
        Assert.Same(transaction, db.Database.CurrentTransaction);
        Assert.Empty(await db.Set<PurchaseItem>().ToListAsync());
        Assert.Empty(await db.Set<BarSaleItem>().ToListAsync());
    }

    [PostgresFact]
    public async Task Reused_context_uses_current_snapshots_for_first_purchase_sale_and_stock()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var product = await SeedProduct(isolated.Context);
        var disabled = await SeedProduct(isolated.Context);
        var supplier = new Supplier("Fornecedor local");
        var actor = Guid.NewGuid();
        var register = new CashRegister("Caixa local");
        var session = new CashSession(register.Id, StockModel.Bar, actor, "Local", 0);
        isolated.Context.AddRange(supplier, register, session);
        await isolated.Context.SaveChangesAsync();
        await using var stale = Context(isolated);
        await stale.Set<BarProduct>().Where(x => x.Id == product.Id || x.Id == disabled.Id).LoadAsync();
        await using (var editor = Context(isolated))
        {
            var catalog = new BarCatalogService(editor);
            await catalog.SaveProduct(product.Id, Input(product) with { SaleUnit = "kg", PurchaseUnit = "saco", ConversionFactor = 25 }, default);
            await catalog.SaveProduct(disabled.Id, Input(disabled) with { ControlsStock = false }, default);
        }
        var purchase = await new BarPurchasesService(stale).Create(new(supplier.Id, "Snapshot atual", [new(product.Id, 1, 12)]), actor, default);
        Assert.Equal("saco", Assert.Single(purchase.Items).PurchaseUnit);
        Assert.Equal(25, Assert.Single(purchase.Items).Conversion);
        await Assert.ThrowsAsync<BarRuleException>(() => new BarPurchasesService(stale).Create(
            new(supplier.Id, "Sem estoque", [new(disabled.Id, 1, 12)]), actor, default));
        await new BarSalesService(stale).Create(new(session.Id, [new(disabled.Id, 1)]), actor, default);
        await Assert.ThrowsAsync<BarRuleException>(() => new BarStockService(stale).SetAvailable(
            new(disabled.Id, StockModel.Bar, 1, 0, Guid.NewGuid()), actor, default));
        await using var reader = Context(isolated);
        Assert.False((await reader.Set<BarSaleItem>().SingleAsync(x => x.ProductId == disabled.Id)).ControlsStock);
        Assert.False(await reader.Set<StockMovement>().AnyAsync(x => x.ProductId == disabled.Id));
    }

    [PostgresFact]
    public async Task Catalog_refreshes_unchanged_tracked_products_but_never_discards_pending_edits()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var product = await SeedProduct(isolated.Context);
        await using var stale = Context(isolated);
        var tracked = await stale.Set<BarProduct>().SingleAsync(x => x.Id == product.Id);
        var original = Input(tracked);
        await using (var editor = Context(isolated))
            await new BarCatalogService(editor).SaveProduct(product.Id, original with { Name = "Alteração confirmada" }, default);
        await Assert.ThrowsAsync<BarRuleException>(() => new BarCatalogService(stale).SaveProduct(product.Id,
            original with { SaleUnit = "kg" }, default));
        Assert.Equal("Alteração confirmada", tracked.Name);
        var current = Input(tracked);
        tracked.Change("Edição pendente", tracked.ShortName, tracked.CategoryId, tracked.SaleUnit, tracked.PurchaseUnit,
            tracked.ConversionFactor, tracked.SalePrice, tracked.AverageCost, tracked.MinimumStock,
            tracked.ControlsStock, tracked.Favorite, tracked.DisplayOrder, tracked.Active);
        await Assert.ThrowsAsync<BarRuleException>(() => new BarCatalogService(stale).SaveProduct(product.Id,
            current with { SaleUnit = "kg" }, default));
        Assert.Equal("Edição pendente", tracked.Name);
        Assert.Equal(EntityState.Modified, stale.Entry(tracked).State);
        await using var reader = Context(isolated);
        Assert.Equal("Alteração confirmada", (await reader.Set<BarProduct>().SingleAsync(x => x.Id == product.Id)).Name);
    }

    [PostgresFact]
    public async Task A_definition_change_cannot_commit_together_with_a_first_use_of_the_old_snapshot()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        foreach (var usage in new[] { "purchase", "sale", "available" })
        {
            var product = await SeedProduct(isolated.Context);
            var supplier = new Supplier("Fornecedor " + usage);
            var actor = Guid.NewGuid();
            var register = new CashRegister("Caixa " + usage);
            var session = new CashSession(register.Id, StockModel.Bar, actor, "Local", 0);
            isolated.Context.AddRange(supplier, register, session);
            await isolated.Context.SaveChangesAsync();
            var barrier = new ProductReadBarrier();
            await using var writer = Context(isolated, barrier);
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var write = usage switch
            {
                "purchase" => (Task)new BarPurchasesService(writer).Create(new(supplier.Id, usage, [new(product.Id, 1, 12)]), actor, deadline.Token),
                "sale" => new BarSalesService(writer).Create(new(session.Id, [new(product.Id, 1)]), actor, deadline.Token),
                _ => new BarStockService(writer).SetAvailable(new(product.Id, StockModel.Bar, 1, 0, Guid.NewGuid()), actor, deadline.Token)
            };
            Exception? editError;
            try
            {
                await barrier.Reached.Task.WaitAsync(TimeSpan.FromSeconds(10));
                await using var editor = Context(isolated);
                editError = await Record.ExceptionAsync(() => new BarCatalogService(editor).SaveProduct(product.Id,
                    usage == "purchase" ? Input(product) with { SaleUnit = "kg" } : Input(product) with { ControlsStock = false }, deadline.Token));
            }
            finally { barrier.Resume.TrySetResult(); }
            var useError = await Record.ExceptionAsync(() => write);
            Assert.Null(editError);
            Assert.NotNull(useError);
            var translatedStockConflict = usage == "available" && useError is BarRuleException
                { Message: "O estoque mudou durante o ajuste. Atualize os dados e confira novamente." };
            Assert.True(IsConcurrencyConflict(useError) || translatedStockConflict, useError.ToString());
            await using var reader = Context(isolated);
            var saved = await reader.Set<BarProduct>().SingleAsync(x => x.Id == product.Id);
            Assert.Equal(usage == "purchase" ? "kg" : "un", saved.SaleUnit);
            Assert.Equal(usage == "purchase", saved.ControlsStock);
            Assert.False(await reader.Set<PurchaseItem>().AnyAsync(x => x.ProductId == product.Id));
            Assert.False(await reader.Set<BarSaleItem>().AnyAsync(x => x.ProductId == product.Id));
            Assert.False(await reader.Set<StockMovement>().AnyAsync(x => x.ProductId == product.Id));
        }
    }

    private static bool IsConcurrencyConflict(Exception? exception)
    {
        for (var cause = exception; cause is not null; cause = cause.InnerException)
            if (cause is DbUpdateConcurrencyException || cause is Npgsql.PostgresException { SqlState: "40001" or "40P01" }) return true;
        return false;
    }

    private static LongBeachDbContext Context(IsolatedBarDatabase isolated, params IInterceptor[] interceptors) =>
        new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(isolated.Context.Database.GetConnectionString())
            .AddInterceptors(interceptors).Options, TimeProvider.System);

    private static ProductInput Input(BarProduct product) => new(product.Code, product.Name, product.ShortName, product.CategoryId,
        product.SaleUnit, product.PurchaseUnit, product.ConversionFactor, product.SalePrice, product.AverageCost,
        product.MinimumStock, product.ControlsStock, product.Favorite, product.DisplayOrder, product.Active, product.Version, Prepared: product.Prepared);

    private static async Task<BarProduct> SeedProduct(LongBeachDbContext db)
    {
        var suffix = Guid.NewGuid().ToString("N");
        var category = new BarProductCategory("Categoria " + suffix);
        var product = new BarProduct(suffix, "Produto local", "Produto", category.Id, "un", "cx", 12, 5, 2, 0, true, false, 0);
        db.AddRange(category, product);
        await db.SaveChangesAsync();
        return product;
    }

    private static async Task AddUsage(LongBeachDbContext db, BarProduct product, string usage)
    {
        var actor = Guid.NewGuid();
        switch (usage)
        {
            case "balance":
            case "reservation":
                var balance = new StockBalance(product.Id, StockModel.Bar);
                balance.Move(2);
                if (usage == "reservation") balance.Reserve(1);
                db.Add(balance);
                break;
            case "history":
                var empty = new StockBalance(product.Id, StockModel.Bar);
                db.AddRange(empty, new StockMovement(empty, 1, 2, "PurchaseReceived", "Entrada", Guid.NewGuid(), actor),
                    new StockMovement(empty, -1, 2, "Loss", "Perda", Guid.NewGuid(), actor));
                break;
            case "count":
                var count = new InventoryCount(StockModel.Bar, false, actor);
                count.Items.Add(new InventoryCountItem(count.Id, product.Id, 0, 0, 2));
                db.Add(count);
                break;
            case "purchase":
                var supplier = new Supplier("Fornecedor local");
                var purchase = new Purchase(supplier.Id, "Pedido local", actor);
                purchase.Items.Add(new PurchaseItem(purchase.Id, product, 1, 12));
                db.AddRange(supplier, purchase);
                break;
            case "sale":
                var register = new CashRegister("Caixa local");
                var session = new CashSession(register.Id, StockModel.Bar, actor, "Local", 0);
                var sale = new BarSale(session.Id, StockModel.Bar, actor);
                sale.Add(product, 1);
                db.AddRange(register, session, sale);
                break;
            case "tab":
                var tab = new BarTab(StockModel.Bar, actor, "Comanda local", "Tab");
                db.AddRange(tab, new BarTabItem(tab.Id, product, 1, actor, false));
                break;
            case "recipe":
                product.SetPreparation(true);
                db.Add(new BarRecipeVersion(product.Id, product.Name, 1, 1, "Receita local", actor));
                break;
            case "ingredient":
                var prepared = await SeedProduct(db);
                prepared.SetPreparation(true);
                var recipe = new BarRecipeVersion(prepared.Id, prepared.Name, 1, 1, "Receita local", actor);
                recipe.Ingredients.Add(new BarRecipeIngredient(recipe.Id, product, 1, "Sale"));
                db.Add(recipe);
                break;
            default: throw new ArgumentOutOfRangeException(nameof(usage));
        }
        await db.SaveChangesAsync();
    }

    private sealed class ProductReadBarrier : DbCommandInterceptor
    {
        private int reached;
        public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Resume { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
            DbDataReader result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.Contains("FROM bar_products", StringComparison.Ordinal) && Interlocked.Exchange(ref reached, 1) == 0)
            {
                Reached.TrySetResult();
                await Resume.Task.WaitAsync(TimeSpan.FromSeconds(20), cancellationToken);
            }
            return result;
        }
    }
}
