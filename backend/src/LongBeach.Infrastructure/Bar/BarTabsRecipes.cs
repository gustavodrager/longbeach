using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Bar;
public sealed partial class BarTabsService
{
    public async Task<PageResult<RecipeVersionResponse>> Recipes(Guid? productId,int page,int pageSize,CancellationToken ct)
    {
        (page,pageSize)=Paging(page,pageSize); var query=db.Set<BarRecipeVersion>().AsNoTracking().Where(x=>productId==null||x.ProductId==productId);
        var total=await query.CountAsync(ct); var recipes=await query.Include(x=>x.Ingredients).OrderByDescending(x=>x.CreatedAtUtc).ThenByDescending(x=>x.Version).Skip((page-1)*pageSize).Take(pageSize).ToListAsync(ct);
        return new(recipes.Select(PublicRecipe).ToArray(),page,pageSize,total);
    }
    public async Task<RecipeVersionResponse> Recipe(Guid id,CancellationToken ct)=>PublicRecipe(await db.Set<BarRecipeVersion>().AsNoTracking().Include(x=>x.Ingredients).SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new BarRuleException("Ficha técnica não encontrada."));
    public Task<RecipeVersionResponse> SaveRecipe(SaveRecipeInput input,Guid actor,CancellationToken ct)=>Run(input.OperationId,Hash(new{action="recipe",input,actor}),async()=>
    {
        var product=await db.Set<BarProduct>().FromSqlInterpolated($"SELECT * FROM bar_products WHERE \"Id\" = {input.ProductId} FOR UPDATE").SingleOrDefaultAsync(ct)??throw new BarRuleException("Produto não encontrado.");
        await db.Entry(product).ReloadAsync(ct);
        if(!product.Active||!product.Prepared)throw new BarRuleException("Escolha um produto ativo marcado como preparado.");
        if(input.Ingredients is null||input.Ingredients.Count is 0 or >100||input.Ingredients.Select(x=>x.ProductId).Distinct().Count()!=input.Ingredients.Count)throw new BarRuleException("Informe de 1 a 100 ingredientes, sem repetir produto.");
        var version=(await db.Set<BarRecipeVersion>().Where(x=>x.ProductId==product.Id).MaxAsync(x=>(int?)x.Version,ct)??0)+1;
        var recipe=new BarRecipeVersion(product.Id,product.Name,version,input.YieldQuantity,input.Reason,actor);
        foreach(var request in input.Ingredients)
        {
            var ingredient=await db.Set<BarProduct>().AsNoTracking().SingleOrDefaultAsync(x=>x.Id==request.ProductId,ct)??throw new BarRuleException("Ingrediente não encontrado.");
            if(ingredient.Id==product.Id||!ingredient.Active||!ingredient.ControlsStock||ingredient.Prepared)throw new BarRuleException("Ingredientes devem ser produtos ativos com estoque, sem preparação ou referência ao próprio produto.");
            var component=new BarRecipeIngredient(recipe.Id,ingredient,request.Quantity,request.Unit);
            BarRecipeIngredient.Required(component.StockQuantity,recipe.YieldQuantity,1); recipe.Ingredients.Add(component);
        }
        db.Add(recipe);await db.SaveChangesAsync(ct);return PublicRecipe(recipe);
    },ct);
    private static RecipeVersionResponse PublicRecipe(BarRecipeVersion recipe)=>new(recipe.Id,recipe.ProductId,recipe.ProductName,recipe.Version,recipe.YieldQuantity,recipe.Reason,recipe.ActorId,recipe.CreatedAtUtc,recipe.Ingredients.OrderBy(x=>x.Name).ThenBy(x=>x.Id).Select(x=>new RecipeIngredientResponse(x.Id,x.ProductId,x.Name,x.Quantity,x.Unit,x.ConversionFactor,x.StockUnit,x.StockQuantity)).ToArray());
    private Task<BarRecipeVersion?> LatestRecipe(Guid productId,CancellationToken ct)=>db.Set<BarRecipeVersion>().AsNoTracking().Include(x=>x.Ingredients).Where(x=>x.ProductId==productId).OrderByDescending(x=>x.Version).FirstOrDefaultAsync(ct);
    private async Task EnsureAvailable(BarTabItem item,Guid locationId,CancellationToken ct)
    {
        var recipe=item.Prepared?await LatestRecipe(item.ProductId,ct):null;
        if(recipe is null)
        {
            if(item.ControlsStock&&(await Balance(item.ProductId,locationId,ct)).Available<item.Quantity)throw new BarRuleException($"{item.Name}: estoque disponível insuficiente.");
            return;
        }
        foreach(var ingredient in recipe.Ingredients.OrderBy(x=>x.ProductId))
        {
            var current=await db.Set<BarProduct>().AsNoTracking().SingleAsync(x=>x.Id==ingredient.ProductId,ct);
            if(!current.Active||!current.ControlsStock||current.Prepared||current.SaleUnit!=ingredient.StockUnit)throw new BarRuleException($"{ingredient.Name}: confira o ingrediente e sua unidade de estoque na ficha técnica.");
            var required=BarRecipeIngredient.Required(ingredient.StockQuantity,recipe.YieldQuantity,item.Quantity);
            if((await Balance(ingredient.ProductId,locationId,ct)).Available<required)throw new BarRuleException($"{item.Name}: ingrediente {ingredient.Name} insuficiente neste local.");
        }
    }
    private async Task SnapshotAndReserve(BarTab tab,BarTabItem item,CancellationToken ct)
    {
        var recipe=item.Prepared?await LatestRecipe(item.ProductId,ct):null;
        if(recipe is null) {if(item.ControlsStock)(await Balance(item.ProductId,tab.LocationId,ct)).Reserve(item.Quantity);return;}
        decimal cost=0;
        foreach(var ingredient in recipe.Ingredients.OrderBy(x=>x.ProductId))
        {
            var product=await db.Set<BarProduct>().AsNoTracking().SingleAsync(x=>x.Id==ingredient.ProductId,ct);
            if(!product.Active||!product.ControlsStock||product.Prepared||product.SaleUnit!=ingredient.StockUnit)throw new BarRuleException($"{ingredient.Name}: ingrediente indisponível ou unidade alterada. Revise a ficha técnica.");
            var quantity=BarRecipeIngredient.Required(ingredient.StockQuantity,recipe.YieldQuantity,item.Quantity);
            (await Balance(product.Id,tab.LocationId,ct)).Reserve(quantity);
            db.Add(new BarTabIngredientSnapshot(item.Id,ingredient,quantity,product.AverageCost)); cost+=quantity*product.AverageCost;
        }
        item.SnapshotRecipe(recipe.Id,decimal.Round(cost/item.Quantity,6,MidpointRounding.AwayFromZero));
    }
    private async Task RecipeStock(BarTab tab,BarTabItem item,string action,Guid actor,CancellationToken ct)
    {
        var components=await db.Set<BarTabIngredientSnapshot>().AsNoTracking().Where(x=>x.ItemId==item.Id).OrderBy(x=>x.ProductId).ToListAsync(ct);
        if(item.RecipeId is not null)
        {
            var expected=await db.Set<BarRecipeIngredient>().AsNoTracking().Where(x=>x.RecipeId==item.RecipeId).ToListAsync(ct);
            if(components.Count==0||components.Count!=expected.Count||components.Any(component=>component.RecipeId!=item.RecipeId||!expected.Any(ingredient=>ingredient.Id==component.IngredientId&&ingredient.ProductId==component.ProductId)))throw new BarRuleException("Snapshot dos ingredientes incompleto. Encaminhe à supervisão antes de entregar ou corrigir.");
            foreach(var component in components)
            {
                var balance=await Balance(component.ProductId,tab.LocationId,ct);
                if(action is "deliver" or "release")balance.Release(component.Quantity);
                if(action=="deliver")db.Add(new StockMovement(balance,-component.Quantity,component.UnitCost,"TabDelivery",$"Entrega da comanda {tab.Number} · {item.Name}",item.Id,actor));
                else if(action=="return")db.Add(new StockMovement(balance,component.Quantity,component.UnitCost,"TabReturn",item.Reason!,item.Id,actor));
            }
        }
        else if(item.ControlsStock)
        {
            var balance=await Balance(item.ProductId,tab.LocationId,ct);
            if(action is "deliver" or "release")balance.Release(item.Quantity);
            if(action=="deliver")db.Add(new StockMovement(balance,-item.Quantity,item.UnitCost,"TabDelivery",$"Entrega da comanda {tab.Number}",item.Id,actor));
            else if(action=="return")db.Add(new StockMovement(balance,item.Quantity,item.UnitCost,"TabReturn",item.Reason!,item.Id,actor));
        }
    }
}
