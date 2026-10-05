namespace LongBeach.Contracts.Bar;
public sealed record RecipeIngredientInput(Guid ProductId, decimal Quantity, string Unit = "Sale");
public sealed record SaveRecipeInput(Guid OperationId, Guid ProductId, decimal YieldQuantity, string Reason, IReadOnlyList<RecipeIngredientInput> Ingredients);
public sealed record RecipeIngredientResponse(Guid Id, Guid ProductId, string Name, decimal Quantity, string Unit, decimal ConversionFactor, string StockUnit, decimal StockQuantity);
public sealed record RecipeVersionResponse(Guid Id, Guid ProductId, string ProductName, int Version, decimal YieldQuantity, string Reason, Guid ActorId, DateTimeOffset CreatedAtUtc, IReadOnlyList<RecipeIngredientResponse> Ingredients);
