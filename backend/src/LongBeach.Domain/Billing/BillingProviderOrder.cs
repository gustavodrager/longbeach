using LongBeach.Domain.Common;
namespace LongBeach.Domain.Billing;
// Provider document identity is separate from local receipt/refund/settlement state.
// No customer data, encrypted card, PAN, CVV or raw provider payload is persisted.
public sealed class BillingProviderOrder : Entity
{
    private BillingProviderOrder() { }
    public BillingProviderOrder(Guid paymentId,string providerId,string reference,string kind,decimal amount,string currency,string provider="PagBank",string? providerEnvironment=null,string? providerAccountId=null) : base(Guid.NewGuid())
    { PaymentId=paymentId;ProviderId=providerId;Reference=reference;Kind=kind;Amount=amount;Currency=currency;Provider=provider;ProviderEnvironment=providerEnvironment;ProviderAccountId=providerAccountId; }
    public Guid PaymentId { get; private set; }
    public string ProviderId { get; private set; } = "";
    public string Provider { get; private set; } = "PagBank";
    public string? ProviderEnvironment { get; private set; }
    public string? ProviderAccountId { get; private set; }
    public string Reference { get; private set; } = "";
    public string Kind { get; private set; } = "";
    public decimal Amount { get; private set; }
    public string Currency { get; private set; } = "";
}
