using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
namespace LongBeach.IntegrationTests;
public sealed class BarRecipesPostgresTests
{
    [PostgresFact]
    public async Task Accepted_recipe_version_freezes_purchase_conversion_and_delivers_ingredients_once()
    {
        await using var f=await Fixture.Create(); var recipe=await f.Save(0.5m,"Purchase",2); Assert.Equal(6,Assert.Single(recipe.Ingredients).StockQuantity);
        var tab=await f.Open(); tab=await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Prepared.Id,2)],true),f.Actor,null,default); var item=Assert.Single(tab.Items);
        Assert.Equal("Accepted",item.State); Assert.Equal(6,(await f.Balance(f.Ingredient)).Reserved); Assert.Equal(0,(await f.Balance(f.Prepared)).Reserved);
        var snapshot=Assert.Single(await f.Db.Set<BarTabIngredientSnapshot>().Where(x=>x.ItemId==item.Id).ToListAsync()); Assert.Equal(recipe.Id,snapshot.RecipeId); Assert.Equal(6,snapshot.Quantity); Assert.Equal(2,snapshot.UnitCost);
        f.Ingredient.Change(f.Ingredient.Name,f.Ingredient.ShortName,f.Ingredient.CategoryId,"un","cx",24,10,8,0,true,false,0,true); await f.Db.SaveChangesAsync();
        var later=await f.Save(1,"Purchase",2); Assert.Equal(2,later.Version); Assert.Equal(24,Assert.Single(later.Ingredients).StockQuantity);
        var deliver=new TabActionInput(Guid.NewGuid()); await f.Tabs.ItemAction(tab.Id,item.Id,"fulfill",deliver,f.Actor,false,default); await f.Tabs.ItemAction(tab.Id,item.Id,"fulfill",deliver,f.Actor,false,default);
        Assert.Equal(18,(await f.Balance(f.Ingredient)).Quantity); Assert.Equal(10,(await f.Balance(f.Prepared)).Quantity);
        Assert.Equal(1,await f.Db.Set<StockMovement>().CountAsync(x=>x.OriginId==item.Id&&x.Kind=="TabDelivery"));
        await f.Tabs.Pay(tab.Id,new(Guid.NewGuid(),"Cash",50,f.Session.Id),f.Actor,null,default);
        Assert.Equal(18,(await f.Balance(f.Ingredient)).Quantity);
        var management=Assert.Single((await f.Tabs.Get(tab.Id,true,default)).Items); Assert.Equal(recipe.Id,management.RecipeId); Assert.Equal(1,management.RecipeVersion); Assert.Equal(6,management.UnitCost);
        Assert.Null(Assert.Single((await f.Tabs.Get(tab.Id,false,default)).Items).RecipeId);
        Assert.Equal(12,Assert.Single((await f.Tabs.Recipe(recipe.Id,default)).Ingredients).ConversionFactor);
    }
    [PostgresFact]
    public async Task Qr_request_reserves_nothing_and_acceptance_uses_the_current_version()
    {
        await using var f=await Fixture.Create(); await f.Save(3,"Sale",1); var tab=await f.Open(); var access=await f.Tabs.IssueAccess(tab.Id,new(Guid.NewGuid()),f.Actor,default);
        tab=await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Prepared.Id,1)],true),null,access.Token,default); var item=Assert.Single(tab.Items); Assert.Equal("Requested",item.State);
        Assert.Equal(0,(await f.Balance(f.Ingredient)).Reserved); Assert.False(await f.Db.Set<BarTabIngredientSnapshot>().AnyAsync(x=>x.ItemId==item.Id)); Assert.Equal(0,tab.Total);
        var current=await f.Save(4,"Sale",1); await f.Tabs.ItemAction(tab.Id,item.Id,"accept",new(Guid.NewGuid()),f.Actor,false,default);
        var snapshot=await f.Db.Set<BarTabIngredientSnapshot>().SingleAsync(x=>x.ItemId==item.Id); Assert.Equal(current.Id,snapshot.RecipeId); Assert.Equal(4,snapshot.Quantity); Assert.Equal(4,(await f.Balance(f.Ingredient)).Reserved);
    }
    [PostgresFact]
    public async Task Release_and_physical_return_use_the_accepted_snapshot_even_after_recipe_changes()
    {
        await using var f=await Fixture.Create(); await f.Save(3,"Sale",1); var tab=await f.Open(); tab=await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Prepared.Id,1)]),f.Actor,null,default); var original=Assert.Single(tab.Items);
        await f.Save(9,"Sale",1); await f.Tabs.ItemAction(tab.Id,original.Id,"reverse",new(Guid.NewGuid(),"Pedido cancelado"),f.Actor,true,default); Assert.Equal(0,(await f.Balance(f.Ingredient)).Reserved); Assert.Equal(24,(await f.Balance(f.Ingredient)).Quantity);
        tab=await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Prepared.Id,1)]),f.Actor,null,default); var item=tab.Items.Single(x=>x.State=="Accepted");
        await f.Tabs.ItemAction(tab.Id,item.Id,"fulfill",new(Guid.NewGuid()),f.Actor,false,default); Assert.Equal(15,(await f.Balance(f.Ingredient)).Quantity);
        await f.Save(1,"Sale",1); var reverse=new TabActionInput(Guid.NewGuid(),"Devolução dos insumos",true);
        await f.Tabs.ItemAction(tab.Id,item.Id,"reverse",reverse,f.Actor,true,default); await f.Tabs.ItemAction(tab.Id,item.Id,"reverse",reverse,f.Actor,true,default);
        Assert.Equal(24,(await f.Balance(f.Ingredient)).Quantity); Assert.Equal(1,await f.Db.Set<StockMovement>().CountAsync(x=>x.OriginId==item.Id&&x.Kind=="TabReturn"));
    }
    [PostgresFact]
    public async Task Recipes_are_append_only_replay_once_and_failed_acceptance_leaves_no_partial_reservation()
    {
        await using var f=await Fixture.Create(); var input=new SaveRecipeInput(Guid.NewGuid(),f.Prepared.Id,1,"Versão inicial",[new(f.Ingredient.Id,1)]);
        var recipe=await f.Tabs.SaveRecipe(input,f.Actor,default); Assert.Equal(recipe.Id,(await f.Tabs.SaveRecipe(input,f.Actor,default)).Id);
        await Assert.ThrowsAsync<BarRuleException>(()=>f.Tabs.SaveRecipe(input with {YieldQuantity=2},f.Actor,default));
        var tab=await f.Open(); var access=await f.Tabs.IssueAccess(tab.Id,new(Guid.NewGuid()),f.Actor,default); tab=await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Prepared.Id,1)]),null,access.Token,default); var item=Assert.Single(tab.Items);
        await f.Save(25,"Sale",1); await Assert.ThrowsAsync<BarRuleException>(()=>f.Tabs.ItemAction(tab.Id,item.Id,"accept",new(Guid.NewGuid()),f.Actor,false,default));
        Assert.Equal(0,(await f.Balance(f.Ingredient)).Reserved); Assert.False(await f.Db.Set<BarTabIngredientSnapshot>().AnyAsync(x=>x.ItemId==item.Id)); Assert.Equal("Requested",Assert.Single((await f.Tabs.Get(tab.Id,false,default)).Items).State);
        Assert.Equal(2,(await f.Tabs.Recipes(f.Prepared.Id,1,1,default)).Total);
        await Assert.ThrowsAsync<Npgsql.PostgresException>(()=>f.Db.Database.ExecuteSqlInterpolatedAsync($"UPDATE bar_recipe_versions SET \"YieldQuantity\" = 10 WHERE \"Id\" = {recipe.Id}"));
    }
    [PostgresFact]
    public async Task Catalog_availability_comes_from_ingredients_and_legacy_preparation_keeps_own_stock()
    {
        await using var f=await Fixture.Create(); await f.Save(0.5m,"Purchase",2);
        var catalog=await f.Tabs.Catalog(f.Location.Id,default); Assert.Equal(8,catalog.Single(x=>x.Id==f.Prepared.Id).Available);
        var tab=await f.Open(); await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Prepared.Id,2)]),f.Actor,null,default); Assert.Equal(6,(await f.Tabs.Catalog(f.Location.Id,default)).Single(x=>x.Id==f.Prepared.Id).Available);
        var legacy=new BarProduct(Guid.NewGuid().ToString(),"Preparado sem receita","Preparado",f.Prepared.CategoryId,"un","cx",1,10,2,0,true,false,0); legacy.SetPreparation(true);
        var balance=new StockBalance(legacy.Id,f.Location.Id); f.Db.AddRange(legacy,balance,new StockMovement(balance,5,2,"Initial","Fixture",Guid.NewGuid(),f.Actor)); await f.Db.SaveChangesAsync();
        var own=await f.Open(); own=await f.Tabs.Add(own.Id,new(Guid.NewGuid(),[new(legacy.Id,1)]),f.Actor,null,default); var item=Assert.Single(own.Items); Assert.Null((await f.Db.Set<BarTabItem>().SingleAsync(x=>x.Id==item.Id)).RecipeId);
        await f.Tabs.ItemAction(own.Id,item.Id,"fulfill",new(Guid.NewGuid()),f.Actor,false,default); Assert.Equal(4,(await f.Balance(legacy)).Quantity);
    }
    [PostgresFact]
    public async Task Zero_price_ingredients_are_hidden_and_not_sold_but_still_compose_a_prepared_product()
    {
        await using var f=await Fixture.Create(); f.Ingredient.Change(f.Ingredient.Name,f.Ingredient.ShortName,f.Ingredient.CategoryId,"un","cx",12,0,2,0,true,false,0,true); await f.Db.SaveChangesAsync();
        await f.Save(3,"Sale",1); var catalog=await f.Tabs.Catalog(f.Location.Id,default);
        Assert.DoesNotContain(catalog,x=>x.Id==f.Ingredient.Id); Assert.Equal(8,catalog.Single(x=>x.Id==f.Prepared.Id).Available);
        var tab=await f.Open(); await Assert.ThrowsAsync<BarRuleException>(()=>f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Ingredient.Id,1)]),f.Actor,null,default));
        Assert.Empty((await f.Tabs.Get(tab.Id,false,default)).Items);
        var access=await f.Tabs.IssueAccess(tab.Id,new(Guid.NewGuid()),f.Actor,default);
        await Assert.ThrowsAsync<BarRuleException>(()=>f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Ingredient.Id,1)]),null,access.Token,default));
        await Assert.ThrowsAsync<BarRuleException>(()=>new BarSalesService(f.Db).Create(new(f.Session.Id,[new(f.Ingredient.Id,1)]),f.Actor,default));
        tab=await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Prepared.Id,1)]),f.Actor,null,default); Assert.Equal(25,tab.Total); Assert.Equal(3,(await f.Balance(f.Ingredient)).Reserved);
    }
    private sealed class Fixture:IAsyncDisposable
    {
        public LongBeachDbContext Db {get;} public BarTabsService Tabs {get;} public Guid Actor {get;}=Guid.NewGuid(); public StockLocation Location {get;}=new("Receita "+Guid.NewGuid()); public BarProduct Prepared {get;} public BarProduct Ingredient {get;} public CashSession Session {get;}
        private Fixture()
        {
            Db=new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).Options,TimeProvider.System);
            var category=new BarProductCategory("Receita "+Guid.NewGuid()); Prepared=new(Guid.NewGuid().ToString(),"Produto preparado","Preparado",category.Id,"un","cx",1,25,0,0,true,false,0); Prepared.SetPreparation(true);
            Ingredient=new(Guid.NewGuid().ToString(),"Ingrediente","Ingrediente",category.Id,"un","cx",12,10,2,0,true,false,0);
            var raw=new StockBalance(Ingredient.Id,Location.Id);var own=new StockBalance(Prepared.Id,Location.Id);var register=new CashRegister("Receita "+Guid.NewGuid());Session=new(register.Id,Location.Id,Actor,"Tablet receita",100);
            Db.AddRange(category,Prepared,Ingredient,Location,register,Session,raw,own,new StockMovement(raw,24,2,"Initial","Fixture",Guid.NewGuid(),Actor),new StockMovement(own,10,0,"Initial","Fixture",Guid.NewGuid(),Actor),CashMovement.Opening(Session,Actor));
            var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"Authentication:Jwt:SigningKey","test-only-signing-key-more-than-thirty-two-chars"}}).Build();Tabs=new(Db,new DisabledGateway(),TimeProvider.System,config);
        }
        public static async Task<Fixture> Create(){var f=new Fixture();await f.Db.Database.MigrateAsync();await f.Db.SaveChangesAsync();return f;}
        public Task<RecipeVersionResponse> Save(decimal quantity,string unit,decimal yield)=>Tabs.SaveRecipe(new(Guid.NewGuid(),Prepared.Id,yield,"Ficha técnica de teste",[new(Ingredient.Id,quantity,unit)]),Actor,default);
        public Task<TabResponse> Open()=>Tabs.Open(new(Guid.NewGuid(),Location.Id),Actor,default);
        public Task<StockBalance> Balance(BarProduct product)=>Db.Set<StockBalance>().SingleAsync(x=>x.ProductId==product.Id&&x.LocationId==Location.Id);
        public ValueTask DisposeAsync()=>Db.DisposeAsync();
    }
    private sealed class DisabledGateway:IPaymentGateway
    {
        public bool Enabled=>false;
        public Task<GatewayPayment> CreatePix(Guid p,Guid o,decimal a,DateTimeOffset e,PixCustomer c,CancellationToken ct)=>throw new NotSupportedException();
        public Task<GatewayPayment> Get(string id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<GatewayPayment> Refund(string id,Guid op,decimal a,CancellationToken ct)=>throw new NotSupportedException();
        public bool VerifyWebhook(byte[] b,IEnumerable<string>s)=>false;
    }
}
