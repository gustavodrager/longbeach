using LongBeach.Contracts.Bar;
using LongBeach.Domain.Inventory;

namespace LongBeach.Application.Bar;

public interface IBarTabs
{
    Task<PageResult<RecipeVersionResponse>> Recipes(Guid? productId, int page, int pageSize, CancellationToken ct);
    Task<RecipeVersionResponse> Recipe(Guid id, CancellationToken ct);
    Task<RecipeVersionResponse> SaveRecipe(SaveRecipeInput input, Guid actor, CancellationToken ct);
    bool PixEnabled { get; }
    Task<IReadOnlyList<StockLocation>> Locations(CancellationToken ct);
    Task<PageResult<TabResponse>> List(string? state, string? search, int page, int pageSize, bool costs, CancellationToken ct, bool supervisor = false);
    Task<TabResponse> Get(Guid id, bool costs, CancellationToken ct, bool supervisor = false);
    Task<TabResponse> PaymentTab(Guid paymentId, CancellationToken ct);
    Task<TabSourceDetails> Source(string kind, Guid id, int page, int pageSize, CancellationToken ct);
    Task<TabResponse> Open(OpenTabInput input, Guid actor, CancellationToken ct);
    Task<IReadOnlyList<TabCatalogProduct>> Catalog(Guid locationId, CancellationToken ct);
    Task<TabResponse> Add(Guid id, AddTabItemsInput input, Guid? actor, string? accessToken, CancellationToken ct);
    Task<TabResponse> ItemAction(Guid id, Guid itemId, string action, TabActionInput input, Guid actor, bool supervisor, CancellationToken ct);
    Task<TabPaymentResponse> Pay(Guid id, TabPaymentInput input, Guid? actor, string? accessToken, CancellationToken ct);
    Task<TabPaymentResponse> Refresh(Guid id, Guid paymentId, Guid? actor, string? accessToken, CancellationToken ct);
    Task<TabPaymentResponse> RefreshProviderPayment(Guid paymentId, CancellationToken ct);
    Task<TabPaymentResponse> Refund(Guid id, Guid paymentId, TabRefundInput input, Guid actor, CancellationToken ct);
    Task<TabResponse> Adjust(Guid id, TabAdjustmentInput input, Guid actor, CancellationToken ct);
    Task<TabPaymentResponse> Reconcile(Guid id, Guid paymentId, TabReconcileInput input, Guid actor, CancellationToken ct);
    Task<TabResponse> Close(Guid id, TabActionInput input, Guid actor, CancellationToken ct);
    Task<TabAccessResponse> IssueAccess(Guid id, TabAccessInput input, Guid actor, CancellationToken ct);
    Task<TabResponse> RevokeAccess(Guid id, TabActionInput input, Guid actor, CancellationToken ct);
    Task<TabResponse> Client(string token, CancellationToken ct);
    Task<IReadOnlyList<TabCatalogProduct>> ClientCatalog(string token, CancellationToken ct);
    Task<TabReportResponse> Report(string metric, DateTimeOffset? fromUtc, DateTimeOffset? toUtc, int page, int pageSize, CancellationToken ct);
    Task<bool> Webhook(byte[] body, IEnumerable<string> signatures, CancellationToken ct);
}
