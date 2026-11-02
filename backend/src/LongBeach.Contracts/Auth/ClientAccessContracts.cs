namespace LongBeach.Contracts.Auth;

public sealed record ClientRegistrationInput(string Name, string Phone, string Username, string Password, string? Email = null);
public sealed record GoogleRegistrationInput(string Name, string Phone);
public sealed record AccessIssueInput(int ExpectedVersion, bool IdentityConfirmed = false);
public sealed record AccessTokenInput(string Token);
public sealed record AccessActivationInput(string Token, string Username, string Password);
public sealed record AccessIssued(string Token, DateTimeOffset ExpiresAtUtc, string Purpose);
public sealed record AccessInspection(string Purpose, DateTimeOffset ExpiresAtUtc);
public sealed record CustomerAccessStatus(string Status, Guid? UserId, string? Username, bool GoogleLinked, bool LocalPasswordEnabled, DateTimeOffset? InvitationExpiresAtUtc);
public sealed record AuthMethods(string? Username, bool GoogleLinked, bool LocalPasswordEnabled);
public sealed record AuthMethodsInput(string? CurrentPassword = null, string? NewPassword = null, string? Username = null, string? Action = null);
public sealed record AccessReviewItem(string Reason, Guid? CustomerId, Guid? UserId);
public sealed record AccessReadiness(DateTimeOffset GeneratedAtUtc, int Customers, int LinkedCustomers, int PendingCustomers,
    int GuardianCustomers, int UnlinkedClientUsers, IReadOnlyList<AccessReviewItem> Review);
