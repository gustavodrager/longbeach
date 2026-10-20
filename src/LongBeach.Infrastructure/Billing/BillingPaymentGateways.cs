using LongBeach.Application.Bar;
using LongBeach.Application.Billing;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Infrastructure.C6;
using Microsoft.Extensions.Options;

namespace LongBeach.Infrastructure.Billing;

public sealed class BillingPaymentGateways(IPaymentGateway pagBank, C6PaymentGateway c6, IOptions<C6Options> options) : IBillingPaymentGateways
{
    public BillingGatewaySelection NewCourtPix() => options.Value.Enabled && options.Value.PixEnabled
        ? new("C6", options.Value.Environment, options.Value.AccountId, c6)
        : new("PagBank", null, null, pagBank);

    public bool MatchesC6Scope(BillingPayment payment) => payment.Provider == "C6"
        && payment.ProviderEnvironment == options.Value.Environment
        && payment.ProviderAccountId == options.Value.AccountId;

    public bool MatchesC6WebhookKey(string key) => !string.IsNullOrWhiteSpace(options.Value.PixKey)
        && string.Equals(key, options.Value.PixKey, StringComparison.Ordinal);

    public IPaymentGateway For(BillingPayment payment) => payment.Provider switch
    {
        "PagBank" => pagBank,
        "C6" when MatchesC6Scope(payment) => c6,
        _ => throw new BarRuleException("O pagamento pertence a outra conexão bancária; restaure a conta e o ambiente de origem para consultar.")
    };
}
