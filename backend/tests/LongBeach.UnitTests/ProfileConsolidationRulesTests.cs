using LongBeach.Infrastructure.Bootstrap;

namespace LongBeach.UnitTests;

public sealed class ProfileConsolidationRulesTests
{
    private static ProfileConsolidationIdentity Identity(params string[] roles) => new(Guid.NewGuid(), true, roles);

    [Fact]
    public void Single_legacy_management_profiles_convert_and_supported_profiles_remain_exclusive()
    {
        var users = new[] { Identity("Owner"), Identity("Administrator"), Identity("Manager"), Identity("Teacher"), Identity("Operations"), Identity("Student") };
        var result = ProfileConsolidationRules.Preview(users, new());
        Assert.True(result.CanApply);
        Assert.Equal(3, result.ActiveManagers);
        Assert.Equal(2, result.Changes.Count);
        Assert.All(result.Changes, c => Assert.Equal("Manager", c.TargetRole));
        Assert.Equal(3, result.ProfilesAfter["Manager"]);
        Assert.Equal(1, result.ProfilesAfter["Teacher"]);
        Assert.Equal(1, result.ProfilesAfter["Operations"]);
        Assert.Equal(1, result.ProfilesAfter["Student"]);
    }

    [Theory]
    [InlineData("BarOperator")]
    [InlineData("BarSupervisor")]
    [InlineData("StockManager")]
    [InlineData("BarFinance")]
    [InlineData("Viewer")]
    [InlineData("Auditor")]
    [InlineData("Custom")]
    public void Legacy_or_custom_profile_requires_explicit_mapping(string role)
    {
        var target = Identity(role);
        var result = ProfileConsolidationRules.Preview([Identity("Manager"), target], new());
        Assert.False(result.CanApply);
        Assert.Contains(result.Issues, i => i.UserId == target.UserId && i.Code == "explicit_mapping_required");
    }

    [Fact]
    public void Multiple_profiles_including_a_manager_and_accounts_without_profile_require_mapping()
    {
        var multiple = Identity("Teacher", "Manager"); var noRole = Identity();
        var result = ProfileConsolidationRules.Preview([Identity("Manager"), multiple, noRole], new());
        Assert.Equal(2, result.Issues.Count(i => i.Code == "explicit_mapping_required"));
    }

    [Fact]
    public void Explicit_mapping_is_exact_and_does_not_depend_on_role_order()
    {
        var user = Identity("Teacher", "BarOperator");
        var result = ProfileConsolidationRules.Preview([Identity("Manager"), user],
            new(Mappings: [new(user.UserId, ["BarOperator", "Teacher"], "Operations")]));
        Assert.True(result.CanApply);
        Assert.Equal("Operations", Assert.Single(result.Changes).TargetRole);
    }

    [Fact]
    public void Changed_roles_invalid_targets_duplicate_and_unknown_user_mappings_are_rejected()
    {
        var first = Identity("BarOperator"); var second = Identity("Viewer"); var third = Identity("Auditor");
        var unknown = Guid.NewGuid();
        var result = ProfileConsolidationRules.Preview([Identity("Manager"), first, second, third], new(Mappings:
        [
            new(first.UserId, ["Teacher"], "Operations"),
            new(second.UserId, ["Viewer"], "Owner"),
            new(third.UserId, ["Auditor"], "Student"), new(third.UserId, ["Auditor"], "Student"),
            new(unknown, [], "Student")
        ]));
        Assert.False(result.CanApply);
        Assert.Contains(result.Issues, i => i.Code == "roles_changed" && i.UserId == first.UserId);
        Assert.Contains(result.Issues, i => i.Code == "unsupported_target" && i.UserId == second.UserId);
        Assert.Contains(result.Issues, i => i.Code == "duplicate_mapping" && i.UserId == third.UserId);
        Assert.Contains(result.Issues, i => i.Code == "unknown_user" && i.UserId == unknown);
    }

    [Fact]
    public void Last_active_manager_cannot_be_removed_or_replaced_by_an_inactive_account()
    {
        var manager = Identity("Manager"); var inactive = Identity("Owner") with { IsActive = false };
        var result = ProfileConsolidationRules.Preview([manager, inactive], new(Mappings: [new(manager.UserId, ["Manager"], "Student")]));
        Assert.False(result.CanApply);
        Assert.Contains(result.Issues, i => i.Code == "active_manager_required");
    }

    [Theory]
    [InlineData("Manager")]
    [InlineData("Owner")]
    [InlineData("Administrator")]
    public void Pending_management_account_cannot_replace_the_only_completed_manager(string pendingRole)
    {
        var manager = Identity("Manager"); var pending = Identity(pendingRole) with { RequiresFirstAccess = true };
        var result = ProfileConsolidationRules.Preview([manager, pending], new(Mappings: [new(manager.UserId, ["Manager"], "Student")]));
        Assert.False(result.CanApply);
        Assert.Equal(0, result.ActiveManagers);
        Assert.Contains(result.Issues, issue => issue.Code == "active_manager_required");
        Assert.True(ProfileConsolidationRules.Preview([manager, pending], new()).CanApply);
    }

    [Fact]
    public void Fingerprint_is_stable_for_ordering_and_changes_for_identity_status_or_roles()
    {
        var first = Identity("Teacher", "BarOperator"); var manager = Identity("Manager");
        var initial = ProfileConsolidationRules.Preview([first, manager], new());
        var reordered = ProfileConsolidationRules.Preview([manager, first with { Roles = ["BarOperator", "Teacher"] }], new());
        Assert.Equal(initial.Fingerprint, reordered.Fingerprint);
        Assert.NotEqual(initial.Fingerprint, ProfileConsolidationRules.Preview([first with { IsActive = false }, manager], new()).Fingerprint);
        Assert.NotEqual(initial.Fingerprint, ProfileConsolidationRules.Preview([first, manager with { RequiresFirstAccess = true }], new()).Fingerprint);
        Assert.NotEqual(initial.Fingerprint, ProfileConsolidationRules.Preview([first with { Roles = ["Student"] }, manager], new()).Fingerprint);
        Assert.NotEqual(initial.Fingerprint, ProfileConsolidationRules.Preview([manager], new()).Fingerprint);
    }
}
