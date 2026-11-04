using LongBeach.Contracts.Staff;
using LongBeach.Domain.Identity;

namespace LongBeach.Application.Staff;

public interface IStaffAuthorization
{
    StaffAuthorizationResult Resolve(User user);
    bool IsOwner(User user);
}

public sealed record StaffAuthorizationResult(IReadOnlyCollection<string> Permissions, bool CanManageStaff, StaffAccessSummary? StaffAccess);

public interface IStaffAccess
{
    Task<StaffAccessContext> ContextAsync(Guid actorId, CancellationToken ct = default);
    Task<StaffAccessTypeSummary[]> TypesAsync(Guid actorId, CancellationToken ct = default);
    Task<StaffAccessTypeSummary> SaveTypeAsync(Guid actorId, string typeId, StaffAccessTypeInput input, CancellationToken ct = default);
    Task<StaffMemberAccessStatus> MemberAsync(Guid actorId, Guid teamId, CancellationToken ct = default);
    Task<StaffMemberResult> SaveMemberAsync(Guid actorId, Guid teamId, StaffMemberInput input, CancellationToken ct = default);
    Task<StaffMemberResult> ResetAsync(Guid actorId, Guid teamId, StaffMemberCommand input, CancellationToken ct = default);
    Task<StaffMemberAccessStatus> BlockAsync(Guid actorId, Guid teamId, StaffMemberCommand input, CancellationToken ct = default);
    Task<StaffMemberAccessStatus> ReactivateAsync(Guid actorId, Guid teamId, StaffMemberCommand input, CancellationToken ct = default);
}

public sealed class StaffAccessException(string message, int statusCode = 400) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
