using System.Data;
using System.Data.Common;
using System.Text.Json;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Purchases;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;

namespace LongBeach.IntegrationTests;

public sealed class ProductAvailabilityPostgresTests
{
    [PostgresFact]
    public async Task Availability_filters_sale_catalogs_and_legacy_edits_preserve_hidden_state()
    {
        await using var f = await Fixture.Create(); var p = f.Product; var input = Input(p);
        var hiddenCreation = await f.Catalog.SaveProduct(null, input with { Code = "NEW-HIDDEN", Version = null, AvailableForSale = false }, default);
        Assert.False((await f.Db.Set<BarProduct>().AsNoTracking().SingleAsync(x => x.Id == hiddenCreation.Product.Id)).AvailableForSale);
        var hidden = await f.Catalog.SaveProduct(p.Id, input with { AvailableForSale = false }, default);
        Assert.False(hidden.Product.AvailableForSale); Assert.True(hidden.Product.Active);
        Assert.Contains(await f.Catalog.Products(default), x => x.Product.Id == p.Id && !x.Product.AvailableForSale);
        Assert.DoesNotContain(await f.Catalog.Catalog(default), x => x.Id == p.Id);
        Assert.DoesNotContain(await f.Tabs.Catalog(StockModel.Bar, default), x => x.Id == p.Id);
        var legacy = await f.Catalog.SaveProduct(p.Id, input with { Version = hidden.Product.Version, Name = "Nome atualizado" }, default);
        Assert.False(legacy.Product.AvailableForSale);
        await f.Catalog.SaveProduct(p.Id, input with { Version = legacy.Product.Version, AvailableForSale = true }, default);
        Assert.Contains(await f.Catalog.Catalog(default), x => x.Id == p.Id);
        Assert.Contains(await f.Tabs.Catalog(StockModel.Bar, default), x => x.Id == p.Id);
    }

