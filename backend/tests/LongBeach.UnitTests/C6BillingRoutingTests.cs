using LongBeach.Application.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Infrastructure.Billing;
using LongBeach.Infrastructure.C6;
using LongBeach.Infrastructure.Payments;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace LongBeach.UnitTests;

public sealed class C6BillingRoutingTests
{
    [Theory]
    [InlineData(true, false, true, true, false)]
    [InlineData(true, true, false, true, true)]
    [InlineData(true, true, true, true, true)]
    [InlineData(false, true, true, false, false)]
    [InlineData(true, false, false, false, false)]
    public async Task Billing_configuration_exposes_pix_availability_per_business_unit(bool billingEnabled, bool pagBankEnabled, bool c6Enabled, bool court, bool bar)
    {
        var settings = new C6Options { Enabled = c6Enabled, PixEnabled = c6Enabled, AccountId = "account", Environment = "Sandbox" };
        var options = Options.Create(settings);
        var pagBank = new NoCallsGateway(pagBankEnabled);
        var routes = new BillingPaymentGateways(pagBank, new C6PaymentGateway(null!, options), options);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Payments:Billing:Enabled"] = billingEnabled.ToString() }).Build();
        using var http = new HttpClient();
        var service = new BillingService(null!, pagBank, null!, new PagBankRecurringGateway(http, config), null!, TimeProvider.System, NullLogger<BillingService>.Instance, config, routes);
        var result = await service.Config(default);
        Assert.Equal(court, result.CourtPixEnabled);
        Assert.Equal(bar, result.BarPixEnabled);
        Assert.Equal(court || bar, result.PixEnabled);
    }

    [Fact]
    public void Callback_pix_key_must_match_configured_key_and_empty_keys_are_rejected()
    {
        var settings = new C6Options { PixKey = "configured-key" };
        var routes = new BillingPaymentGateways(new NoCallsGateway(), new C6PaymentGateway(null!, Options.Create(settings)), Options.Create(settings));
        Assert.True(routes.MatchesC6WebhookKey("configured-key"));
        Assert.False(routes.MatchesC6WebhookKey("another-key"));
        Assert.False(routes.MatchesC6WebhookKey("CONFIGURED-KEY"));
        settings.PixKey = "";
        Assert.False(routes.MatchesC6WebhookKey(""));
    }

    [Fact]
    public void New_court_pix_requires_both_flags_and_existing_payments_keep_their_provider()
    {
        var settings = new C6Options { Enabled = true, PixEnabled = true, AccountId = "account", Environment = "Sandbox" };
        var pagBank = new NoCallsGateway();
        var c6 = new C6PaymentGateway(null!, Options.Create(settings));
        var routes = new BillingPaymentGateways(pagBank, c6, Options.Create(settings));
        Assert.Same(c6, routes.NewCourtPix().Gateway);
        var stored = new BillingPayment(Guid.NewGuid(), Guid.NewGuid(), 100, "Pix", Guid.NewGuid(), DateTimeOffset.UtcNow, "C6", "Sandbox", "account");
        settings.PixEnabled = false;
        Assert.Same(pagBank, routes.NewCourtPix().Gateway);
        Assert.Same(c6, routes.For(stored));
        settings.PixEnabled = true; settings.Enabled = false;
        Assert.Same(pagBank, routes.NewCourtPix().Gateway);
        settings.Enabled = true;
        var legacy = new BillingPayment(Guid.NewGuid(), Guid.NewGuid(), 100, "Pix", Guid.NewGuid(), DateTimeOffset.UtcNow);
        Assert.Same(pagBank, routes.For(legacy));
    }

    [Theory]
    [InlineData("Production", "account")]
    [InlineData("Sandbox", "another-account")]
    public void Stored_connection_mismatch_is_rejected_without_falling_back(string environment, string account)
    {
        var settings = new C6Options { Environment = environment, AccountId = account };
        var routes = new BillingPaymentGateways(new NoCallsGateway(), new C6PaymentGateway(null!, Options.Create(settings)), Options.Create(settings));
        var payment = new BillingPayment(Guid.NewGuid(), Guid.NewGuid(), 100, "Pix", Guid.NewGuid(), DateTimeOffset.UtcNow, "C6", "Sandbox", "account");
        Assert.False(routes.MatchesC6Scope(payment));
        Assert.Throws<BarRuleException>(() => routes.For(payment));
    }

    private sealed class NoCallsGateway(bool enabled = true) : IPaymentGateway
    {
        public bool Enabled => enabled;
        public Task<GatewayPayment> CreatePix(Guid id, Guid operation, decimal amount, DateTimeOffset expires, PixCustomer customer, CancellationToken ct) => throw new InvalidOperationException();
        public Task<GatewayPayment> Get(string id, CancellationToken ct) => throw new InvalidOperationException();
        public Task<GatewayPayment> Refund(string id, Guid operation, decimal amount, CancellationToken ct) => throw new InvalidOperationException();
        public bool VerifyWebhook(byte[] body, IEnumerable<string> signatures) => false;
    }
}
