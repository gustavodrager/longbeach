using LongBeach.Domain.Common;

namespace LongBeach.Domain.Identity;

public sealed class Role : Entity
{
    private readonly HashSet<UserRole> _userRoles = [];
    private readonly HashSet<RolePermission> _rolePermissions = [];

    private Role() { }

    public Role(string name, string? description = null)
        : base(Guid.NewGuid())
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        Name = name.Trim();
        Description = description?.Trim();
    }

    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public IReadOnlyCollection<UserRole> UserRoles => _userRoles;
    public IReadOnlyCollection<RolePermission> RolePermissions => _rolePermissions;

    public void Grant(Permission permission)
    {
        ArgumentNullException.ThrowIfNull(permission);
        if (_rolePermissions.All(item => item.PermissionId != permission.Id))
        {
            _rolePermissions.Add(new RolePermission(this, permission));
        }
    }
}
