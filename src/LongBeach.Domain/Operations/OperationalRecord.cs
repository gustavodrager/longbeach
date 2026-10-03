using LongBeach.Domain.Common;

namespace LongBeach.Domain.Operations;

public sealed class OperationalRecord : Entity
{
    private OperationalRecord() { }

    public OperationalRecord(Guid id, string kind, string name, string payload) : base(id)
    {
        Kind = kind;
        Name = name;
        Payload = payload;
    }

    public string Kind { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public string Payload { get; private set; } = "{}";

    public void Update(string name, string payload)
    {
        Name = name;
        Payload = payload;
    }
}
