using LongBeach.Domain.Common;
using LongBeach.Domain.Bar;
namespace LongBeach.Domain.Billing;

public sealed class BillingAccount : Entity
{
    private BillingAccount() { }
    public BillingAccount(string kind, Guid sourceId, Guid userId, Guid? studentId, Guid actor) : base(Guid.NewGuid())
    {
        if (kind is not ("Bar" or "Quadra") || sourceId == Guid.Empty || userId == Guid.Empty) throw new BarRuleException("Informe a conta e o responsável financeiro.");
        Kind = kind; SourceId = sourceId; UserId = userId; StudentId = studentId; AssignedBy = actor;
    }
    public string Kind { get; private set; } = "";
    public Guid SourceId { get; private set; }
    public Guid UserId { get; private set; }
    public Guid? StudentId { get; private set; }
    public Guid AssignedBy { get; private set; }
}

public sealed class BillingPayment : Entity
{
    private BillingPayment() { }
    public BillingPayment(Guid accountId, Guid operationId, decimal amount, string method, Guid actor, DateTimeOffset expires) : base(Guid.NewGuid())
    {
        if (operationId == Guid.Empty || method is not ("Pix" or "CreditCard" or "Subscription") || amount <= 0) throw new BarRuleException("Pagamento inválido.");
        AccountId = accountId; OperationId = operationId; Amount = BarRules.Money(amount); Method = method; ActorId = actor; ExpiresAtUtc = expires.ToUniversalTime();
    }
    public Guid AccountId { get; private set; }
    public Guid OperationId { get; private set; }
    public Guid ActorId { get; private set; }
    public decimal Amount { get; private set; }
    public string Method { get; private set; } = "";
    public string State { get; private set; } = "Pending";
    public string? ProviderId { get; private set; }
    public string? ChargeId { get; private set; }
    public string? PixText { get; private set; }
    public string? QrImageUrl { get; private set; }
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public DateTimeOffset? PaidAtUtc { get; private set; }
    public decimal Refunded { get; private set; }
    public int Version { get; private set; }
    public void Bind(string order, string? charge, string? text, string? image)
    {
        if (ProviderId is not null && (ProviderId != order || (!string.IsNullOrEmpty(ChargeId) && ChargeId != charge))) throw new BarRuleException("Pagamento externo divergente.");
        ProviderId = order; ChargeId = charge; PixText = text; QrImageUrl = image; Version++;
    }
    public void Observe(string status, decimal refunded, DateTimeOffset now)
    {
        if (refunded < 0 || refunded > Amount) throw new BarRuleException("Estorno divergente; concilie o pagamento.");
        var before=(State,Refunded,PaidAtUtc);
        refunded=Math.Max(refunded,Refunded);
        if (State == "Canceled" && status == "PAID") throw new BarRuleException("Pagamento confirmado após cancelamento. Concilie antes de baixar novamente.");
        if (State == "Pending" && status == "PAID") { State = "Approved"; PaidAtUtc = now; }
        else if (State == "Pending" && status is "CANCELED" or "DECLINED") State = "Canceled";
        if (State is "Approved" or "Refunded") { Refunded = refunded; if (Refunded == Amount) State = "Refunded"; }
        if(before!=(State,Refunded,PaidAtUtc))Version++;
    }
}

public sealed class BillingRefund : Entity
{
    private BillingRefund() { }
    public BillingRefund(Guid paymentId, Guid operationId, decimal amount, decimal previous, string reason, Guid actor) : base(Guid.NewGuid())
    { PaymentId = paymentId; OperationId = operationId; Amount = BarRules.Money(amount); Previous = previous; Reason = BarRules.Text(reason, 500, "Motivo"); ActorId = actor; }
    public Guid PaymentId { get; private set; }
    public Guid OperationId { get; private set; }
    public Guid ActorId { get; private set; }
    public decimal Amount { get; private set; }
    public decimal Previous { get; private set; }
    public string Reason { get; private set; } = "";
    public string State { get; private set; } = "Pending";
    public void Confirm() => State = "Confirmed";
}

public sealed class BillingSubscription : Entity
{
    private BillingSubscription() { }
    public BillingSubscription(Guid accountId, Guid operationId, Guid userId, string sourceKind, Guid sourceId, decimal amount, DateOnly firstDue, DateTimeOffset consentAt) : base(Guid.NewGuid())
    { AccountId = accountId; OperationId = operationId; UserId = userId; SourceKind = sourceKind; SourceId = sourceId; Amount = amount; FirstDue = firstDue; ConsentAtUtc = consentAt; }
    public Guid AccountId { get; private set; }
    public Guid OperationId { get; private set; }
    public Guid UserId { get; private set; }
    public string SourceKind { get; private set; } = "";
    public Guid SourceId { get; private set; }
    public decimal Amount { get; private set; }
    public DateOnly FirstDue { get; private set; }
    public DateTimeOffset ConsentAtUtc { get; private set; }
    public string State { get; private set; } = "Creating";
    public string? ProviderId { get; private set; }
    public string? PlanId { get; private set; }
    public Guid? CancelOperationId { get; private set; }
    public int Version { get; private set; }
    public void Plan(string id) { PlanId = id; Version++; }
    public void Bind(string id) { if (ProviderId is not null && ProviderId != id) throw new BarRuleException("Assinatura divergente."); ProviderId = id; Version++; }
    public void Observe(string state) { if (State != "CANCELED") State = state; Version++; }
    public void Cancel(Guid operation) { if (operation == Guid.Empty) throw new BarRuleException("Operação obrigatória."); CancelOperationId ??= operation; State = "CancelPending"; Version++; }
}

public sealed class BillingSettlement : Entity
{
    private BillingSettlement() { }
    public BillingSettlement(Guid accountId, Guid paymentId, Guid documentId, string externalId, decimal gross, decimal fee, decimal net, DateOnly date) : base(Guid.NewGuid())
    { if (gross <= 0 || fee < 0 || net < 0 || gross != fee + net) throw new BarRuleException("Bruto, taxa e líquido divergentes."); AccountId=accountId; PaymentId=paymentId; DocumentId=documentId; ExternalId=externalId; Gross=gross; Fee=fee; Net=net; Date=date; }
    public Guid AccountId { get; private set; }
    public Guid PaymentId { get; private set; }
    public Guid DocumentId { get; private set; }
    public string ExternalId { get; private set; } = "";
    public decimal Gross { get; private set; }
    public decimal Fee { get; private set; }
    public decimal Net { get; private set; }
    public DateOnly Date { get; private set; }
}
