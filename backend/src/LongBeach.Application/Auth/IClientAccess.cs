using LongBeach.Contracts.Auth;

namespace LongBeach.Application.Auth;

public sealed record VerifiedGoogleIdentity(string Subject, string Email, string? Name);

public interface IClientAccess
{
    Task Register(ClientRegistrationInput input, CancellationToken ct);
    Task RegisterGoogle(GoogleRegistrationInput input, VerifiedGoogleIdentity google, CancellationToken ct);
    Task<CustomerAccessStatus> Status(Guid customer, CancellationToken ct);
    Task<AccessIssued> Issue(Guid customer, AccessIssueInput input, Guid actor, bool recovery, CancellationToken ct);
    Task Revoke(Guid customer, AccessIssueInput input, CancellationToken ct);
    Task<AccessInspection> Inspect(string token, CancellationToken ct);
    Task Activate(AccessActivationInput input, CancellationToken ct);
    Task ActivateGoogle(string token, VerifiedGoogleIdentity google, CancellationToken ct);
    Task Recover(AccessActivationInput input, CancellationToken ct);
    Task<AuthMethods> Methods(Guid user, CancellationToken ct);
    Task ChangeMethods(Guid user, AuthMethodsInput input, VerifiedGoogleIdentity? google, string? ip, CancellationToken ct);
    Task<AccessReadiness> Readiness(CancellationToken ct);
}
