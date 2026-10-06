using LongBeach.Domain.Common;

namespace LongBeach.Domain.Bar;

public sealed class BarTab : Entity
{
    private BarTab() { }
    public BarTab(Guid locationId, Guid actorId, string? name, string mode) : base(Guid.NewGuid())
    {
        if (locationId == Guid.Empty || actorId == Guid.Empty) throw new BarRuleException("Local e atendente obrigatórios.");
        if (mode is not ("Tab" or "Immediate")) throw new BarRuleException("Tipo de conta inválido.");
        if ((name?.Trim().Length ?? 0) > 80) throw new BarRuleException("Nome deve ter até 80 caracteres.");
        LocationId = locationId; ActorId = actorId; Name = name?.Trim() ?? ""; Mode = mode;
    }
    public decimal Discount { get; private set; }
    public void Adjust(decimal amount) { EnsureOpen(); if (amount <= 0) throw new BarRuleException("Ajuste precisa ser maior que zero."); Discount += BarRules.Money(amount); Version++; }
    public long Number { get; private set; }
    public Guid LocationId { get; private set; }
    public Guid ActorId { get; private set; }
    public string Name { get; private set; } = "";
    public string Mode { get; private set; } = "Tab";
    public string State { get; private set; } = "Open";
    public DateTimeOffset? ClosedAtUtc { get; private set; }
    public int Version { get; private set; }
    public void EnsureOpen() { if (State != "Open") throw new BarRuleException("Esta comanda já foi fechada."); }
    public void Touch() { EnsureOpen(); Version++; }
    public void Close(decimal due, decimal pending, bool unfinished, DateTimeOffset now)
    {
        EnsureOpen();
        if (due != 0 || pending != 0 || unfinished) throw new BarRuleException("Receba o saldo e resolva pagamentos e pedidos pendentes antes de fechar.");
        State = "Closed"; ClosedAtUtc = now; Version++;
    }
    public void ReopenAfterRefund() { State = "Open"; ClosedAtUtc = null; Version++; }
}

