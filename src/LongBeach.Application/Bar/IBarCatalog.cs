using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
namespace LongBeach.Application.Bar;
public interface IBarCatalog
{
    Task<IReadOnlyList<BarProductCategory>> Categories(CancellationToken ct);
    Task<BarProductCategory> CreateCategory(CategoryInput input, CancellationToken ct);
    Task<IReadOnlyList<CatalogProduct>> Catalog(CancellationToken ct);
    Task<IReadOnlyList<ManagedProduct>> Products(CancellationToken ct);
    Task<ManagedProduct> SaveProduct(Guid? id, ProductInput input, CancellationToken ct);
}
