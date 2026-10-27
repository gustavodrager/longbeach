using LongBeach.Domain.Common;

namespace LongBeach.Domain.Identity;

public sealed class Permission : Entity
{
    private readonly HashSet<RolePermission> _rolePermissions = [];

    private Permission() { }

    public Permission(string name, string? description = null)
        : base(Guid.NewGuid())
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        Name = name.Trim();
        Description = description?.Trim();
    }

    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public IReadOnlyCollection<RolePermission> RolePermissions => _rolePermissions;
}