    [PostgresFact]
    public async Task Hidden_products_reject_direct_sales_and_new_Qr_or_operator_requests()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open(); var access = await f.Tabs.IssueAccess(tab.Id, new(Guid.NewGuid()), f.Actor, default);
        f.Product.SetSaleAvailability(false); await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1)]), f.Actor, null, default));
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1)]), null, access.Token, default));
        await Assert.ThrowsAsync<BarRuleException>(() => new BarSalesService(f.Db).Create(new(f.Session.Id, [new(f.Product.Id, 1)]), f.Actor, default));
        Assert.Empty(await f.Db.Set<BarTabItem>().ToListAsync()); Assert.Empty(await f.Db.Set<BarSale>().ToListAsync());
    }

    [PostgresFact]
    public async Task Hiding_after_acceptance_keeps_delivery_payment_and_replay_valid_but_blocks_new_acceptance()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open();
        var add = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1)]);
        var accepted = await f.Tabs.Add(tab.Id, add, f.Actor, null, default); var item = Assert.Single(accepted.Items);
        var qrTab = await f.Open(); var access = await f.Tabs.IssueAccess(qrTab.Id, new(Guid.NewGuid()), f.Actor, default);
        var requested = await f.Tabs.Add(qrTab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1)]), null, access.Token, default);
        f.Product.SetSaleAvailability(false); await f.Db.SaveChangesAsync();
        Assert.Equal(item.Id, Assert.Single((await f.Tabs.Add(tab.Id, add, f.Actor, null, default)).Items).Id);
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.ItemAction(qrTab.Id, Assert.Single(requested.Items).Id, "accept", new(Guid.NewGuid()), f.Actor, false, default));
        await f.Tabs.ItemAction(tab.Id, item.Id, "fulfill", new(Guid.NewGuid()), f.Actor, false, default);
        var payment = new TabPaymentInput(Guid.NewGuid(), "Cash", 5, f.Session.Id);
        await f.Tabs.Pay(tab.Id, payment, f.Actor, null, default); await f.Tabs.Pay(tab.Id, payment, f.Actor, null, default);
        Assert.Equal(1, await f.Db.Set<StockMovement>().CountAsync(x => x.OriginId == item.Id && x.Kind == "TabDelivery"));
    }

    [PostgresFact]
    public async Task Hidden_positive_price_ingredient_remains_available_for_prepared_products()
    {
        await using var f = await Fixture.Create();
        f.Product.SetSaleAvailability(false);
        var prepared = new BarProduct("PREP", "Preparado", "Preparado", f.Product.CategoryId, "un", "un", 1, 10, 0, 0, true, false, 0); prepared.SetPreparation(true);
        f.Db.Add(prepared); await f.Db.SaveChangesAsync();
        await f.Tabs.SaveRecipe(new(Guid.NewGuid(), prepared.Id, 1, "Receita de teste", [new(f.Product.Id, 2)]), f.Actor, default);
        var catalog = await f.Tabs.Catalog(StockModel.Bar, default);
        Assert.DoesNotContain(catalog, x => x.Id == f.Product.Id); Assert.Equal(5, catalog.Single(x => x.Id == prepared.Id).Available);
        var tab = await f.Open(); var added = await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(prepared.Id, 1)]), f.Actor, null, default);
        Assert.Equal("Accepted", Assert.Single(added.Items).State);
        Assert.Equal(2, (await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == f.Product.Id)).Reserved);
    }

    [PostgresFact]
    public async Task Legacy_stock_edit_replays_after_visibility_changes_without_changing_current_product()
    {
        await using var f = await Fixture.Create(); var id = f.Product.Id;
        var input = new ProductStockInput(Input(f.Product), null, null, Guid.NewGuid());
        var p = f.Product;
        var first = new ManagedProduct(new(p.Id, p.Code, p.Name, p.ShortName, p.CategoryId, p.SaleUnit,
            p.SalePrice, p.ControlsStock, p.MinimumStock, p.Favorite, p.DisplayOrder, p.Active, p.Version),
            p.PurchaseUnit, p.ConversionFactor, p.AverageCost, p.LastCost);
        // Seed a synthetic receipt in the pre-upgrade shape; immutable history
        // is never rewritten to simulate an older deployment.
        var oldJson = JsonSerializer.Serialize(first).Replace(",\"AvailableForSale\":true", "");
        var actor = f.Actor;
        var fingerprint = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { action = "productStock", id, input, actor }))));
        f.Db.Add(new BarTabOperation(input.OperationId, fingerprint, oldJson)); await f.Db.SaveChangesAsync();
        f.Product.SetSaleAvailability(false); await f.Db.SaveChangesAsync(); f.Db.ChangeTracker.Clear();
        var replay = await f.Catalog.SaveProductStock(id, input, f.Actor, default);
        Assert.Equal(first.Product.Id, replay.Product.Id); Assert.True(replay.Product.AvailableForSale);
        Assert.False((await f.Db.Set<BarProduct>().SingleAsync(x => x.Id == id)).AvailableForSale);
        Assert.Single(await f.Db.Set<BarTabOperation>().ToListAsync());
    }

    [PostgresFact]
    public async Task Delete_is_versioned_logical_idempotent_and_preserves_closed_history()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var product = await Seed(db); var actor = Guid.NewGuid(); var balance = new StockBalance(product.Id, StockModel.Bar);
        db.AddRange(balance, new StockMovement(balance, 1, 2, "Initial", "Teste", Guid.NewGuid(), actor), new StockMovement(balance, -1, 2, "Loss", "Teste", Guid.NewGuid(), actor));
        var tab = new BarTab(StockModel.Bar, actor, "Concluída", "Tab"); var item = new BarTabItem(tab.Id, product, 1, actor, false); item.Accept(DateTimeOffset.UtcNow); item.Fulfill(DateTimeOffset.UtcNow); tab.Close(0, 0, false, DateTimeOffset.UtcNow);
        db.AddRange(tab, item); await db.SaveChangesAsync(); var service = new BarCatalogService(db);
        Assert.Equal(409, (await Assert.ThrowsAsync<BarRuleException>(() => service.DeleteProduct(product.Id, product.Version + 1, default))).StatusCode);
        var version = product.Version; await service.DeleteProduct(product.Id, version, default); await service.DeleteProduct(product.Id, version, default);
        Assert.False(product.Active); Assert.False(product.AvailableForSale); Assert.Equal(version + 1, product.Version);
        Assert.DoesNotContain(await service.Products(default), x => x.Product.Id == product.Id);
        Assert.Equal(2, await db.Set<StockMovement>().CountAsync()); Assert.Equal("Fulfilled", (await db.Set<BarTabItem>().SingleAsync()).State);
        Assert.Equal(404, (await Assert.ThrowsAsync<BarRuleException>(() => service.DeleteProduct(Guid.NewGuid(), 1, default))).StatusCode);
    }

    [PostgresFact]
    public async Task Active_dependencies_block_deletion_and_legacy_deactivation_without_changing_stock()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        foreach (var usage in new[] { "balance", "reservation", "purchase", "count", "sale", "tab", "ingredient" })
        {
            var product = await Seed(db); await AddUsage(db, product, usage); var input = Input(product);
            var service = new BarCatalogService(db);
            Assert.Equal(409, (await Assert.ThrowsAsync<BarRuleException>(() => service.DeleteProduct(product.Id, product.Version, default))).StatusCode);
            Assert.Equal(409, (await Assert.ThrowsAsync<BarRuleException>(() => service.SaveProduct(product.Id, input with { Active = false }, default))).StatusCode);
            db.ChangeTracker.Clear(); var current = await db.Set<BarProduct>().SingleAsync(x => x.Id == product.Id);
            Assert.True(current.Active); Assert.True(current.AvailableForSale); Assert.Equal(input.Version, current.Version);
        }
    }

    [PostgresFact]
    public async Task Migration_preserves_existing_products_defaults_and_refuses_to_discard_hidden_state()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context; var p = await Seed(db);
        var migrator = db.GetService<IMigrator>(); const string previous = "20261104173051_StaffIndividualAccess";
        p.SetSaleAvailability(false); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => migrator.MigrateAsync(previous));
        Assert.False(await db.Database.SqlQuery<bool>($"SELECT \"AvailableForSale\" AS \"Value\" FROM bar_products WHERE \"Id\" = {p.Id}").SingleAsync());
        p.SetSaleAvailability(true); await db.SaveChangesAsync();
        await migrator.MigrateAsync(previous);
        var before = await db.Database.SqlQuery<string>($"SELECT to_jsonb(p)::text AS \"Value\" FROM bar_products p WHERE \"Id\" = {p.Id}").SingleAsync();
        await migrator.MigrateAsync();
        Assert.Equal(before, await db.Database.SqlQuery<string>($"SELECT (to_jsonb(p)-'AvailableForSale')::text AS \"Value\" FROM bar_products p WHERE \"Id\" = {p.Id}").SingleAsync());
        Assert.True(await db.Database.SqlQuery<bool>($"SELECT \"AvailableForSale\" AS \"Value\" FROM bar_products WHERE \"Id\" = {p.Id}").SingleAsync());
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [PostgresFact]
    public async Task Purchases_accept_hidden_ingredients_but_reject_archived_products()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var ingredient = await Seed(db); ingredient.SetSaleAvailability(false);
        var archived = await Seed(db); var supplier = new Supplier("Fornecedor fictício"); db.Add(supplier); await db.SaveChangesAsync();
        await new BarCatalogService(db).DeleteProduct(archived.Id, archived.Version, default);
        var purchases = new BarPurchasesService(db); var actor = Guid.NewGuid();
        var accepted = await purchases.Create(new(supplier.Id, "Ingrediente", [new(ingredient.Id, 2, 2)]), actor, default);
        Assert.Equal(ingredient.Id, Assert.Single(accepted.Items).ProductId);
        await Assert.ThrowsAsync<BarRuleException>(() => purchases.Create(new(supplier.Id, "Excluído", [new(archived.Id, 2, 2)]), actor, default));
        Assert.False(await db.Set<PurchaseItem>().AnyAsync(x => x.ProductId == archived.Id));
    }

    [PostgresFact]
    public async Task Archived_product_preserves_refund_and_replay_but_rejects_new_stock_entries()
    {
        await using var f = await Fixture.Create(); var sales = new BarSalesService(f.Db); var stock = new BarStockService(f.Db);
        var created = await sales.Create(new(f.Session.Id, [new(f.Product.Id, 10)]), f.Actor, default);
        var saleId = JsonSerializer.SerializeToElement(created).GetProperty("Id").GetGuid();
        await sales.Pay(saleId, new(Guid.NewGuid(), 50, null), "Cash", f.Actor, default);
        var balance = await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == f.Product.Id);
        var originalCorrection = new AvailableStockInput(f.Product.Id, StockModel.Bar, 0, balance.Version, Guid.NewGuid());
        await stock.SetAvailable(originalCorrection, f.Actor, default);
        await f.Catalog.DeleteProduct(f.Product.Id, f.Product.Version, default);
        await sales.Refund(saleId, new("Devolução histórica", true), f.Actor, default);
        await stock.SetAvailable(originalCorrection, f.Actor, default);
        await f.Db.Entry(balance).ReloadAsync(); Assert.Equal(10, balance.Quantity);
        Assert.False((await f.Db.Set<BarProduct>().SingleAsync(x => x.Id == f.Product.Id)).Active);
        var extra = new AvailableStockInput(f.Product.Id, StockModel.Bar, 11, balance.Version, Guid.NewGuid());
        Assert.Equal(409, (await Assert.ThrowsAsync<BarRuleException>(() => stock.SetAvailable(extra, f.Actor, default))).StatusCode);
        var product = await f.Db.Set<BarProduct>().SingleAsync(x => x.Id == f.Product.Id);
        Assert.Equal(409, (await Assert.ThrowsAsync<BarRuleException>(() => f.Catalog.SaveProductStock(product.Id,
            new(Input(product), 11, balance.Version, Guid.NewGuid()), f.Actor, default))).StatusCode);
        await stock.Output(new(product.Id, StockModel.Bar, 1, "Correção da devolução", Guid.NewGuid()), "Loss", f.Actor, true, default);
        var current = await f.Db.Set<StockBalance>().SingleAsync(x => x.ProductId == product.Id);
        await stock.SetAvailable(new(product.Id, StockModel.Bar, 5, current.Version, Guid.NewGuid()), f.Actor, default);
        Assert.Equal(5, (await f.Db.Set<StockBalance>().AsNoTracking().SingleAsync(x => x.ProductId == product.Id)).Quantity);
        Assert.Single(await f.Db.Set<StockMovement>().Where(x => x.Kind == "SaleReturn").ToListAsync());
    }

    [PostgresFact]
    public async Task Concurrent_first_purchase_and_deletion_cannot_both_commit()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var product = await Seed(db); var supplier = new Supplier("Fornecedor fictício"); db.Add(supplier); await db.SaveChangesAsync();
        var barrier = new ProductReadBarrier();
        await using var purchaser = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>()
            .UseNpgsql(db.Database.GetConnectionString()).AddInterceptors(barrier).Options, TimeProvider.System);
        var pending = new BarPurchasesService(purchaser).Create(new(supplier.Id, "Concorrente", [new(product.Id, 1, 2)]), Guid.NewGuid(), default);
        await barrier.Reached.Task.WaitAsync(TimeSpan.FromSeconds(15));
        Exception? deleteError = null;
        try
        {
            await using var deleting = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>()
                .UseNpgsql(db.Database.GetConnectionString()).Options, TimeProvider.System);
            deleteError = await Record.ExceptionAsync(() => new BarCatalogService(deleting).DeleteProduct(product.Id, product.Version, default));
        }
        finally { barrier.Resume.TrySetResult(); }
        var purchaseError = await Record.ExceptionAsync(async () => await pending);
        Assert.Null(deleteError); Assert.NotNull(purchaseError);
        Assert.True(IsConcurrencyConflict(purchaseError), purchaseError.ToString());
        db.ChangeTracker.Clear();
        Assert.False((await db.Set<BarProduct>().SingleAsync(x => x.Id == product.Id)).Active);
        Assert.False(await db.Set<PurchaseItem>().AnyAsync(x => x.ProductId == product.Id));
    }

    private static bool IsConcurrencyConflict(Exception exception)
    {
        for (Exception? cause = exception; cause is not null; cause = cause.InnerException)
            if (cause is DbUpdateConcurrencyException || cause is Npgsql.PostgresException { SqlState: "40001" or "40P01" }) return true;
        return false;
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
                Reached.TrySetResult(); await Resume.Task.WaitAsync(TimeSpan.FromSeconds(20), cancellationToken);
            }
            return result;
        }
    }

    private static ProductInput Input(BarProduct p) => new(p.Code, p.Name, p.ShortName, p.CategoryId, p.SaleUnit, p.PurchaseUnit, p.ConversionFactor, p.SalePrice, p.AverageCost, p.MinimumStock, p.ControlsStock, p.Favorite, p.DisplayOrder, p.Active, p.Version, Prepared: p.Prepared);
    private static async Task<BarProduct> Seed(LongBeachDbContext db)
    {
        var suffix = Guid.NewGuid().ToString("N"); var category = new BarProductCategory("Teste " + suffix);
        var p = new BarProduct(suffix, "Produto fictício", "Produto", category.Id, "un", "un", 1, 5, 2, 0, true, false, 0);
        db.AddRange(category, p); await db.SaveChangesAsync(); return p;
    }
    private static async Task AddUsage(LongBeachDbContext db, BarProduct p, string usage)
    {
        var actor = Guid.NewGuid();
        switch (usage)
        {
            case "balance": case "reservation":
                var balance = new StockBalance(p.Id, StockModel.Bar); balance.Move(2); if (usage == "reservation") balance.Reserve(1); db.Add(balance); break;
            case "purchase":
                var supplier = new Supplier("Fornecedor fictício"); var purchase = new Purchase(supplier.Id, "Pedido", actor); purchase.Items.Add(new PurchaseItem(purchase.Id, p, 1, 2)); db.AddRange(supplier, purchase); break;
            case "count":
                var count = new InventoryCount(StockModel.Bar, false, actor); count.Items.Add(new InventoryCountItem(count.Id, p.Id, 0, 0, 2)); db.Add(count); break;
            case "sale":
                var register = new CashRegister("Caixa fictício"); var session = new CashSession(register.Id, StockModel.Bar, actor, "Teste", 0); var sale = new BarSale(session.Id, StockModel.Bar, actor); sale.Add(p, 1); db.AddRange(register, session, sale); break;
            case "tab":
                var tab = new BarTab(StockModel.Bar, actor, "Em aberto", "Tab"); db.AddRange(tab, new BarTabItem(tab.Id, p, 1, actor, false)); break;
            case "ingredient":
                var prepared = await Seed(db); prepared.SetPreparation(true); var recipe = new BarRecipeVersion(prepared.Id, prepared.Name, 1, 1, "Receita", actor); recipe.Ingredients.Add(new BarRecipeIngredient(recipe.Id, p, 1, "Sale")); db.Add(recipe); break;
        }
        await db.SaveChangesAsync();
    }
    private sealed class Fixture(IsolatedBarDatabase isolated, BarProduct product, Guid actor, CashSession session) : IAsyncDisposable
    {
        public LongBeachDbContext Db => isolated.Context;
        public BarProduct Product { get; } = product;
        public Guid Actor { get; } = actor;
        public CashSession Session { get; } = session;
        public BarCatalogService Catalog => new(Db);
        public BarTabsService Tabs => new(Db, new DisabledGateway(), TimeProvider.System,
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Authentication:Jwt:SigningKey"] = "synthetic-test-only-signing-key-longer-than-thirty-two-characters" }).Build());
        public static async Task<Fixture> Create()
        {
            var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context; var p = await Seed(db); var actor = Guid.NewGuid();
            var register = new CashRegister("Caixa fictício"); var session = new CashSession(register.Id, StockModel.Bar, actor, "Teste", 0);
            var balance = new StockBalance(p.Id, StockModel.Bar); balance.Move(10); db.AddRange(register, session, balance); await db.SaveChangesAsync();
            return new(isolated, p, actor, session);
        }
        public Task<TabResponse> Open() => Tabs.Open(new(Guid.NewGuid(), StockModel.Bar), Actor, default);
        public ValueTask DisposeAsync() => isolated.DisposeAsync();
    }
    private sealed class DisabledGateway : IPaymentGateway
    {
        public bool Enabled => false;
        public Task<GatewayPayment> CreatePix(Guid p, Guid o, decimal a, DateTimeOffset e, PixCustomer c, CancellationToken ct) => throw new NotSupportedException();
        public Task<GatewayPayment> Get(string id, CancellationToken ct) => throw new NotSupportedException();
        public Task<GatewayPayment> Refund(string id, Guid op, decimal a, CancellationToken ct) => throw new NotSupportedException();
        public bool VerifyWebhook(byte[] b, IEnumerable<string> s) => false;
    }
}
