namespace LongBeach.Application.Auth;

public interface IGoogleClientRegistration
{
    // Only call with identity claims verified by the Google authentication handler.
    Task EnsureClientAsync(string subject, string email, string? name, CancellationToken cancellationToken);
}
