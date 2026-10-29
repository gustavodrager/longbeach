using LongBeach.Domain.Identity;

namespace LongBeach.UnitTests;

public sealed class ProfileAccessTests
{
    [Fact]
    public void Four_profiles_define_their_access_without_trusting_old_claims()
    {
        Assert.Equal(new[] { "Manager", "Teacher", "Operations", "Student" }, SystemRoles.All);
        Assert.Equal(SystemPermissions.All.Order(), ProfileAccess.Permissions(["Manager"], []).Order());
        var attendant = ProfileAccess.Permissions(["Operations"], []);
        foreach (var permission in new[] { "customers:write", "students:write", "projects:write", "inventory:write", "bar:sales:operate", "bar:cash:operate" })
            Assert.Contains(permission, attendant);
        foreach (var permission in new[] { "finance:read", "finance:write", "users:manage", "employees:write", "inventory:adjust", "bar:finance:read", "bar:supervise", "bar:refund:approve", "bar:purchases:manage", "bar:stock:manage", "bar:catalog:write" })
            Assert.DoesNotContain(permission, attendant);
        Assert.Empty(ProfileAccess.Permissions(["Teacher"], SystemPermissions.All));
        Assert.Empty(ProfileAccess.Permissions(["Student"], SystemPermissions.All));
    }

    [Theory]
    [InlineData("Owner")][InlineData("Administrator")][InlineData("BarOperator")]
    [InlineData("BarSupervisor")][InlineData("StockManager")][InlineData("BarFinance")]
    [InlineData("Viewer")][InlineData("Auditor")][InlineData("Custom")]
    public void Retired_and_custom_profiles_fail_closed(string role)
    {
        Assert.Empty(ProfileAccess.Permissions([role], SystemPermissions.All));
        Assert.False(ProfileAccess.IsManagement([role]));
    }

    [Fact]
    public void Accounts_cannot_accumulate_profiles_and_explicit_changes_replace_them()
    {
        var user = User.Create("Test", "profile@example.test", "hash");
        var teacher = new Role("Teacher");
        user.AssignRole(teacher); user.AssignRole(teacher);
        Assert.Single(user.UserRoles);
        Assert.Throws<InvalidOperationException>(() => user.AssignRole(new Role("Operations")));
        Assert.Throws<InvalidOperationException>(() => user.AssignRole(new Role("Owner")));
        Assert.Empty(ProfileAccess.Permissions(["Manager", "Teacher"], SystemPermissions.All));
        Assert.False(ProfileAccess.IsManagement(["Manager", "Teacher"]));
        Assert.Empty(ProfileAccess.Permissions([], SystemPermissions.All));
        user.SetRole(new Role("Operations"));
        Assert.Equal(new[] { "Operations" }, user.GetRoleNames());
        Assert.Throws<InvalidOperationException>(() => user.SetRole(new Role("Owner")));
    }
}
