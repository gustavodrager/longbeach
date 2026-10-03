namespace LongBeach.Domain.Identity;

public sealed class UserRole
{
    private UserRole() { }

    internal UserRole(User user, Role role)
    {
        User = user;
        UserId = user.Id;
        Role = role;
        RoleId = role.Id;
    }

    public Guid UserId { get; private set; }
    public User User { get; private set; } = null!;
    public Guid RoleId { get; private set; }
    public Role Role { get; private set; } = null!;
}
