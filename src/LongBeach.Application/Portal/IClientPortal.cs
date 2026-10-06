using LongBeach.Contracts.Portal;
namespace LongBeach.Application.Portal;
public interface IClientPortal
{
    Task<PortalProfile> Profile(Guid user, CancellationToken ct);
    Task<PortalProfile> SaveProfile(Guid user, ProfileInput input, CancellationToken ct);
    Task<IReadOnlyList<PortalAppointment>> Agenda(Guid user, CancellationToken ct);
    Task<PortalOptions> Options(CancellationToken ct, bool staff = false);
    Task<IReadOnlyList<PortalRequest>> Requests(Guid? user, CancellationToken ct);
    Task<PortalRequest> Request(Guid user, RequestInput input, CancellationToken ct);
    Task<PortalRequest> Decide(Guid id, RequestDecision input, CancellationToken ct);
    Task<PortalRequest> Accept(Guid user, Guid id, AcceptAlternativeInput input, CancellationToken ct);
    Task Link(LinkInput input, CancellationToken ct);
    Task<PortalCandidates> Candidates(CancellationToken ct);
    Task Rate(Guid user, RatingInput input, CancellationToken ct);
}
