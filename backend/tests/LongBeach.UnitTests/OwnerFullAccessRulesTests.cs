using LongBeach.Application.Staff;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Auth;
using Microsoft.Extensions.Options;

namespace LongBeach.UnitTests;

public sealed class OwnerFullAccessRulesTests
{
    private static User RestrictedManager()
    {
        var user = User.Create("Synthetic owner", "owner@example.invalid", "test-only-hash");
        var type = StaffAccessCatalog.Default("gestor");
        type.Update("Finance consultation", ["finance"], []);
        user.AssignRole(new Role(SystemRoles.Manager));
        user.AttachStaffMembership(new(user.Id, Guid.NewGuid(), type));
        return user;
    }

    private static StaffAuthorization Resolver(params Guid[] ownerIds) =>
        new(Options.Create(new StaffAccessOptions { OwnerUserIds = ownerIds }));

    [Fact]
    public void A_verified_owner_has_all_management_permissions_without_a_staff_route_scope()
    {
        var user = RestrictedManager();
        var type = user.StaffMembership!.AccessType;
        var version = type.Version;

        var access = Resolver(user.Id).Resolve(user);

        Assert.True(access.CanManageStaff);
        Assert.Null(access.StaffAccess);
        Assert.Equal(SystemPermissions.All.Order(StringComparer.Ordinal), access.Permissions.Order(StringComparer.Ordinal));
        Assert.Equal(["finance"], type.Menus);
        Assert.Empty(type.Actions);
        Assert.Equal(version, type.Version);
    }

    [Fact]
    public void The_same_template_still_limits_a_manager_who_is_not_an_owner()
    {
        var user = RestrictedManager();
        var access = Resolver(Guid.NewGuid()).Resolve(user);

        Assert.False(access.CanManageStaff);
        Assert.Equal("gestor", access.StaffAccess!.TypeId);
        Assert.Equal(["finance"], access.StaffAccess.Menus);
        Assert.Contains(SystemPermissions.FinanceRead, access.Permissions);
        Assert.DoesNotContain(SystemPermissions.FinanceWrite, access.Permissions);
        Assert.DoesNotContain(SystemPermissions.EmployeesWrite, access.Permissions);
        Assert.DoesNotContain(SystemPermissions.BarSalesOperate, access.Permissions);
    }

    [Fact]
    public void Removing_the_configured_identity_restores_the_existing_template_limits()
    {
        var user = RestrictedManager();
        var options = new StaffAccessOptions { OwnerUserIds = [user.Id] };
        var resolver = new StaffAuthorization(Options.Create(options));
        Assert.Null(resolver.Resolve(user).StaffAccess);

        options.OwnerUserIds = [];
        var access = resolver.Resolve(user);

        Assert.False(access.CanManageStaff);
        Assert.Equal("gestor", access.StaffAccess!.TypeId);
        Assert.Equal(["finance"], access.StaffAccess.Menus);
        Assert.DoesNotContain(SystemPermissions.FinanceWrite, access.Permissions);
    }

    [Theory]
    [InlineData("inactive")]
    [InlineData("first-access")]
    [InlineData("blocked-membership")]
    [InlineData("no-login")]
    [InlineData("mismatched-profile")]
    [InlineData("mismatched-membership")]
    public void An_owner_id_does_not_promote_an_unusable_or_inconsistent_account(string condition)
    {
        var user = RestrictedManager();
        switch (condition)
        {
            case "inactive": user.Deactivate(); break;
            case "first-access": user.RequireLocalFirstAccess("temporary-test-hash", DateTimeOffset.UtcNow.AddHours(1)); break;
            case "blocked-membership": user.StaffMembership!.SetEnabled(false); break;
            case "no-login": user.DisableLocalPassword("replacement-test-hash"); break;
            case "mismatched-profile": user.SetRole(new Role(SystemRoles.Operations)); break;
            case "mismatched-membership": user.StaffMembership!.SetType(StaffAccessCatalog.Default("bar")); break;
        }

        var resolver = Resolver(user.Id);
        var access = resolver.Resolve(user);

        Assert.False(resolver.IsOwner(user));
        Assert.False(access.CanManageStaff);
        Assert.DoesNotContain(SystemPermissions.EmployeesWrite, access.Permissions);
        Assert.DoesNotContain(SystemPermissions.BarSupervise, access.Permissions);
    }

    [Fact]
    public void An_owner_id_does_not_expand_the_bar_profile()
    {
        var user = RestrictedManager();
        user.SetRole(new Role(SystemRoles.Operations));
        user.StaffMembership!.SetType(StaffAccessCatalog.Default("bar"));

        var access = Resolver(user.Id).Resolve(user);

        Assert.False(access.CanManageStaff);
        Assert.Equal("bar", access.StaffAccess!.TypeId);
        Assert.Contains(SystemPermissions.BarSalesOperate, access.Permissions);
        Assert.DoesNotContain(SystemPermissions.FinanceRead, access.Permissions);
        Assert.DoesNotContain(SystemPermissions.EmployeesWrite, access.Permissions);
        Assert.DoesNotContain(SystemPermissions.BarPurchasesManage, access.Permissions);
    }
}
