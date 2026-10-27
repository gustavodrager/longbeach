namespace LongBeach.Domain.Identity;

public sealed class RolePermission
{
    private RolePermission() { }

    internal RolePermission(Role role, Permission permission)
    {
        Role = role;
        RoleId = role.Id;
        Permission = permission;
        PermissionId = permission.Id;
    }

    public Guid RoleId { get; private set; }
    public Role Role { get; private set; } = null!;
    public Guid PermissionId { get; private set; }
    public Permission Permission { get; private set; } = null!;
}
