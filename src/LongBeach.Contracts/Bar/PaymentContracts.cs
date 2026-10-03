namespace LongBeach.Contracts.Bar;
public sealed record PixInput(Guid OperationId,string Name,string Email,string TaxId);
public sealed record ReconcileInput(decimal Fee,decimal Net,string Reason);