public sealed class BarTabItem : Entity
{
    private BarTabItem() { }
    public BarTabItem(Guid tabId, BarProduct product, decimal quantity, Guid? actor, bool client) : base(Guid.NewGuid())
    {
        if (!product.Active) throw new BarRuleException("Produto indisponível.");
        if (product.SalePrice <= 0) throw new BarRuleException("Produto sem preço de venda. Cadastre um preço para vender; cortesias exigem supervisão.");
        TabId = tabId; ProductId = product.Id; Name = product.ShortName; Quantity = BarRules.Quantity(quantity);
        UnitPrice = product.SalePrice; UnitCost = product.AverageCost;
        Total = BarRules.Money(decimal.Round(UnitPrice * Quantity, 2)); ControlsStock = product.ControlsStock;
        Prepared = product.Prepared; Source = client ? "Selfservice" : "Attendant"; ActorId = actor;
    }
    public Guid TabId { get; private set; }
    public Guid ProductId { get; private set; }
    public string Name { get; private set; } = "";
    public decimal Quantity { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal UnitCost { get; private set; }
    public decimal Total { get; private set; }
    public bool ControlsStock { get; private set; }
    public bool Prepared { get; private set; }
    public string Source { get; private set; } = "Attendant";
    public Guid? ActorId { get; private set; }
    public string State { get; private set; } = "Requested";
    public DateTimeOffset? AcceptedAtUtc { get; private set; }
    public DateTimeOffset? FulfilledAtUtc { get; private set; }
    public string? Reason { get; private set; }
    public int Version { get; private set; }
    public Guid? RecipeId { get; private set; }
    public void SnapshotRecipe(Guid recipeId, decimal unitCost) { Require("Requested"); if (RecipeId is not null) throw new BarRuleException("Receita do consumo já registrada."); RecipeId = recipeId; UnitCost = BarRules.Cost(unitCost); }
    public void Accept(DateTimeOffset now) { Require("Requested"); State = "Accepted"; AcceptedAtUtc = now; Version++; }
    public void Reject(string? reason) { Require("Requested"); Reason = BarRules.Text(reason, 500, "Motivo da recusa"); State = "Rejected"; Version++; }
    public void Fulfill(DateTimeOffset now) { Require("Accepted"); State = "Fulfilled"; FulfilledAtUtc = now; Version++; }
    public void Reverse(string? reason, bool returnStock)
    {
        if (State is not ("Accepted" or "Fulfilled")) throw new BarRuleException("Este consumo não pode ser corrigido novamente.");
        Reason = BarRules.Text(reason, 450, "Motivo da correção") + (State == "Accepted" ? " · Reserva liberada" : returnStock ? " · Devolução física" : " · Sem devolução física");
        State = "Reversed"; Version++;
    }
    private void Require(string state) { if (State != state) throw new BarRuleException("O item já mudou de situação. Confira a comanda antes de continuar."); }
}

public sealed class BarTabPayment : Entity
{
    private BarTabPayment() { }
    public BarTabPayment(Guid tabId, Guid operationId, string fingerprint, decimal amount, string method,
        Guid? actor, Guid? sessionId, decimal? tendered, string? authorization) : base(Guid.NewGuid())
    {
        if (operationId == Guid.Empty || method is not ("Cash" or "CardManual" or "Pix" or "CreditCard")) throw new BarRuleException("Meio e operação obrigatórios.");
        TabId = tabId; OperationId = operationId; Fingerprint = fingerprint; Amount = BarRules.Money(amount);
        if (Amount == 0) throw new BarRuleException("Informe um valor maior que zero.");
        Tendered = BarRules.Money(tendered ?? amount);
        if (method == "Cash" && Tendered < amount) throw new BarRuleException("Dinheiro recebido insuficiente.");
        Method = method; ActorId = actor; SessionId = sessionId;
        Authorization = string.IsNullOrWhiteSpace(authorization) ? null : BarRules.Text(authorization, 100, "Autorização");
        State = method is "Pix" or "CreditCard" ? "Pending" : "Approved";
    }
    public Guid TabId { get; private set; }
    public Guid OperationId { get; private set; }
    public string Fingerprint { get; private set; } = "";
    public string Method { get; private set; } = "";
    public decimal Amount { get; private set; }
    public decimal Tendered { get; private set; }
    public string? Authorization { get; private set; }
    public Guid? ActorId { get; private set; }
    public Guid? SessionId { get; private set; }
    public string State { get; private set; } = "Pending";
    public string? ProviderId { get; private set; }
    public string? PixText { get; private set; }
    public string? QrImageUrl { get; private set; }
    public DateTimeOffset? ExpiresAtUtc { get; private set; }
    public DateTimeOffset? ConfirmedAtUtc { get; private set; }
    public decimal Refunded { get; private set; }
    public decimal Fee { get; private set; }
    public DateTimeOffset? FeeConfirmedAtUtc { get; private set; }
    public void Reconcile(decimal fee, DateTimeOffset now) { if (State != "Approved" || fee > Amount) throw new BarRuleException("Taxa inválida; confira o recebimento confirmado."); Fee = BarRules.Money(fee); FeeConfirmedAtUtc = now; Version++; }
    public int Version { get; private set; }
    public void SetExpiry(DateTimeOffset expires) { ExpiresAtUtc = expires; Version++; }
    public void Provider(string id, string? text, string? image) { ProviderId = id; PixText = text; QrImageUrl = image; Version++; }
    public void Confirm(DateTimeOffset now) { if (State != "Pending") throw new BarRuleException("Pagamento não está pendente."); State = "Approved"; ConfirmedAtUtc = now; Version++; }
    public void ConfirmManual(DateTimeOffset now) { if (State != "Approved" || Method == "Pix") throw new BarRuleException("Confirmação inválida."); ConfirmedAtUtc = now; Version++; }
    public void Decline() { if (State != "Pending") throw new BarRuleException("Pagamento não está pendente."); State = "Declined"; Version++; }
    public void Refund(decimal amount) { if (State != "Approved" || amount <= 0 || Refunded + amount > Amount) throw new BarRuleException("Valor de estorno inválido."); Refunded += BarRules.Money(amount); Version++; }
}

public sealed class BarTabRefund : Entity
{
    private BarTabRefund() { }
    public BarTabRefund(Guid tabId, Guid paymentId, Guid operationId, string fingerprint, decimal amount, string reason, Guid actor) : base(Guid.NewGuid())
    { TabId = tabId; PaymentId = paymentId; OperationId = operationId; Fingerprint = fingerprint; Amount = BarRules.Money(amount); Reason = BarRules.Text(reason, 500, "Motivo do estorno"); ActorId = actor; }
    public Guid TabId { get; private set; }
    public Guid PaymentId { get; private set; }
    public Guid OperationId { get; private set; }
    public string Fingerprint { get; private set; } = "";
    public decimal Amount { get; private set; }
    public string Reason { get; private set; } = "";
    public Guid ActorId { get; private set; }
    public string State { get; private set; } = "Pending";
    public DateTimeOffset? ConfirmedAtUtc { get; private set; }
    public int Version { get; private set; }
    public void Confirm(DateTimeOffset now) { if (State != "Pending") throw new BarRuleException("Estorno já confirmado."); State = "Confirmed"; ConfirmedAtUtc = now; Version++; }
}

public sealed class BarTabAccess : Entity
{
    private BarTabAccess() { }
    public BarTabAccess(Guid tabId, Guid operationId, string tokenHash, DateTimeOffset expires) : base(Guid.NewGuid())
    { TabId = tabId; OperationId = operationId; TokenHash = tokenHash; ExpiresAtUtc = expires; }
    public Guid TabId { get; private set; }
    public Guid OperationId { get; private set; }
    public string TokenHash { get; private set; } = "";
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public bool Revoked { get; private set; }
    public int Version { get; private set; }
    public void Revoke() { Revoked = true; Version++; }
}

public sealed class BarTabOperation : Entity
{
    private BarTabOperation() { }
    public BarTabOperation(Guid operationId, string fingerprint, string response) : base(operationId) { Fingerprint = fingerprint; ResponseJson = response; }
    public string Fingerprint { get; private set; } = "";
    public string ResponseJson { get; private set; } = "";
}
public sealed class BarTabHistory : Entity
{
    private BarTabHistory() { }
    public BarTabHistory(Guid tabId, string kind, Guid? actor, decimal amount = 0, string? reason = null, Guid? itemId = null, Guid? paymentId = null) : base(Guid.NewGuid())
    { TabId = tabId; Kind = kind; ActorId = actor; Amount = amount; Reason = reason; ItemId = itemId; PaymentId = paymentId; }
    public Guid TabId { get; private set; }
    public string Kind { get; private set; } = "";
    public Guid? ActorId { get; private set; }
    public decimal Amount { get; private set; }
    public string? Reason { get; private set; }
    public Guid? ItemId { get; private set; }
    public Guid? PaymentId { get; private set; }
}
