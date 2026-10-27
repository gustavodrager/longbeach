namespace LongBeach.Domain.Common;

public abstract class Entity
{
    protected Entity() { }

    protected Entity(Guid id)
    {
        Id = id;
    }

    public Guid Id { get; protected set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }

    public void MarkCreated(DateTimeOffset now)
    {
        if (CreatedAtUtc == default)
        {
            CreatedAtUtc = now;
        }
    }

    public void MarkUpdated(DateTimeOffset now) => UpdatedAtUtc = now;
}
