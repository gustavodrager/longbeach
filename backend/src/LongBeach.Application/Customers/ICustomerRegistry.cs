using LongBeach.Contracts.Customers;

namespace LongBeach.Application.Customers;

public sealed record CustomerSourceInput(string Kind, Guid SourceId, Guid? ParentId, string Name, string Phone, string? Email = null, Guid? CustomerId = null, bool AllowIncomplete = false);
public sealed record CustomerContact(Guid Id, string Name, string Phone, string? Email, bool Incomplete = false);

public interface ICustomerRegistry
{
    Task<CustomerContact> EnsureSourceAsync(CustomerSourceInput input, CancellationToken ct);
    Task<CustomerContact?> GetSourceAsync(string kind, Guid sourceId, Guid? parentId, CancellationToken ct);
    Task<CustomerContact?> ResolveAsync(Guid customerId, CancellationToken ct);
    Task<CustomerContact?> SetSourceAsync(string kind, Guid sourceId, Guid? parentId, Guid? customerId, CancellationToken ct);
}

public interface ICustomers : ICustomerRegistry
{
    Task<CustomerPage> List(string? search, string? profile, bool? incomplete, string? status, int page, int pageSize, CancellationToken ct);
    Task<CustomerDto> Get(Guid id, CancellationToken ct);
    Task<IReadOnlyList<CustomerLinkDto>> Links(Guid id, CancellationToken ct);
    Task<IReadOnlyList<CustomerLookup>> Lookup(string? search, CancellationToken ct);
    Task<CustomerDto> Create(CreateCustomerInput input, Guid actor, string origin, CancellationToken ct);
    Task<CustomerDto> Update(Guid id, UpdateCustomerInput input, CancellationToken ct);
    Task<CustomerDto?> Self(Guid userId, CancellationToken ct);
    Task<CustomerDto> SaveSelf(Guid userId, SelfCustomerInput input, CancellationToken ct);
    Task<IReadOnlyList<CustomerUserCandidate>> UserCandidates(Guid id, string? search, CancellationToken ct);
    Task<CustomerDto> AssignUser(Guid id, CustomerUserInput input, CancellationToken ct);
    Task<IReadOnlyList<CustomerDuplicate>> Duplicates(CancellationToken ct);
    Task<IReadOnlyList<CustomerMergeHistory>> Merges(Guid customerId, CancellationToken ct);
    Task<CustomerMergePreview> PreviewMerge(CustomerMergePreviewInput input, CancellationToken ct);
    Task<CustomerMergeResult> Merge(CustomerMergeInput input, Guid actor, CancellationToken ct);
    Task<CustomerMergeResult> Undo(Guid mergeId, CustomerUndoInput input, Guid actor, CancellationToken ct);
    Task<CustomerBackfillPreview> PreviewBackfill(CancellationToken ct);
    Task<CustomerBackfillResult> ApplyBackfill(CustomerBackfillInput input, Guid actor, CancellationToken ct);
}
