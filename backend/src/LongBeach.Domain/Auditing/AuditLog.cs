using LongBeach.Domain.Common;

namespace LongBeach.Domain.Auditing;

public sealed class AuditLog : Entity
{
    private AuditLog() { }

    public static AuditLog Create(
        Guid? actorUserId,
        string action,
        string resource,
        string? resourceId,
        string metadataJson,
        string? ipAddress,
        string? userAgent,
        string correlationId,
        DateTimeOffset occurredAtUtc) =>
        CreateStamped(
            actorUserId,
            action,
            resource,
            resourceId,
            metadataJson,
            ipAddress,
            userAgent,
            correlationId,
            occurredAtUtc);

    private static AuditLog CreateStamped(
        Guid? actorUserId,
        string action,
        string resource,
        string? resourceId,
        string metadataJson,
        string? ipAddress,
        string? userAgent,
        string correlationId,
        DateTimeOffset occurredAtUtc)
    {
        var audit = new AuditLog
        {
            Id = Guid.NewGuid(),
            ActorUserId = actorUserId,
            Action = action,
            Resource = resource,
            ResourceId = resourceId,
            MetadataJson = metadataJson,
            IpAddress = ipAddress,
            UserAgent = userAgent,
            CorrelationId = correlationId,
            OccurredAtUtc = occurredAtUtc
        };

        audit.MarkCreated(occurredAtUtc);
        return audit;
    }

    public Guid? ActorUserId { get; private set; }
    public string Action { get; private set; } = string.Empty;
    public string Resource { get; private set; } = string.Empty;
    public string? ResourceId { get; private set; }
    public string MetadataJson { get; private set; } = "{}";
    public string? IpAddress { get; private set; }
    public string? UserAgent { get; private set; }
    public string CorrelationId { get; private set; } = string.Empty;
    public DateTimeOffset OccurredAtUtc { get; private set; }
}
