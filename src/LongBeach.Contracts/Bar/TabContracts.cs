namespace LongBeach.Contracts.Bar;

public sealed record PageResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);
public sealed record OpenTabInput(Guid OperationId, Guid LocationId, string? Name = null, string Mode = "Tab");
public sealed record TabItemInput(Guid ProductId, decimal Quantity);
public sealed record AddTabItemsInput(Guid OperationId, IReadOnlyList<TabItemInput> Items, bool Deliver = false);
public sealed record TabActionInput(Guid OperationId, string? Reason = null, bool ReturnStock = false);
public sealed record TabPaymentInput(Guid OperationId, string Method, decimal Amount, Guid? SessionId = null,
    decimal? Tendered = null, bool CardApproved = false, string? Authorization = null,
    string? Name = null, string? Email = null, string? TaxId = null, string? EncryptedCard = null);
public sealed record TabAdjustmentInput(Guid OperationId, string Kind, decimal Amount, string Reason);
public sealed record TabReconcileInput(Guid OperationId, decimal Fee, string Reason);
public sealed record TabRefundInput(Guid OperationId, decimal Amount, string Reason);
public sealed record TabAccessInput(Guid OperationId);
public sealed record TabAccessResponse(Guid TabId, string Token, DateTimeOffset ExpiresAtUtc);
public sealed record TabTotals(decimal Total, decimal Paid, decimal Pending, decimal Due, decimal Payable);
public sealed record TabItemResponse(Guid Id, Guid TabId, Guid ProductId, string Name, decimal Quantity,
    decimal UnitPrice, decimal Total, string State, string Source, Guid? ActorId, DateTimeOffset CreatedAtUtc,
    DateTimeOffset? AcceptedAtUtc, DateTimeOffset? FulfilledAtUtc, string? Reason, decimal? UnitCost,
    IReadOnlyList<string> AllowedActions, Guid? RecipeId = null, int? RecipeVersion = null);
public sealed record TabPaymentResponse(Guid Id, Guid TabId, string Method, decimal Amount, decimal Tendered,
    decimal Change, string State, Guid? ActorId, Guid? SessionId, Guid OperationId, string? ProviderId,
    string? PixText, string? QrImageUrl, DateTimeOffset? ExpiresAtUtc, DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ConfirmedAtUtc, decimal Refunded, decimal RefundPending, decimal? Fee, bool CanResume = false);
public sealed record TabHistoryResponse(Guid Id, string Kind, Guid? ItemId, Guid? PaymentId, decimal Amount,
    Guid? ActorId, string? Reason, DateTimeOffset CreatedAtUtc);
public sealed record TabResponse(Guid Id, long Number, string Name, string Mode, string State, Guid LocationId,
    Guid ActorId, decimal Total, decimal Paid, decimal Pending, decimal Due, decimal Payable,
    DateTimeOffset CreatedAtUtc, DateTimeOffset? ClosedAtUtc, IReadOnlyList<TabItemResponse> Items,
    IReadOnlyList<TabPaymentResponse> Payments, IReadOnlyList<TabHistoryResponse> History,
    IReadOnlyList<string> AllowedActions, decimal Gross = 0, decimal Discount = 0);
public sealed record TabCatalogProduct(Guid Id, string Name, string ShortName, Guid CategoryId, string CategoryName,
    decimal SalePrice, bool Favorite, int DisplayOrder, string? ImageUrl, decimal? Available, bool Prepared, Guid? RecipeId = null, int? RecipeVersion = null);
public sealed record TabReportRow(Guid Id, string Label, string Detail, DateTimeOffset Date,
    decimal? Amount, int? Count, string Resource, Guid ResourceId);
public sealed record TabReportResponse(string Metric, string Title, decimal Value, string Unit, bool Current,
    DateTimeOffset FromUtc, DateTimeOffset ToUtc, DateTimeOffset UpdatedAtUtc, string Explanation,
    PageResult<TabReportRow> Rows, bool Available = true);
public sealed record TabSourceRow(Guid Id, string Label, string Detail, DateTimeOffset Date, decimal? Amount,
    decimal? Quantity, Guid? OriginId, string? OriginKind);
public sealed record TabSourceDetails(Guid Id, string Kind, string Label, string State, decimal? Expected,
    decimal? Counted, decimal? Difference, decimal? Available, PageResult<TabSourceRow> Rows);
