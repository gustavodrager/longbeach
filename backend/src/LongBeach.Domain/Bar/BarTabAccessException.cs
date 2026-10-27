namespace LongBeach.Domain.Bar;

public enum BarTabAccessFailure { Invalid, Forbidden, ExpiredOrRevoked, Closed }

// Access failures are distinct from operational input errors. Callers must stop
// displaying cached account data when its credential no longer grants access.
public sealed class BarTabAccessException(BarTabAccessFailure failure, string message) : Exception(message)
{
    public BarTabAccessFailure Failure { get; } = failure;
}
