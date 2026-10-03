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
    private static LongBeachDbContext Database()=>new(new DbContextOptionsBuilder<LongBeachDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL"))
        .AddInterceptors(new AuditSaveChangesInterceptor(new TestAudit(),TimeProvider.System)).Options,TimeProvider.System);
    private sealed class TestAudit:IAuditContext
    {public Guid? UserId=>null;public string? IpAddress=>null;public string? UserAgent=>null;public string CorrelationId=>"bar-postgres-test";}
}
