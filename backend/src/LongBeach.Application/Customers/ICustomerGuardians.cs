using LongBeach.Contracts.Customers;

namespace LongBeach.Application.Customers;

public interface ICustomerGuardians
{
    Task<IReadOnlyList<GuardianDto>> List(Guid customerId, CancellationToken ct);
    Task<IReadOnlyList<CustomerUserCandidate>> Candidates(Guid customerId, string? search, CancellationToken ct);
    Task<GuardianDto> Set(Guid customerId, Guid userId, CustomerGuardianInput input, Guid actor, CancellationToken ct);
}
