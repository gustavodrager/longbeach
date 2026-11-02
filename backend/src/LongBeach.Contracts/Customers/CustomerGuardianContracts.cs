namespace LongBeach.Contracts.Customers;

public sealed record GuardianDto(Guid CustomerId, Guid UserId, string Name, string EmailHint, bool IsGranted, int Version);
public sealed record CustomerGuardianInput(bool IsGranted, int ExpectedVersion);
