using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;

namespace LongBeach.UnitTests;

public sealed class C6BillingRulesTests
{
    [Theory]
    [InlineData("CreditCard", "Sandbox", "account")]
    [InlineData("Subscription", "Sandbox", "account")]
    [InlineData("Pix", "sandbox", "account")]
    [InlineData("Pix", "Sandbox", "")]
    public void C6_requires_pix_and_an_explicit_connection_scope(string method, string environment, string account)
        => Assert.Throws<BarRuleException>(() => new BillingPayment(Guid.NewGuid(), Guid.NewGuid(), 100, method, Guid.NewGuid(), DateTimeOffset.UtcNow, "C6", environment, account));

    [Fact]
    public void Existing_callers_and_subscription_documents_keep_PagBank_identity()
    {
        var payment = new BillingPayment(Guid.NewGuid(), Guid.NewGuid(), 100, "Pix", Guid.NewGuid(), DateTimeOffset.UtcNow);
        var order = new BillingProviderOrder(payment.Id, "ORDE_test", payment.Id.ToString(), "Order", 100, "BRL");
        Assert.Equal("PagBank", payment.Provider);
        Assert.Equal("PagBank", order.Provider);
        Assert.Null(payment.ProviderEnvironment);
    }

    [Fact]
    public void Bank_receipt_identity_cannot_change_on_repeated_observations()
    {
        var payment = new BillingPayment(Guid.NewGuid(), Guid.NewGuid(), 100, "Pix", Guid.NewGuid(), DateTimeOffset.UtcNow, "C6", "Sandbox", "account");
        payment.ObservePixIdentity("E123"); var version = payment.Version;
        payment.ObservePixIdentity("E123"); payment.ObservePixIdentity(null);
        Assert.Equal(version, payment.Version);
        Assert.Throws<BarRuleException>(() => payment.ObservePixIdentity("E456"));
        Assert.Equal("E123", payment.PixEndToEndId);
    }
}
