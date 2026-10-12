using LongBeach.Contracts.Teaching;
namespace LongBeach.Application.Teaching;
public interface ITeaching
{
    Task<TeachingOverview> Overview(Guid user, CancellationToken ct);
    Task<TeachingRoster> Roster(Guid user, Guid classId, DateOnly date, CancellationToken ct);
    Task<TeachingRoster> SavePresence(Guid user, Guid classId, DateOnly date, PresenceInput input, CancellationToken ct);
    Task<TeachingAccess> Access(CancellationToken ct);
    Task Link(TeacherLink input, CancellationToken ct);
}
public sealed class TeachingNotFoundException : Exception;
public sealed class TeachingConflictException : Exception;
