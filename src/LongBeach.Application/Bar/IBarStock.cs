using LongBeach.Contracts.Bar;
using LongBeach.Domain.Inventory;
namespace LongBeach.Application.Bar;
public interface IBarStock
{
    Task<IReadOnlyList<StockLocation>> Locations(CancellationToken ct);
    Task<StockLocation> CreateLocation(LocationInput input, CancellationToken ct);
    Task<object> Balances(bool costs, CancellationToken ct);
    Task<object> Movements(bool costs, CancellationToken ct);
    Task Transfer(TransferInput input, Guid actor, CancellationToken ct);
    Task Output(StockOutputInput input, string kind, Guid actor, bool supervisor, CancellationToken ct);
    Task<InventoryCount> CreateCount(CountInput input, Guid actor, CancellationToken ct);
    Task<IReadOnlyList<InventoryCount>> Counts(CancellationToken ct);
    Task<InventoryCount> Count(Guid id, CountItemInput input, CancellationToken ct);
    Task<InventoryCount> CancelCount(Guid id,string reason,CancellationToken ct);
    Task<InventoryCount> Approve(Guid id, string reason, Guid actor, CancellationToken ct);
}
