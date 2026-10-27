using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Bar;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.IntegrationTests;
public class SingleBarCashPostgresTests
{
    [PostgresFact]
    public async Task Automatic_cash_preserves_ownership_history_and_idempotency()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var location = await db.Set<StockLocation>().SingleAsync(x=>x.Name=="Bar");
        var service = new BarCashService(db); var actor = Guid.NewGuid(); var other = Guid.NewGuid();
        var input = new OpenCashInput(Guid.Empty,location.Id,"Atendimento",20,Guid.NewGuid());
        var first = await service.Open(input,actor,default);
        Assert.Equal(first.Id,(await service.Open(input,actor,default)).Id);
        Assert.Equal("Caixa do Bar",(await db.Set<CashRegister>().SingleAsync()).Name);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.CreateRegister("Outro",default));
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Open(input with {OperationId=Guid.NewGuid()},other,default));
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Move(first.Id,new(1,"Troco",Guid.NewGuid()),"Supply",other,default));
        await service.Close(first.Id,new(20,null,Guid.NewGuid(),20),actor,false,default);
        var second = await service.Open(input with {RegisterId=Guid.NewGuid(),OperationId=Guid.NewGuid()},other,default);
        Assert.Equal(first.RegisterId,second.RegisterId);
        Assert.Equal(other,second.OpenedBy);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Reopen(first.Id,"Conferência",actor,Guid.NewGuid(),default));
        Assert.Equal(2,await db.Set<CashSession>().CountAsync());
        Assert.Equal(1,await db.Set<CashRegister>().CountAsync());
    }
    [PostgresFact]
    public async Task Concurrent_opening_confirms_only_one_responsible()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var location = await db.Set<StockLocation>().SingleAsync(x=>x.Name=="Bar");
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var tasks = Enumerable.Range(0,2).Select(async _ => {
            await using var writer = new LongBeach.Infrastructure.Persistence.LongBeachDbContext(
                new DbContextOptionsBuilder<LongBeach.Infrastructure.Persistence.LongBeachDbContext>().UseNpgsql(db.Database.GetConnectionString()).Options,TimeProvider.System);
            await start.Task;
            try { await new BarCashService(writer).Open(new(Guid.Empty,location.Id,"Tablet",0,Guid.NewGuid()),Guid.NewGuid(),default); return true; }
            catch(BarRuleException) { return false; }
        }).ToArray();
        start.SetResult(); var results=await Task.WhenAll(tasks);
        Assert.Single(results,x=>x);
        Assert.Equal(1,await db.Set<CashSession>().CountAsync(x=>x.State=="Open"));
        Assert.Equal(1,await db.Set<CashRegister>().CountAsync());
    }

}
