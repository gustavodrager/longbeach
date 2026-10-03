namespace LongBeach.Application.Abstractions;

public interface IAuditContext
{
    Guid? UserId { get; }
    string? IpAddress { get; }
    string? UserAgent { get; }
    string CorrelationId { get; }
}

public sealed class NullAuditContext : IAuditContext
{
    public Guid? UserId => null;
    public string? IpAddress => null;
    public string? UserAgent => null;
    public string CorrelationId => "system";
}
