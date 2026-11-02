using LongBeach.Domain.Customers;

namespace LongBeach.UnitTests;

public sealed class CustomerGuardianAccessTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Empty_customer_or_account_cannot_authorize_a_guardian(bool missingCustomer)
    {
        Assert.Throws<CustomerRuleException>(() => new CustomerGuardianAccess(
            missingCustomer ? Guid.Empty : Guid.NewGuid(), missingCustomer ? Guid.NewGuid() : Guid.Empty, true));
    }

    [Fact]
    public void Revocation_is_retained_and_reactivation_requires_the_current_version()
    {
        var row = new CustomerGuardianAccess(Guid.NewGuid(), Guid.NewGuid(), true);
        Assert.True(row.IsGranted); Assert.Equal(1, row.Version);
        row.SetGranted(false, 1);
        Assert.False(row.IsGranted); Assert.Equal(2, row.Version);
        var stale = Assert.Throws<CustomerRuleException>(() => row.SetGranted(true, 1));
        Assert.Equal(409, stale.StatusCode); Assert.False(row.IsGranted);
        row.SetGranted(true, 2);
        Assert.True(row.IsGranted); Assert.Equal(3, row.Version);
    }

    [Fact]
    public void An_explicit_denial_and_repeated_current_state_preserve_the_pair()
    {
        var row = new CustomerGuardianAccess(Guid.NewGuid(), Guid.NewGuid(), false);
        var id = row.Id;
        row.SetGranted(false, 1);
        Assert.False(row.IsGranted); Assert.Equal(1, row.Version); Assert.Equal(id, row.Id);
    }
}
