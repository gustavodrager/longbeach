using LongBeach.Domain.Common;

namespace LongBeach.Domain.Identity;

public sealed class StaffAccessType : Entity
{
    private StaffAccessType() { }
    public StaffAccessType(Guid id, string code, string name, string role, string[] menus, string[] actions) : base(id)
    { Code = code; Role = role; Update(name, menus, actions); }
    public string Code { get; private set; } = "";
    public string Name { get; private set; } = "";
    public string Role { get; private set; } = "";
    public string[] Menus { get; private set; } = [];
    public string[] Actions { get; private set; } = [];
    public int Version { get; private set; }
    public void Update(string name, string[] menus, string[] actions)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (name.Trim().Length > 80 || menus.Length > 80 || actions.Length > 120) throw new ArgumentException("Confira o tipo de acesso.");
        Name = name.Trim(); Menus = menus.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        Actions = actions.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray(); Version++;
    }
}

public sealed class StaffMembership : Entity
{
    private StaffMembership() { }
    public StaffMembership(Guid userId, Guid teamId, StaffAccessType type) : base(Guid.NewGuid())
    { UserId = userId; TeamId = teamId; SetType(type); Enabled = true; }
    public Guid UserId { get; private set; }
    public Guid TeamId { get; private set; }
    public Guid AccessTypeId { get; private set; }
    public StaffAccessType AccessType { get; private set; } = null!;
    public bool Enabled { get; private set; }
    public int Version { get; private set; }
    public void SetType(StaffAccessType type) { AccessType = type; AccessTypeId = type.Id; Version++; }
    public void SetEnabled(bool enabled) { Enabled = enabled; Version++; }
    public void Touch() => Version++;
}

// Only request fingerprints are retained. A temporary credential is never replayed.
public sealed class StaffAccessOperation : Entity
{
    private StaffAccessOperation() { }
    public StaffAccessOperation(Guid operationId, Guid actorId, Guid teamId, string kind, string requestHash) : base(operationId)
    { ActorId = actorId; TeamId = teamId; Kind = kind; RequestHash = requestHash; }
    public Guid ActorId { get; private set; }
    public Guid TeamId { get; private set; }
    public string Kind { get; private set; } = "";
    public string RequestHash { get; private set; } = "";
}
