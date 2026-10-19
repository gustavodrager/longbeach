using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Payments;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.IntegrationTests;
public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute(){if(string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")))Skip="PostgreSQL de teste não configurado; CI executa este fluxo com PostgreSQL 17.";}
}
public sealed class BarPostgresTests
{
    [PostgresFact]
    public async Task Products_without_category_share_one_audited_fallback_even_when_saved_concurrently()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var existing = await db.Set<BarProductCategory>().AsNoTracking().SingleOrDefaultAsync(x => x.Name == "Sem categoria");
        var suffix = Guid.NewGuid().ToString("N");
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var saves = Enumerable.Range(0, 6).Select(async index =>
        {
            await start.Task;
            await using var writer = Database();
            var input = new ProductInput("", $"Fallback {suffix} {index}", "Fallback", index % 2 == 0 ? null : Guid.Empty,
                "un", "un", 1, 5, 0, 0, true, false, 0);
            return await new BarCatalogService(writer).SaveProduct(null, input, default);
        }).ToArray();
        start.SetResult();
        var products = await Task.WhenAll(saves);

        var category = Assert.Single(await db.Set<BarProductCategory>().AsNoTracking().Where(x => x.Name == "Sem categoria").ToListAsync());
        Assert.NotEqual(Guid.Empty, category.Id);
        Assert.NotEqual(default, category.CreatedAtUtc);
        Assert.All(products, product => Assert.Equal(category.Id, product.Product.CategoryId));
        Assert.Equal(6, products.Select(x => x.Product.Id).Distinct().Count());
        Assert.Equal(6, await db.Set<BarProduct>().CountAsync(x => x.Name.StartsWith("Fallback " + suffix)));
        if (existing is null)
            Assert.Equal(1, await db.AuditLogs.CountAsync(x => x.Resource == nameof(BarProductCategory) && x.ResourceId == category.Id.ToString() && x.Action == "Added"));
        else
            Assert.Equal(existing.Id, category.Id);

        var inputForReuse = new ProductInput("", "Reuse " + suffix, "Reuse", null, "un", "un", 1, 6, 0, 0, true, false, 0);
        var reused = await new BarCatalogService(db).SaveProduct(null, inputForReuse, default);
        Assert.Equal(category.Id, reused.Product.CategoryId);
        db.ChangeTracker.Clear();
        Assert.Equal(category.Id, (await db.Set<BarProduct>().SingleAsync(x => x.Id == reused.Product.Id)).CategoryId);
        Assert.Equal(1, await db.Set<BarProductCategory>().CountAsync(x => x.Name == "Sem categoria"));
    }

    [PostgresFact]
    public async Task Explicit_product_category_is_preserved_on_edit_and_unknown_category_is_rejected()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var service = new BarCatalogService(db);
        var suffix = Guid.NewGuid().ToString("N");
        var category = await service.CreateCategory(new CategoryInput("Explicit " + suffix), default);
        var input = new ProductInput("", "Explicit " + suffix, "Explicit", category.Id, "un", "un", 1, 5, 0, 0, true, false, 0);
        var created = await service.SaveProduct(null, input, default);
        var edited = await service.SaveProduct(created.Product.Id, input with { Name = "Edited " + suffix, Version = created.Product.Version }, default);
        Assert.Equal(category.Id, edited.Product.CategoryId);
        db.ChangeTracker.Clear();
        Assert.Equal(category.Id, (await db.Set<BarProduct>().SingleAsync(x => x.Id == created.Product.Id)).CategoryId);

        var rejected = input with { Name = "Invalid category " + suffix, CategoryId = Guid.NewGuid() };
        var error = await Assert.ThrowsAsync<BarRuleException>(() => service.SaveProduct(null, rejected, default));
        Assert.Equal("Categoria não encontrada.", error.Message);
        Assert.False(await db.Set<BarProduct>().AnyAsync(x => x.Name == rejected.Name));
    }

    [PostgresFact]
    public async Task Invalid_product_does_not_commit_fallback_category_or_partial_product()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var categoryIdsBefore = await db.Set<BarProductCategory>().Where(x => x.Name == "Sem categoria").Select(x => x.Id).ToListAsync();
        var suffix = Guid.NewGuid().ToString("N");
        var input = new ProductInput("", "Invalid supplier " + suffix, "Invalid supplier", null,
            "un", "un", 1, 5, 0, 0, true, false, 0, MainSupplierId: Guid.NewGuid());
        var error = await Assert.ThrowsAsync<BarRuleException>(() => new BarCatalogService(db).SaveProduct(null, input, default));
        Assert.Equal("Fornecedor principal inexistente.", error.Message);
        var productIds = db.ChangeTracker.Entries<BarProduct>().Where(x => x.Entity.Name == input.Name)
            .Select(x => x.Entity.Id.ToString()).ToArray();

        await using var reloaded = Database();
        Assert.False(await reloaded.Set<BarProduct>().AnyAsync(x => x.Name == input.Name));
        Assert.Equal(categoryIdsBefore, await reloaded.Set<BarProductCategory>().Where(x => x.Name == "Sem categoria").Select(x => x.Id).ToListAsync());
        Assert.False(await reloaded.AuditLogs.AnyAsync(x => x.Resource == nameof(BarProduct) && x.ResourceId != null && productIds.Contains(x.ResourceId)));
    }

    [PostgresFact]
    public async Task Product_code_is_automatic_unique_and_preserved_when_editing()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var service = new BarCatalogService(db);
        var category = await service.CreateCategory(new CategoryInput("Auto code " + Guid.NewGuid()), default);
        var input = new ProductInput("", "Produto automático", "Produto", category.Id, "un", "un", 1, 5, 0, 0, true, false, 0);
        var first = await service.SaveProduct(null, input, default);
        var second = await service.SaveProduct(null, input, default);
        Assert.StartsWith("LB-", first.Product.Code);
        Assert.NotEqual(first.Product.Code, second.Product.Code);
        var edited = await service.SaveProduct(first.Product.Id, input with { Name = "Novo nome", Version = first.Product.Version }, default);
        Assert.Equal(first.Product.Code, edited.Product.Code);
        db.ChangeTracker.Clear();
        Assert.Equal(first.Product.Code, (await db.Set<BarProduct>().SingleAsync(x => x.Id == first.Product.Id)).Code);
    }

    [PostgresFact]
    public async Task Stock_valuation_reads_received_costs_reservations_and_missing_initial_cost_without_writes()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var actor = Guid.NewGuid(); var suffix = Guid.NewGuid().ToString("N");
        var category = new BarProductCategory("Valuation " + suffix); db.Add(category);
        var known = new BarProduct("value-" + suffix[..8], "Known " + suffix, "Known", category.Id, "un", "un", 1, 18, 0, 0, true, false, 0);
        var mixed = new BarProduct("mixed-" + suffix[..8], "Mixed " + suffix, "Mixed", category.Id, "un", "un", 1, 8, 0, 0, true, false, 0);
        var other = new BarProduct("other-" + suffix[..8], "Other " + suffix, "Other", category.Id, "un", "un", 1, 10, 5, 0, true, false, 0);
        db.AddRange(known, mixed, other);
        var mixedBalance = new StockBalance(mixed.Id, StockModel.Bar); db.Add(mixedBalance);
        db.Add(new StockMovement(mixedBalance, 2, 0, "InitialCount", "Uncosted opening", Guid.NewGuid(), actor));
        var elsewhere = new StockBalance(other.Id, StockModel.Warehouse); elsewhere.Move(5); db.Add(elsewhere);
        await db.SaveChangesAsync();
        var purchases = new BarPurchasesService(db); var supplier = await purchases.CreateSupplier("Valuation supplier " + suffix, default);
        var purchase = await purchases.Create(new PurchaseInput(supplier.Id, "Value " + suffix, [new(known.Id, 24, 6.25m, 149.90m), new(mixed.Id, 6, 4.5m)]), actor, default);
        await purchases.Receive(purchase.Id, new ReceiptInput(StockModel.Bar, Guid.NewGuid(), [new(known.Id, 24), new(mixed.Id, 6)]), actor, default);
        (await db.Set<StockBalance>().SingleAsync(b => b.ProductId == known.Id && b.LocationId == StockModel.Bar)).Reserve(4);
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var countBefore = await db.Set<StockMovement>().CountAsync(m => m.ProductId == known.Id || m.ProductId == mixed.Id);
        var response = await new BarStockService(db).Valuation(default);
        var row = response.Rows.Single(r => r.ProductId == known.Id);
        Assert.Equal(149.90m, row.StockCost); Assert.Equal(20m, row.Available); Assert.Equal(360m, row.SalePotential);
        Assert.Equal(235.08m, row.GrossProfit); Assert.Equal("registered", row.CostStatus);
        var incomplete = response.Rows.Single(r => r.ProductId == mixed.Id);
        Assert.Equal("incomplete", incomplete.CostStatus); Assert.Null(incomplete.GrossProfit); Assert.Equal(27m, incomplete.StockCost);
        Assert.DoesNotContain(response.Rows, r => r.ProductId == other.Id);
        Assert.Equal(countBefore, await db.Set<StockMovement>().CountAsync(m => m.ProductId == known.Id || m.ProductId == mixed.Id));
        Assert.Empty(db.ChangeTracker.Entries());
    }
    [PostgresFact]
    public async Task Purchase_total_survives_reload_and_payment_correction_is_audited_without_new_receipts()
    {
        await using var db=Database();await db.Database.MigrateAsync();var suffix=Guid.NewGuid().ToString("N");var actor=Guid.NewGuid();
        var catalog=new BarCatalogService(db);var service=new BarPurchasesService(db);var stock=new BarStockService(db);
        var category=await catalog.CreateCategory(new CategoryInput("Purchase test "+suffix),default);
        var managed=await catalog.SaveProduct(null,new ProductInput(suffix,"Test pack units","Test",category.Id,"un","un",1,10,0,0,true,false,0),default);
        var supplier=await service.CreateSupplier("Supplier "+suffix,default);var location=await stock.CreateLocation(new LocationInput("Receipt "+suffix),default);
        var purchase=await service.Create(new PurchaseInput(supplier.Id,"Test "+suffix,[new PurchaseItemInput(managed.Product.Id,24,4.17m,100m)],PaymentMethod:"Pix",AccountReference:"Owner test"),actor,default);
        var id=purchase.Id;db.ChangeTracker.Clear();
        await service.Receive(id,new ReceiptInput(location.Id,Guid.NewGuid(),[new ReceiptItemInput(managed.Product.Id,24)]),actor,default);
        db.ChangeTracker.Clear();
        var saved=await db.Set<LongBeach.Domain.Purchases.Purchase>().AsNoTracking().Include(x=>x.Items).SingleAsync(x=>x.Id==id);
        Assert.Equal(100m,saved.Total);Assert.Equal(100m,saved.Items.Single().CostReceived);
        var corrected=await service.CorrectPaymentReference(id,new PurchasePaymentReferenceInput("Pix","Arena account",saved.Version),default);
        Assert.Equal("Received",corrected.State);Assert.Equal(100m,corrected.Total);Assert.Equal("Arena account",corrected.AccountReference);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.CorrectPaymentReference(id,new PurchasePaymentReferenceInput("Cash","Stale",saved.Version),default));
        Assert.Equal(1,await db.Set<LongBeach.Domain.Purchases.PurchaseReceipt>().CountAsync(x=>x.PurchaseId==id));
        Assert.Equal(24m,(await db.Set<StockBalance>().SingleAsync(x=>x.ProductId==managed.Product.Id&&x.LocationId==location.Id)).Quantity);
        var audits=await db.AuditLogs.Where(x=>x.Resource=="Purchase"&&x.ResourceId==id.ToString()&&x.Action=="Modified").Select(x=>x.MetadataJson).ToListAsync();
        var reference=audits.Select(x=>JsonSerializer.Deserialize<JsonElement>(x)).Single(x=>x.TryGetProperty("AccountReference",out _)).GetProperty("AccountReference");
        Assert.Equal("Owner test",reference.GetProperty("Before").GetString());Assert.Equal("Arena account",reference.GetProperty("After").GetString());
    }
    [PostgresFact]
    public async Task Physical_count_manual_sale_receipt_and_refund_preserve_ledger_and_idempotency()
    {
        await using var db=Database();await db.Database.MigrateAsync();var actor=Guid.NewGuid();var suffix=Guid.NewGuid().ToString("N");
        var catalog=new BarCatalogService(db);var stock=new BarStockService(db);var cash=new BarCashService(db);var sales=new BarSalesService(db);var purchases=new BarPurchasesService(db);
        var category=await catalog.CreateCategory(new CategoryInput("Categoria "+suffix),default);
        var managed=await catalog.SaveProduct(null,new ProductInput(suffix,"Água teste","Água",category.Id,"un","cx",24,10,6,5,true,false,0),default);var product=managed.Product;
        var location=await stock.CreateLocation(new LocationInput("Local "+suffix),default);
        var count=await stock.CreateCount(new CountInput(location.Id,true),actor,default);
        foreach(var item in count.Items.ToArray()) await stock.Count(count.Id,new CountItemInput(item.ProductId,item.ProductId==product.Id?20:0),default);
        await stock.Approve(count.Id,"Contagem física",actor,default);
        var register=await cash.CreateRegister("Caixa "+suffix,default);var session=await cash.Open(new OpenCashInput(register.Id,location.Id,"tablet",100),actor,default);
        var sale=await sales.Create(new SaleInput(session.Id,[new SaleItemInput(product.Id,2)]),actor,default);var id=JsonSerializer.SerializeToElement(sale).GetProperty("Id").GetGuid();var payment=new ManualPaymentInput(Guid.NewGuid(),20,null);
        await sales.Pay(id,payment,"Cash",actor,default);await sales.Pay(id,payment,"Cash",actor,default);
        Assert.Equal(18,(await db.Set<StockBalance>().SingleAsync(x=>x.ProductId==product.Id&&x.LocationId==location.Id)).Quantity);
        Assert.Equal(1,await db.Set<StockMovement>().CountAsync(x=>x.OriginId==id&&x.Kind=="Sale"));Assert.Equal(1,await db.Set<BarPayment>().CountAsync(x=>x.SaleId==id));
        var supplier=await purchases.CreateSupplier("Fornecedor "+suffix,default);var purchase=await purchases.Create(new PurchaseInput(supplier.Id,"NF "+suffix,[new PurchaseItemInput(product.Id,1,192)]),actor,default);
        var receipt=new ReceiptInput(location.Id,Guid.NewGuid(),[new ReceiptItemInput(product.Id,1)]);await purchases.Receive(purchase.Id,receipt,actor,default);await purchases.Receive(purchase.Id,receipt,actor,default);
        Assert.Equal(42,(await db.Set<StockBalance>().SingleAsync(x=>x.ProductId==product.Id&&x.LocationId==location.Id)).Quantity);
        Assert.Equal(12,(await db.Set<BarSale>().SingleAsync(x=>x.Id==id)).Cost);
        await sales.Refund(id,new RefundInput("Devolução sem retorno físico",false),actor,default);
        Assert.Equal(42,(await db.Set<StockBalance>().SingleAsync(x=>x.ProductId==product.Id&&x.LocationId==location.Id)).Quantity);
        Assert.True(await db.AuditLogs.AnyAsync(x=>x.Resource==nameof(StockMovement)));
    }
    [PostgresFact]
    public async Task Cash_history_pages_before_limit_and_details_preserve_closing_and_movements()
    {
        await using var db=Database(); await db.Database.MigrateAsync();
        var suffix=Guid.NewGuid().ToString("N"); var actor=LongBeach.Domain.Identity.User.Create("Cash "+suffix,suffix+"@example.invalid","test-only"); db.Add(actor);
        var register=new LongBeach.Domain.Cash.CashRegister("Register "+suffix); var location=new StockLocation("Cash "+suffix); db.AddRange(register,location); await db.SaveChangesAsync();
        var service=new BarCashService(db); var session=await service.Open(new(register.Id,location.Id,"Turno",100,Guid.NewGuid()),actor.Id,default);
        for(var i=0;i<105;i++){var old=new LongBeach.Domain.Cash.CashSession(register.Id,location.Id,actor.Id,"History",0);old.Close();db.Add(old);} await db.SaveChangesAsync();
        var page=await service.History(suffix,null,1,default); Assert.Equal(106,page.Total);Assert.Equal(session.Id,page.Items[0].Id);Assert.Equal(20,page.Items.Count);
        Assert.Single((await service.History(suffix,"open",1,default)).Items);Assert.Equal(5,(await service.History(suffix,"closed",6,default)).Items.Count);
        var move=new CashMovementInput(25,"Troco teste",Guid.NewGuid());await service.Move(session.Id,move,"Supply",actor.Id,default);await service.Move(session.Id,move,"Supply",actor.Id,default);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Move(session.Id,new(1,"Outro operador",Guid.NewGuid()),"Supply",Guid.NewGuid(),default));
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Close(session.Id,new(120,"Saldo desatualizado",Guid.NewGuid(),100),actor.Id,true,default));
        await service.Close(session.Id,new(120,"Diferença conferida",Guid.NewGuid(),125),actor.Id,true,default);
        var details=await service.Details(session.Id,default);Assert.Single(details.Movements,x=>x.Kind=="Supply");var closing=Assert.Single(details.Closings);Assert.Equal(125,closing.Expected);Assert.Equal(-5,closing.Difference);Assert.False(details.PendingPayment);
        await service.Reopen(session.Id,"Reabrir teste",actor.Id,Guid.NewGuid(),default);Assert.Equal(4,(await service.Details(session.Id,default)).Movements.Count);
    }
    private static LongBeachDbContext Database()=>new(new DbContextOptionsBuilder<LongBeachDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL"))
        .AddInterceptors(new AuditSaveChangesInterceptor(new TestAudit(),TimeProvider.System)).Options,TimeProvider.System);
    private sealed class TestAudit:IAuditContext
    {public Guid? UserId=>null;public string? IpAddress=>null;public string? UserAgent=>null;public string CorrelationId=>"bar-postgres-test";}
}
