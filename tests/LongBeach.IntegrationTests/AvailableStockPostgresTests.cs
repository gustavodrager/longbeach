using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.IntegrationTests;
public class AvailableStockPostgresTests
{
    [PostgresFact]
    public async Task Available_correction_preserves_reservations_and_replays_without_duplicate_movement()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var db=isolated.Context;
        var category=new BarProductCategory("Bebidas");var p=new BarProduct("TEST","Água","Água",category.Id,"un","cx",12,5,2,0,true,false,0);
        var b=new StockBalance(p.Id,StockModel.Bar);var initial=new StockMovement(b,10,2,"InitialCount","Teste",Guid.NewGuid(),Guid.NewGuid());b.Reserve(3);
        db.AddRange(category,p,b,initial);await db.SaveChangesAsync();var service=new BarStockService(db);var actor=Guid.NewGuid();
        var input=new AvailableStockInput(p.Id,StockModel.Bar,5,b.Version,Guid.NewGuid());
        await service.SetAvailable(input,actor,default);await service.SetAvailable(input,actor,default);
        await db.Entry(b).ReloadAsync();Assert.Equal(5,b.Available);Assert.Equal(3,b.Reserved);Assert.Equal(8,b.Quantity);
        Assert.Single(await db.Set<StockMovement>().Where(x=>x.OriginId==input.OperationId).ToListAsync());
        await Assert.ThrowsAsync<BarRuleException>(()=>service.SetAvailable(input with{Available=4},actor,default));
        await Assert.ThrowsAsync<BarRuleException>(()=>service.SetAvailable(input with{OperationId=Guid.NewGuid()},actor,default));
        var current=await db.Set<StockBalance>().SingleAsync(x=>x.Id==b.Id);
        await service.SetAvailable(input with{Available=0,ExpectedVersion=current.Version,OperationId=Guid.NewGuid()},actor,default);
        var final=await db.Set<StockBalance>().AsNoTracking().SingleAsync(x=>x.Id==b.Id);Assert.Equal(0,final.Available);Assert.Equal(3,final.Quantity);
    }
    [PostgresFact]
    public async Task Missing_balance_accepts_decimal_and_zero_rejects_invalid_quantity()
    {
        await using var isolated=await IsolatedBarDatabase.Create();var db=isolated.Context;
        var c=new BarProductCategory("Insumos");var p=new BarProduct("TEST","Insumo","Insumo",c.Id,"kg","kg",1,5,2,0,true,false,0);
        db.AddRange(c,p);await db.SaveChangesAsync();var service=new BarStockService(db);var actor=Guid.NewGuid();
        var input=new AvailableStockInput(p.Id,StockModel.Bar,1.125m,0,Guid.NewGuid());
        await service.SetAvailable(input,actor,default);Assert.Equal(1.125m,(await db.Set<StockBalance>().SingleAsync()).Available);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.SetAvailable(input with{Available=-1},actor,default));
        await Assert.ThrowsAsync<BarRuleException>(()=>service.SetAvailable(input with{Available=1.1234m},actor,default));
    }
}
