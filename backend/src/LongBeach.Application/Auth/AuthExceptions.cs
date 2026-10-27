namespace LongBeach.Application.Auth;

public sealed class AuthenticationFailedException : Exception
{
    public AuthenticationFailedException() : base("Invalid email or password.") { }
}

public sealed class InvalidRefreshTokenException : Exception
{
    public InvalidRefreshTokenException() : base("Invalid or expired refresh token.") { }
}

public sealed class CsrfValidationException : Exception
{
    public CsrfValidationException() : base("The request origin or CSRF token is invalid.") { }
}

public sealed class ConcurrencyConflictException : Exception
{
    public ConcurrencyConflictException(Exception innerException)
        : base("The session was changed by another request.", innerException) { }
}

public sealed class CurrentPasswordInvalidException : Exception
{
    public CurrentPasswordInvalidException() : base("The current password is incorrect.") { }
}

public sealed class WeakPasswordException : Exception
{
    public WeakPasswordException(string message) : base(message) { }
}
