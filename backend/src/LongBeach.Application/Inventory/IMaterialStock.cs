using LongBeach.Contracts.Inventory;

namespace LongBeach.Application.Inventory;

public interface IMaterialStock
{
    Task<MaterialOperationResult> Move(Guid id, MaterialMovementInput input, Guid actor, CancellationToken ct);
    Task<MaterialHistory> History(Guid id, int page, CancellationToken ct);
}
