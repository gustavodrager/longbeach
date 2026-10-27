using LongBeach.Domain.Common;
namespace LongBeach.Domain.Bar;

public sealed class BarRecipeVersion : Entity
{
    private BarRecipeVersion() { }
    public BarRecipeVersion(Guid productId, string productName, int version, decimal yieldQuantity, string reason, Guid actor) : base(Guid.NewGuid())
    { ProductId=productId; ProductName=productName; Version=version; YieldQuantity=BarRules.Quantity(yieldQuantity); Reason=BarRules.Text(reason,500,"Motivo da versão"); ActorId=actor; }
    public Guid ProductId {get; private set;}
    public string ProductName {get; private set;}="";
    public int Version {get; private set;}
    public decimal YieldQuantity {get; private set;}
    public string Reason {get; private set;}="";
    public Guid ActorId {get; private set;}
    public ICollection<BarRecipeIngredient> Ingredients {get; private set;}=new List<BarRecipeIngredient>();
}
public sealed class BarRecipeIngredient : Entity
{
    private BarRecipeIngredient() { }
    public BarRecipeIngredient(Guid recipeId, BarProduct product, decimal quantity, string unit) : base(Guid.NewGuid())
    {
        if(unit is not ("Sale" or "Purchase"))throw new BarRuleException("Selecione unidade do estoque ou de compra.");
        RecipeId=recipeId; ProductId=product.Id; Name=product.Name; Quantity=BarRules.Quantity(quantity); Unit=unit;
        ConversionFactor=unit=="Purchase"?product.ConversionFactor:1; StockUnit=product.SaleUnit; StockQuantity=Quantity*ConversionFactor;
        if(StockQuantity<=0 || StockQuantity>99999999)throw new BarRuleException("Quantidade convertida do ingrediente inválida.");
    }
    public Guid RecipeId {get; private set;}
    public Guid ProductId {get; private set;}
    public string Name {get; private set;}="";
    public decimal Quantity {get; private set;}
    public string Unit {get; private set;}="Sale";
    public decimal ConversionFactor {get; private set;}
    public string StockUnit {get; private set;}="";
    public decimal StockQuantity {get; private set;}
    public static decimal Required(decimal stockQuantity, decimal yieldQuantity, decimal portions) => BarRules.Quantity(decimal.Ceiling(stockQuantity/yieldQuantity*portions*1000)/1000);
}
public sealed class BarTabIngredientSnapshot : Entity
{
    private BarTabIngredientSnapshot() { }
    public BarTabIngredientSnapshot(Guid itemId, BarRecipeIngredient ingredient, decimal quantity, decimal unitCost) : base(Guid.NewGuid())
    { ItemId=itemId; RecipeId=ingredient.RecipeId; IngredientId=ingredient.Id; ProductId=ingredient.ProductId; Name=ingredient.Name; StockUnit=ingredient.StockUnit; Quantity=BarRules.Quantity(quantity); UnitCost=BarRules.Cost(unitCost); }
    public Guid ItemId {get; private set;}
    public Guid RecipeId {get; private set;}
    public Guid IngredientId {get; private set;}
    public Guid ProductId {get; private set;}
    public string Name {get; private set;}="";
    public string StockUnit {get; private set;}="";
    public decimal Quantity {get; private set;}
    public decimal UnitCost {get; private set;}
}
