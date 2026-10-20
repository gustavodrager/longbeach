using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.IntegrationTests;
public class ProductStockPostgresTests
{
    [PostgresFact]
    public async Task Saves_atomically_preserves_reservations_and_replays_once()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var db=isolated.Context;
        var c=new BarProductCategory("Bebidas");var p=new BarProduct("TEST","Água","Água",c.Id,"un","cx",12,5,2,0,true,false,0);
        var b=new StockBalance(p.Id,StockModel.Bar);b.Move(10);b.Reserve(3);db.AddRange(c,p,b);await db.SaveChangesAsync();
        var service=new BarCatalogService(db);var actor=Guid.NewGuid();
        var product=new ProductInput(p.Code,"Água nova","Água",c.Id,"un","cx",12,6,2,0,true,false,0,Version:p.Version);
        var input=new ProductStockInput(product,5,b.Version,Guid.NewGuid());
        await service.SaveProductStock(p.Id,input,actor,default);await service.SaveProductStock(p.Id,input,actor,default);
        db.ChangeTracker.Clear();var saved=await db.Set<BarProduct>().SingleAsync(x=>x.Id==p.Id);var balance=await db.Set<StockBalance>().SingleAsync();
        Assert.Equal(6,saved.SalePrice);Assert.Equal(5,balance.Available);Assert.Equal(3,balance.Reserved);
        Assert.Single(await db.Set<StockMovement>().Where(x=>x.OriginId==input.OperationId).ToListAsync());
        await Assert.ThrowsAsync<BarRuleException>(()=>service.SaveProductStock(p.Id,input with {OperationId=Guid.NewGuid(),Product=product with{Version=saved.Version,SalePrice=99}},actor,default));
        db.ChangeTracker.Clear();Assert.Equal(6,(await db.Set<BarProduct>().SingleAsync()).SalePrice);
        // Invalid product must roll back the stock movement staged before validation.
        await Assert.ThrowsAsync<BarRuleException>(()=>service.SaveProductStock(p.Id,input with{OperationId=Guid.NewGuid(),StockVersion=balance.Version,Available=9,Product=product with{Version=saved.Version,Name=""}},actor,default));
        db.ChangeTracker.Clear();Assert.Equal(5,(await db.Set<StockBalance>().SingleAsync()).Available);
        Assert.Single(await db.Set<StockMovement>().ToListAsync());
    }
}
