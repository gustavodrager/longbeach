using LongBeach.Application.Bar;
using LongBeach.Domain.Billing;

namespace LongBeach.Application.Billing;

public sealed record BillingGatewaySelection(string Provider, string? Environment, string? AccountId, IPaymentGateway Gateway);

public interface IBillingPaymentGateways
{
    BillingGatewaySelection NewCourtPix();
    IPaymentGateway For(BillingPayment payment);
    bool MatchesC6Scope(BillingPayment payment);
    bool MatchesC6WebhookKey(string key);
}
