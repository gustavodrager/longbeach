using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Payments;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace LongBeach.Infrastructure.Bar;

public sealed partial class BarTabsService(LongBeachDbContext db, IPaymentGateway gateway, TimeProvider time, IConfiguration configuration) : IBarTabs
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public bool PixEnabled => gateway.Enabled;
    public async Task<IReadOnlyList<StockLocation>> Locations(CancellationToken ct) => await db.Set<StockLocation>().AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);

    public async Task<PageResult<TabResponse>> List(string? state, string? search, int page, int pageSize, bool costs, CancellationToken ct, bool supervisor = false)
    {
        (page, pageSize) = Paging(page, pageSize);
        var query = db.Set<BarTab>().AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(state))
        {
            if (state is not ("Open" or "Closed" or "Orders")) throw new BarRuleException("Situação inválida.");
            query = state == "Orders" ? query.Where(x => x.State == "Open" && db.Set<BarTabItem>().Any(i => i.TabId == x.Id && (i.State == "Requested" || i.State == "Accepted"))) : query.Where(x => x.State == state);
        }
        if (!string.IsNullOrWhiteSpace(search)) { var text = search.Trim(); if (text.Length > 80) throw new BarRuleException("Busca muito longa."); query = long.TryParse(text, out var number) ? query.Where(x => x.Number == number) : query.Where(x => EF.Functions.ILike(x.Name, "%" + text + "%")); }
        var count = await query.CountAsync(ct);
        var tabs = await query.OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Number).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var values = new List<TabResponse>(); foreach (var tab in tabs) values.Add(await Public(tab, costs, false, ct, supervisor));
        return new(values, page, pageSize, count);
    }
    public async Task<TabResponse> Get(Guid id, bool costs, CancellationToken ct, bool supervisor = false) => await Public(await Find(id, ct), costs, false, ct, supervisor);
    public async Task<TabResponse> PaymentTab(Guid paymentId, CancellationToken ct)
    {
        var payment = await db.Set<BarTabPayment>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == paymentId, ct) ?? throw new BarRuleException("Pagamento não encontrado.");
        return await Public(await Find(payment.TabId, ct), true, false, ct);
    }
    public Task<TabResponse> Open(OpenTabInput input, Guid actor, CancellationToken ct) => Run(input.OperationId, Hash(new { action = "open", input, actor }), async () =>
    {
        if (!await db.Set<StockLocation>().AnyAsync(x => x.Id == input.LocationId, ct)) throw new BarRuleException("Escolha um local de atendimento existente.");
        var tab = new BarTab(input.LocationId, actor, input.Name, input.Mode); db.Add(tab); db.Add(new BarTabHistory(tab.Id, "Opened", actor)); await db.SaveChangesAsync(ct);
        return await Public(tab, false, false, ct);
    }, ct);
    public async Task<IReadOnlyList<TabCatalogProduct>> Catalog(Guid locationId, CancellationToken ct)
    {
        if (!await db.Set<StockLocation>().AnyAsync(x => x.Id == locationId, ct)) throw new BarRuleException("Local de atendimento inexistente.");
        var categories = await db.Set<BarProductCategory>().AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var balances = await db.Set<StockBalance>().AsNoTracking().Where(x => x.LocationId == locationId).ToDictionaryAsync(x => x.ProductId, ct);
        var products=await db.Set<BarProduct>().AsNoTracking().Where(x=>x.Active).OrderByDescending(x=>x.Favorite).ThenBy(x=>x.DisplayOrder).ThenBy(x=>x.Name).ToListAsync(ct);
        var recipes=await db.Set<BarRecipeVersion>().AsNoTracking().Include(x=>x.Ingredients).Where(r=>!db.Set<BarRecipeVersion>().Any(other=>other.ProductId==r.ProductId&&other.Version>r.Version)).ToDictionaryAsync(x=>x.ProductId,ct);
        var activeIngredients=products.Where(x=>x.ControlsStock&&!x.Prepared).ToDictionary(x=>x.Id);
        return products.Where(x=>x.SalePrice>0).Select(x=>
        {
            var recipe=x.Prepared?recipes.GetValueOrDefault(x.Id):null;
            decimal? available=x.ControlsStock?balances.GetValueOrDefault(x.Id)?.Available??0:null;
            if(recipe is not null)
            {
                available=recipe.Ingredients.Min(i=>activeIngredients.TryGetValue(i.ProductId,out var ingredient)&&ingredient.SaleUnit==i.StockUnit ? decimal.Floor((balances.GetValueOrDefault(i.ProductId)?.Available??0)/i.StockQuantity*recipe.YieldQuantity*1000)/1000 : 0);
            }
            return new TabCatalogProduct(x.Id,x.Name,x.ShortName,x.CategoryId,categories.GetValueOrDefault(x.CategoryId,""),x.SalePrice,x.Favorite,x.DisplayOrder,x.ImageUrl,available,x.Prepared,recipe?.Id,recipe?.Version);
        }).ToArray();
    }
    public async Task<TabResponse> Add(Guid id, AddTabItemsInput input, Guid? actor, string? accessToken, CancellationToken ct)
    {
        var scope = await Scope(id, actor, accessToken, ct);
        return await Run(input.OperationId, Hash(new { action = "add", id, input, scope }), async () =>
        {
            var tab = await Lock(id, ct); tab.EnsureOpen();
            if (actor is null) await Scope(id, actor, accessToken, ct);
            if (input.Items is null || input.Items.Count is 0 or > 100) throw new BarRuleException("Escolha de 1 a 100 itens.");
            var items = input.Items.GroupBy(x => x.ProductId).Select(g => new TabItemInput(g.Key, g.Sum(x => BarRules.Quantity(x.Quantity)))).ToArray();
            foreach (var request in items)
            {
                var product = await db.Set<BarProduct>().SingleOrDefaultAsync(x => x.Id == request.ProductId, ct) ?? throw new BarRuleException("Produto inexistente.");
                var item = new BarTabItem(tab.Id, product, request.Quantity, actor, actor is null);
                await EnsureAvailable(item, tab.LocationId, ct);
                db.Add(item); db.Add(new BarTabHistory(tab.Id, "Requested", actor, item.Total, itemId: item.Id));
                if (actor is not null) { await Accept(tab, item, actor.Value, ct); if (input.Deliver && !item.Prepared) await Fulfill(tab, item, actor.Value, ct); }
            }
            tab.Touch(); await db.SaveChangesAsync(ct); return await Public(tab, false, actor is null, ct);
        }, ct);
    }
    public Task<TabResponse> ItemAction(Guid id, Guid itemId, string action, TabActionInput input, Guid actor, bool supervisor, CancellationToken ct) => Run(input.OperationId, Hash(new { action, id, itemId, input, actor }), async () =>
    {
        var tab = await Lock(id, ct); tab.EnsureOpen();
        var item = await db.Set<BarTabItem>().SingleOrDefaultAsync(x => x.Id == itemId && x.TabId == id, ct) ?? throw new BarRuleException("Item não pertence a esta comanda.");
        switch (action)
        {
            case "accept": await Accept(tab, item, actor, ct); break;
            case "fulfill": await Fulfill(tab, item, actor, ct); break;
            case "reject": item.Reject(input.Reason); db.Add(new BarTabHistory(id, "Rejected", actor, reason: item.Reason, itemId: item.Id)); break;
            case "reverse":
                if (!supervisor) throw new BarRuleException("Correção exige supervisor.");
                var totals = await Totals(id, ct);
                if (totals.Total - item.Total < totals.Paid + totals.Pending) throw new BarRuleException("Estorne o valor recebido e resolva o Pix pendente antes de retirar o consumo.");
                var previous = item.State; item.Reverse(input.Reason, input.ReturnStock);
                if (previous == "Accepted") await RecipeStock(tab, item, "release", actor, ct);
                else if (input.ReturnStock) await RecipeStock(tab, item, "return", actor, ct);
                db.Add(new BarTabHistory(id, "Reversed", actor, -item.Total, item.Reason, item.Id)); break;
            default: throw new BarRuleException("Ação inválida.");
        }
        tab.Touch(); await db.SaveChangesAsync(ct); return await Public(tab, false, false, ct);
    }, ct);
    public async Task<TabPaymentResponse> Pay(Guid id, TabPaymentInput input, Guid? actor, string? accessToken, CancellationToken ct)
    {
        var scope = await Scope(id, actor, accessToken, ct);
        var fingerprint = input.Method is "Pix" or "CreditCard" ? Hash(new { action = "payPix", id, input.OperationId, input.Method, input.Amount, scope }) : Hash(new { action = "pay", id, input, scope });
        if (actor is null && input.Method is not ("Pix" or "CreditCard")) throw new BarRuleException("O cliente pode pagar por Pix ou cartão online.");
        if (input.Method is "Pix" or "CreditCard") { var result = await PayPix(id, input, actor, accessToken, fingerprint, ct); return actor is null ? ClientPayment(result) : result; }
        return await Run(input.OperationId, fingerprint, async () =>
        {
            var tab = await Lock(id, ct); tab.EnsureOpen(); await CheckAmount(id, input.Amount, ct);
            if (input.Method == "CardManual" && !input.CardApproved) throw new BarRuleException("Confirme a aprovação na maquininha.");
            CashSession? session = null;
            if (input.Method == "Cash")
            {
                session = input.SessionId is null ? await db.Set<CashSession>().SingleOrDefaultAsync(x => x.OpenedBy == actor && (x.State == "Open" || x.State == "Reopened"), ct) : await db.Set<CashSession>().SingleOrDefaultAsync(x => x.Id == input.SessionId && x.OpenedBy == actor, ct);
                if (session is null || actor is null) throw new BarRuleException("Abra seu próprio caixa para receber dinheiro.");
                session.EnsureOpen();
                if (session.LocationId != tab.LocationId) throw new BarRuleException("Seu caixa atende outro local. Confira a comanda.");
                if ((input.Tendered ?? input.Amount) - input.Amount > session.Expected) throw new BarRuleException("Não há dinheiro suficiente no seu caixa para o troco.");
            }
            var payment = new BarTabPayment(id, input.OperationId, fingerprint, input.Amount, input.Method, actor, session?.Id, input.Tendered, input.Authorization);
            payment.ConfirmManual(time.GetUtcNow()); db.Add(payment);
            if (session is not null) db.Add(new CashMovement(session, payment.Amount, "TabPayment", $"Pagamento da comanda {tab.Number}", actor!.Value, payment.Id));
            db.Add(new BarTabHistory(id, "PaymentApproved", actor, payment.Amount, paymentId: payment.Id)); tab.Touch(); await db.SaveChangesAsync(ct); return await PublicPayment(payment, ct);
        }, ct);
    }
    private async Task<TabPaymentResponse> PayPix(Guid id, TabPaymentInput input, Guid? actor, string? accessToken, string fingerprint, CancellationToken ct)
    {
        if (!(input.Method == "CreditCard" ? gateway.CardEnabled : gateway.Enabled)) throw new BarRuleException("Pix ainda não está habilitado neste ambiente. Escolha outro meio ou configure o provedor.");
        var name = BarRules.Text(input.Name, 160, "Nome do pagador"); var email = BarRules.Text(input.Email, 320, "E-mail do pagador");
        var taxId = new string((input.TaxId ?? "").Where(char.IsDigit).ToArray());
        if (!System.Text.RegularExpressions.Regex.IsMatch(email, "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$") || taxId.Length is not (11 or 14)) throw new BarRuleException("Confira o e-mail e o CPF ou CNPJ do pagador.");
        BarTabPayment payment;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            await OperationLock(input.OperationId, ct); await CheckOperation(input.OperationId, fingerprint, ct);
            var tab = await Lock(id, ct);
            if (actor is null) await Scope(id, actor, accessToken, ct);
            payment = await db.Set<BarTabPayment>().SingleOrDefaultAsync(x => x.OperationId == input.OperationId, ct) ?? null!;
            if (payment is null)
            {
                tab.EnsureOpen(); await CheckAmount(id, input.Amount, ct);
                payment = new BarTabPayment(id, input.OperationId, fingerprint, input.Amount, input.Method, actor, null, null, null); payment.SetExpiry(time.GetUtcNow().AddMinutes(10)); db.Add(payment);
                db.Add(new BarTabHistory(id, "PaymentPending", actor, payment.Amount, paymentId: payment.Id)); tab.Touch(); await db.SaveChangesAsync(ct);
            }
            else if (payment.Fingerprint != fingerprint || payment.TabId != id) throw new BarRuleException("Chave reutilizada para outro pagamento.");
            await tx.CommitAsync(ct);
        }
        // The durable intent remains Pending on timeout. A retry uses the same
        // provider idempotency key instead of allowing a second allocation.
        if (payment.ProviderId is null)
        {
            if(time.GetUtcNow()-payment.CreatedAtUtc>=TimeSpan.FromHours(24))throw new BarPaymentConfirmationPendingException(payment.Id,payment.OperationId,"Cobrança antiga sem confirmação. Concilie no provedor antes de retomar.");
            var remote = await ProviderCall(payment, payment.OperationId, () => input.Method == "CreditCard" ? gateway.CreateCard(payment.Id, payment.OperationId, payment.Amount, new PixCustomer(name, email, taxId), input.EncryptedCard ?? "", ct) : gateway.CreatePix(payment.Id, payment.OperationId, payment.Amount, payment.ExpiresAtUtc!.Value, new PixCustomer(name, email, taxId), ct), ct);
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            await Lock(id, ct); await db.Entry(payment).ReloadAsync(ct);
            if (payment.ProviderId is null) { payment.Provider(remote.OrderId, remote.PixText, remote.QrImageUrl); await db.SaveChangesAsync(ct); }
            else if (payment.ProviderId != remote.OrderId) throw new BarPaymentConfirmationPendingException(payment.Id, payment.OperationId, "O vínculo da cobrança precisa de conciliação. A operação continua reservada; não gere outra chave de pagamento.");
            await tx.CommitAsync(ct);
        }
        return await RefreshProviderPayment(payment.Id, ct);
    }
    public async Task<TabPaymentResponse> Refresh(Guid id, Guid paymentId, Guid? actor, string? accessToken, CancellationToken ct)
    {
        await Scope(id, actor, accessToken, ct);
        if (!await db.Set<BarTabPayment>().AnyAsync(x => x.Id == paymentId && x.TabId == id, ct))
        {
            if (actor is null) throw new BarTabAccessException(BarTabAccessFailure.Forbidden, "Este acesso não permite consultar este pagamento.");
            throw new BarRuleException("Pagamento não pertence a esta comanda.");
        }
        var result = await RefreshProviderPayment(paymentId, ct); return actor is null ? ClientPayment(result) : result;
    }
    public async Task<TabPaymentResponse> RefreshProviderPayment(Guid paymentId, CancellationToken ct)
    {
        var payment = await db.Set<BarTabPayment>().SingleOrDefaultAsync(x => x.Id == paymentId, ct) ?? throw new BarRuleException("Pagamento não encontrado.");
        if (payment.Method is not ("Pix" or "CreditCard") || payment.State != "Pending") return await PublicPayment(payment, ct);
        if (payment.ProviderId is null) throw new BarPaymentConfirmationPendingException(payment.Id, payment.OperationId, "A criação do Pix ainda precisa ser repetida com a mesma chave de operação. Não receba novamente esse valor.");
        var remote = await ProviderCall(payment, payment.OperationId, () => gateway.Get(payment.ProviderId, ct), ct);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var tab = await Lock(payment.TabId, ct); await db.Entry(payment).ReloadAsync(ct);
        if (payment.State == "Pending")
        {
            if (remote.State == "PAID") { if (remote.Refunded != 0) throw new BarPaymentConfirmationPendingException(payment.Id, payment.OperationId, "Pix apresenta estorno inesperado; concilie antes de confirmar. A parcela continua pendente."); payment.Confirm(time.GetUtcNow()); db.Add(new BarTabHistory(tab.Id, "PaymentApproved", payment.ActorId, payment.Amount, paymentId: payment.Id)); }
            else if (remote.State is "DECLINED" or "CANCELED") { payment.Decline(); db.Add(new BarTabHistory(tab.Id, "PaymentDeclined", payment.ActorId, payment.Amount, paymentId: payment.Id)); }
            // A local expiry is not proof that an external charge was canceled.
            // The allocation remains reserved until the provider resolves it.
            tab.Touch(); await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct); return await PublicPayment(payment, ct);
    }
    public async Task<TabPaymentResponse> Refund(Guid id, Guid paymentId, TabRefundInput input, Guid actor, CancellationToken ct)
    {
        var fingerprint = Hash(new { action = "refund", id, paymentId, input, actor });
        BarTabPayment payment; BarTabRefund refund;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            try
            {
                await OperationLock(input.OperationId, ct); await CheckOperation(input.OperationId, fingerprint, ct); var tab = await Lock(id, ct);
                payment = await db.Set<BarTabPayment>().SingleOrDefaultAsync(x => x.Id == paymentId && x.TabId == id, ct) ?? throw new BarRuleException("Pagamento não pertence a esta comanda.");
                refund = await db.Set<BarTabRefund>().SingleOrDefaultAsync(x => x.OperationId == input.OperationId, ct) ?? null!;
                if (refund is not null)
                {
                    if (refund.Fingerprint != fingerprint) throw new BarRuleException("Chave reutilizada para outro estorno.");
                    if (refund.State == "Confirmed") return await PublicPayment(payment, ct);
                }
                else
                {
                    if (payment.State != "Approved" || input.Amount <= 0 || BarRules.Money(input.Amount) > payment.Amount - payment.Refunded) throw new BarRuleException("O estorno precisa caber no valor recebido.");
                    if (await db.Set<BarTabRefund>().AnyAsync(x => x.PaymentId == paymentId && x.State == "Pending", ct)) throw new BarRuleException("Há um estorno em confirmação. Consulte essa operação antes de iniciar outro.");
                    refund = new BarTabRefund(id, paymentId, input.OperationId, fingerprint, input.Amount, input.Reason, actor); db.Add(refund);
                }
                if (payment.Method is not ("Pix" or "CreditCard"))
                {
                    if (payment.Method == "Cash")
                    {
                        var session = await db.Set<CashSession>().SingleOrDefaultAsync(x => x.Id == payment.SessionId, ct) ?? throw new BarRuleException("Caixa original não encontrado.");
                        if (session.State is not ("Open" or "Reopened")) throw new BarRuleException("O caixa que recebeu está fechado. A supervisão precisa reabri-lo para registrar a devolução.");
                        db.Add(new CashMovement(session, -input.Amount, "TabRefund", input.Reason, actor, refund.Id));
                    }
                    await CompleteRefund(tab, payment, refund, ct);
                }
                await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
                if (payment.Method is not ("Pix" or "CreditCard")) return await PublicPayment(payment, ct);
            }
            catch { db.ChangeTracker.Clear(); throw; }
        }
        if (payment.ProviderId is null) throw new BarPaymentConfirmationPendingException(payment.Id, input.OperationId, "Cobrança sem vínculo com o provedor; a solicitação de estorno permanece pendente. Concilie antes de tentar outra operação.");
        var remote = await ProviderCall(payment, input.OperationId, () => gateway.RefundPartial(payment.ProviderId, input.OperationId, input.Amount, payment.Refunded, ct), ct);
        if (remote.Refunded != checked((long)((payment.Refunded + input.Amount) * 100))) throw new BarPaymentConfirmationPendingException(payment.Id, input.OperationId, "Estorno não confirmado pelo provedor. Repita a mesma operação; a solicitação permanece pendente.");
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            var tab = await Lock(id, ct); await db.Entry(payment).ReloadAsync(ct); await db.Entry(refund).ReloadAsync(ct);
            if (refund.State == "Pending") { await CompleteRefund(tab, payment, refund, ct); await db.SaveChangesAsync(ct); }
            await tx.CommitAsync(ct);
        }
        return await PublicPayment(payment, ct);
    }
    private async Task CompleteRefund(BarTab tab, BarTabPayment payment, BarTabRefund refund, CancellationToken ct)
    {
        payment.Refund(refund.Amount); refund.Confirm(time.GetUtcNow());
        if (tab.State == "Closed")
        {
            tab.ReopenAfterRefund();
            foreach (var access in await db.Set<BarTabAccess>().Where(x => x.TabId == tab.Id && !x.Revoked).ToListAsync(ct)) access.Revoke();
        }
        else tab.Touch();
        db.Add(new BarTabHistory(tab.Id, "PaymentRefunded", refund.ActorId, refund.Amount, refund.Reason, paymentId: payment.Id));
    }
    public Task<TabResponse> Adjust(Guid id, TabAdjustmentInput input, Guid actor, CancellationToken ct) => Run(input.OperationId, Hash(new { action = "adjust", id, input, actor }), async () =>
    {
        var tab = await Lock(id, ct); tab.EnsureOpen(); var totals = await Totals(id, ct);
        var reason = BarRules.Text(input.Reason, 500, "Motivo do desconto ou cortesia");
        if (input.Kind is not ("Discount" or "Courtesy")) throw new BarRuleException("Ajuste inválido.");
        if (input.Kind == "Courtesy" && totals.Pending != 0) throw new BarRuleException("Resolva o Pix pendente antes de conceder cortesia.");
        var amount = input.Kind == "Courtesy" ? totals.Payable : BarRules.Money(input.Amount);
        if (amount <= 0 || amount > totals.Payable) throw new BarRuleException("O ajuste precisa caber no saldo livre da comanda.");
        tab.Adjust(amount); db.Add(new BarTabHistory(id, input.Kind, actor, amount, reason)); await db.SaveChangesAsync(ct); return await Public(tab, false, false, ct, true);
    }, ct);
    public Task<TabPaymentResponse> Reconcile(Guid id, Guid paymentId, TabReconcileInput input, Guid actor, CancellationToken ct) => Run(input.OperationId, Hash(new { action = "reconcile", id, paymentId, input, actor }), async () =>
    {
        await Lock(id, ct);
        var payment = await db.Set<BarTabPayment>().SingleOrDefaultAsync(x => x.Id == paymentId && x.TabId == id, ct) ?? throw new BarRuleException("Pagamento não pertence a esta comanda.");
        var reason = BarRules.Text(input.Reason, 500, "Referência da conciliação"); payment.Reconcile(input.Fee, time.GetUtcNow());
        db.Add(new BarTabHistory(id, "FeeReconciled", actor, input.Fee, reason, paymentId: payment.Id)); await db.SaveChangesAsync(ct); return await PublicPayment(payment, ct, true);
    }, ct);
    public Task<TabResponse> Close(Guid id, TabActionInput input, Guid actor, CancellationToken ct) => Run(input.OperationId, Hash(new { action = "close", id, input, actor }), async () =>
    {
        var tab = await Lock(id, ct); var totals = await Totals(id, ct);
        var unfinished = await db.Set<BarTabItem>().AnyAsync(x => x.TabId == id && (x.State == "Requested" || x.State == "Accepted"), ct) || await db.Set<BarTabRefund>().AnyAsync(x => x.TabId == id && x.State == "Pending", ct);
        tab.Close(totals.Due, totals.Pending, unfinished, time.GetUtcNow());
        db.Add(new BarTabHistory(id, "Closed", actor)); await db.SaveChangesAsync(ct); return await Public(tab, false, false, ct);
    }, ct);
    private sealed record AccessReceipt(Guid Id, Guid TabId, Guid OperationId, DateTimeOffset ExpiresAtUtc);
    public async Task<TabAccessResponse> IssueAccess(Guid id, TabAccessInput input, Guid actor, CancellationToken ct)
    {
        var receipt = await Run(input.OperationId, Hash(new { action = "access", id, input, actor }), async () =>
        {
            var tab = await Lock(id, ct); tab.EnsureOpen();
            foreach (var old in await db.Set<BarTabAccess>().Where(x => x.TabId == id && !x.Revoked).ToListAsync(ct)) old.Revoke();
            var expires = time.GetUtcNow().AddHours(24);
            var access = new BarTabAccess(id, input.OperationId, "", expires);
            var token = AccessToken(new(access.Id, id, input.OperationId, expires));
            // The plaintext token is never persisted or written to audit logs.
            db.Entry(access).Property(x => x.TokenHash).CurrentValue = HashText(token); db.Add(access); tab.Touch(); await db.SaveChangesAsync(ct);
            return new AccessReceipt(access.Id, id, input.OperationId, expires);
        }, ct);
        return new(id, AccessToken(receipt), receipt.ExpiresAtUtc);
    }
    public async Task<TabResponse> Client(string token, CancellationToken ct) => await Public(await Access(token, ct, readOnly: true), false, true, ct);
    public async Task<IReadOnlyList<TabCatalogProduct>> ClientCatalog(string token, CancellationToken ct) => await Catalog((await Access(token, ct)).LocationId, ct);
    public async Task<TabResponse> RevokeAccess(Guid id, TabActionInput input, Guid actor, CancellationToken ct) => await Run(input.OperationId, Hash(new { action = "revokeAccess", id, input, actor }), async () =>
    {
        var tab = await Lock(id, ct);
        if (tab.State == "Open") tab.Touch();
        foreach (var access in await db.Set<BarTabAccess>().Where(x => x.TabId == id && !x.Revoked).ToListAsync(ct)) access.Revoke();
        db.Add(new BarTabHistory(id, "AccessRevoked", actor, reason: input.Reason)); await db.SaveChangesAsync(ct); return await Public(tab, false, false, ct);
    }, ct);
    public async Task<bool> Webhook(byte[] body, IEnumerable<string> signatures, CancellationToken ct)
    {
        if (!await gateway.VerifyWebhookAsync(body, signatures,ct)) return false;
        var hash = Convert.ToHexString(SHA256.HashData(body)); if (await db.Set<PaymentWebhookInbox>().AnyAsync(x => x.PayloadHash == hash, ct)) return true;
        using var document = JsonDocument.Parse(body); var order = document.RootElement.GetProperty("id").GetString();
        var payment = await db.Set<BarTabPayment>().SingleOrDefaultAsync(x => x.ProviderId == order, ct);
        if (payment is null && document.RootElement.TryGetProperty("reference_id", out var reference) && Guid.TryParse(reference.GetString(), out var referenceId))
        {
            payment = await db.Set<BarTabPayment>().SingleOrDefaultAsync(x => x.Id == referenceId && (x.Method == "Pix" || x.Method == "CreditCard") && x.ProviderId == null, ct);
            if (payment is not null)
            {
                var remote = await ProviderCall(payment, payment.OperationId, () => gateway.Get(order!, ct), ct);
                await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct); await Lock(payment.TabId, ct); await db.Entry(payment).ReloadAsync(ct);
                if (payment.ProviderId is null) { payment.Provider(remote.OrderId, remote.PixText, remote.QrImageUrl); await db.SaveChangesAsync(ct); } await tx.CommitAsync(ct);
            }
        }
        if (payment is null) return false;
        await RefreshProviderPayment(payment.Id, ct); db.Add(new PaymentWebhookInbox(hash, order!)); await db.SaveChangesAsync(ct); return true;
    }
    private async Task Accept(BarTab tab, BarTabItem item, Guid actor, CancellationToken ct)
    {
        if (!await db.Set<BarProduct>().AnyAsync(x => x.Id == item.ProductId && x.Active, ct)) throw new BarRuleException("Produto desativado; recuse o pedido.");
        await SnapshotAndReserve(tab, item, ct); item.Accept(time.GetUtcNow());
        db.Add(new BarTabHistory(tab.Id, "Accepted", actor, item.Total, itemId: item.Id));
    }
    private async Task Fulfill(BarTab tab, BarTabItem item, Guid actor, CancellationToken ct)
    {
        item.Fulfill(time.GetUtcNow());
        await RecipeStock(tab, item, "deliver", actor, ct);
        db.Add(new BarTabHistory(tab.Id, "Fulfilled", actor, item.Total, itemId: item.Id));
    }
    private Task<StockBalance> Balance(Guid productId, Guid locationId, CancellationToken ct) => new BarStockService(db).Balance(productId, locationId, ct);
    private async Task<string> Scope(Guid id, Guid? actor, string? token, CancellationToken ct)
    {
        if (actor is not null && actor != Guid.Empty) return actor.Value.ToString();
        var tab = await Access(token ?? "", ct); if (tab.Id != id) throw new BarTabAccessException(BarTabAccessFailure.Forbidden, "Este acesso não permite operar outra comanda."); return HashText(token!);
    }
    private async Task<BarTab> Access(string token, CancellationToken ct, bool readOnly = false)
    {
        if (token.Length is < 32 or > 200) throw new BarTabAccessException(BarTabAccessFailure.Invalid, "Peça um novo acesso à equipe.");
        var hash = HashText(token);
        var access = await db.Set<BarTabAccess>().AsNoTracking().SingleOrDefaultAsync(x => x.TokenHash == hash, ct)
            ?? throw new BarTabAccessException(BarTabAccessFailure.Invalid, "Acesso inválido. Peça um novo acesso à equipe.");
        if (access.Revoked || access.ExpiresAtUtc <= time.GetUtcNow()) throw new BarTabAccessException(BarTabAccessFailure.ExpiredOrRevoked, "Acesso expirado ou revogado. Peça um novo acesso à equipe.");
        var tab = await db.Set<BarTab>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == access.TabId, ct);
        if (tab is null || (tab.State != "Open" && !(readOnly && tab.State == "Closed"))) throw new BarTabAccessException(BarTabAccessFailure.Closed, "Esta comanda foi encerrada. Peça um novo acesso à equipe.");
        return tab;
    }
    private string AccessToken(AccessReceipt receipt)
    {
        var key = configuration["Authentication:Jwt:SigningKey"];
        if (string.IsNullOrWhiteSpace(key) || key.Length < 32) throw new BarRuleException("Emissão de acesso indisponível neste ambiente.");
        var message = Encoding.UTF8.GetBytes($"longbeach-tab-access-v1:{receipt.Id}:{receipt.TabId}:{receipt.OperationId}:{receipt.ExpiresAtUtc.UtcTicks}");
        return Convert.ToBase64String(HMACSHA256.HashData(Encoding.UTF8.GetBytes(key), message)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
    private async Task<T> Run<T>(Guid operationId, string fingerprint, Func<Task<T>> action, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            await OperationLock(operationId, ct); await CheckOperation(operationId, fingerprint, ct);
            var previous = await db.Set<BarTabOperation>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == operationId, ct);
            if (previous is not null) { if (previous.Fingerprint != fingerprint) throw new BarRuleException("Chave reutilizada para outra operação."); return JsonSerializer.Deserialize<T>(previous.ResponseJson, Json)!; }
            var result = await action(); db.Add(new BarTabOperation(operationId, fingerprint, JsonSerializer.Serialize(result, Json))); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return result;
        }
        catch { db.ChangeTracker.Clear(); throw; }
    }
    private async Task OperationLock(Guid id, CancellationToken ct)
    {
        if (id == Guid.Empty) throw new BarRuleException("Chave de operação obrigatória.");
        var key = BitConverter.ToInt64(SHA256.HashData(id.ToByteArray()), 0); await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({key})", ct);
    }
    private async Task CheckOperation(Guid id, string fingerprint, CancellationToken ct)
    {
        if (await db.Set<BarTabOperation>().AnyAsync(x => x.Id == id && x.Fingerprint != fingerprint, ct)
            || await db.Set<BarTabPayment>().AnyAsync(x => x.OperationId == id && x.Fingerprint != fingerprint, ct)
            || await db.Set<BarTabRefund>().AnyAsync(x => x.OperationId == id && x.Fingerprint != fingerprint, ct)) throw new BarRuleException("Chave reutilizada para outra operação.");
    }
    private async Task<BarTab> Lock(Guid id, CancellationToken ct)
    {
        var tab = await db.Set<BarTab>().FromSqlInterpolated($"SELECT * FROM bar_tabs WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct) ?? throw new BarRuleException("Comanda não encontrada.");
        await db.Entry(tab).ReloadAsync(ct); return tab;
    }
    private async Task<BarTab> Find(Guid id, CancellationToken ct) => await db.Set<BarTab>().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new BarRuleException("Comanda não encontrada.");
    private async Task CheckAmount(Guid id, decimal amount, CancellationToken ct)
    {
        BarRules.Money(amount); var totals = await Totals(id, ct);
        if (amount <= 0 || amount > totals.Payable) throw new BarRuleException(totals.Pending > 0 ? "Parte do saldo já está em um Pix pendente. Confira antes de receber novamente." : "O valor precisa ser positivo e caber no saldo da comanda.");
    }
    private async Task<TabTotals> Totals(Guid id, CancellationToken ct)
    {
        var items = await db.Set<BarTabItem>().AsNoTracking().Where(x => x.TabId == id).ToListAsync(ct); var payments = await db.Set<BarTabPayment>().AsNoTracking().Where(x => x.TabId == id).ToListAsync(ct);
        var discount = await db.Set<BarTab>().Where(x => x.Id == id).Select(x => x.Discount).SingleAsync(ct); return Calculate(items, payments, discount);
    }
    public static TabTotals Calculate(IEnumerable<BarTabItem> items, IEnumerable<BarTabPayment> payments, decimal discount = 0)
    {
        var total = items.Where(x => x.State is "Accepted" or "Fulfilled").Sum(x => x.Total) - discount;
        var rows = payments.ToArray(); var paid = rows.Where(x => x.State == "Approved").Sum(x => x.Amount - x.Refunded); var pending = rows.Where(x => x.State == "Pending").Sum(x => x.Amount); var due = Math.Max(0, total - paid);
        return new(total, paid, pending, due, Math.Max(0, due - pending));
    }
    private async Task<TabResponse> Public(BarTab tab, bool costs, bool client, CancellationToken ct, bool supervisor = false)
    {
        var items = await db.Set<BarTabItem>().AsNoTracking().Where(x => x.TabId == tab.Id).OrderBy(x => x.CreatedAtUtc).ToListAsync(ct);
        var payments = await db.Set<BarTabPayment>().AsNoTracking().Where(x => x.TabId == tab.Id).OrderBy(x => x.CreatedAtUtc).ToListAsync(ct); var totals = Calculate(items, payments, tab.Discount);
        var recipeIds=items.Where(x=>x.RecipeId!=null).Select(x=>x.RecipeId!.Value).Distinct().ToArray();
        var recipeVersions=costs?await db.Set<BarRecipeVersion>().AsNoTracking().Where(x=>recipeIds.Contains(x.Id)).ToDictionaryAsync(x=>x.Id,x=>x.Version,ct):new Dictionary<Guid,int>();
        var paymentRows = new List<TabPaymentResponse>(); foreach (var payment in payments)
        {
            var row = await PublicPayment(payment, ct, costs);
            paymentRows.Add(client ? ClientPayment(row) : row);
        }
        var history = await db.Set<BarTabHistory>().AsNoTracking().Where(x => x.TabId == tab.Id).OrderBy(x => x.CreatedAtUtc).Select(x => new TabHistoryResponse(x.Id, x.Kind, x.ItemId, x.PaymentId, x.Amount, x.ActorId, x.Reason, x.CreatedAtUtc)).ToListAsync(ct);
        return new(tab.Id, tab.Number, tab.Name, tab.Mode, tab.State, tab.LocationId, client ? Guid.Empty : tab.ActorId, totals.Total, totals.Paid, totals.Pending, totals.Due, totals.Payable, tab.CreatedAtUtc, tab.ClosedAtUtc,
            items.Select(x => new TabItemResponse(x.Id, x.TabId, x.ProductId, x.Name, x.Quantity, x.UnitPrice, x.Total, x.State, x.Source, client ? null : x.ActorId, x.CreatedAtUtc, x.AcceptedAtUtc, x.FulfilledAtUtc, x.Reason, costs ? x.UnitCost : null,
                client || tab.State != "Open" ? [] : x.State == "Requested" ? ["accept", "reject"] : x.State == "Accepted" ? supervisor ? ["fulfill", "reverse"] : ["fulfill"] : x.State == "Fulfilled" && supervisor ? ["reverse"] : [], costs ? x.RecipeId : null, costs && x.RecipeId is not null ? recipeVersions.GetValueOrDefault(x.RecipeId.Value) : null)).ToArray(), paymentRows, client ? history.Select(x => x with { ActorId = null }).ToArray() : history,
            tab.State != "Open" ? [] : client ? ["add", "pix"] : supervisor ? ["add", "pay", "close", "issueAccess", "adjust"] : ["add", "pay", "close", "issueAccess"], totals.Total + tab.Discount, tab.Discount);
    }
    private async Task<TabPaymentResponse> PublicPayment(BarTabPayment payment, CancellationToken ct, bool costs = false)
    {
        var pending = await db.Set<BarTabRefund>().Where(x => x.PaymentId == payment.Id && x.State == "Pending").SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        return new(payment.Id, payment.TabId, payment.Method, payment.Amount, payment.Tendered, payment.Method == "Cash" ? payment.Tendered - payment.Amount : 0, payment.State, payment.ActorId, payment.SessionId, payment.OperationId, payment.ProviderId, payment.PixText, payment.QrImageUrl, payment.ExpiresAtUtc, payment.CreatedAtUtc, payment.ConfirmedAtUtc, payment.Refunded, pending, costs && payment.FeeConfirmedAtUtc is not null ? payment.Fee : null, payment.State == "Pending" && payment.ProviderId is null);
    }
    private static TabPaymentResponse ClientPayment(TabPaymentResponse row) => row with { ActorId = null, SessionId = null, ProviderId = null, Fee = null, Tendered = row.Amount, Change = 0 };
    private static string Hash(object value) => HashText(JsonSerializer.Serialize(value, Json));
    private static string HashText(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private async Task<GatewayPayment> ProviderCall(BarTabPayment payment, Guid operationId, Func<Task<GatewayPayment>> request, CancellationToken ct)
    {
        try { var remote = await request(); Validate(payment, remote); return remote; }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception error)
        {
            throw new BarPaymentConfirmationPendingException(payment.Id, operationId, "O provedor ainda precisa confirmar esta operação. O valor está reservado; repita a mesma operação ou consulte o pagamento antes de receber novamente.", error);
        }
    }
    private static void Validate(BarTabPayment payment, GatewayPayment remote)
    {
        if (remote.Reference != payment.Id.ToString() || remote.Amount != checked((long)(payment.Amount * 100)) || remote.Currency != "BRL" || string.IsNullOrWhiteSpace(remote.OrderId) || payment.ProviderId is not null && payment.ProviderId != remote.OrderId) throw new BarRuleException("O provedor devolveu cobrança com referência, valor ou moeda diferente. Nenhum pagamento foi aprovado.");
    }
    private static (int Page, int Size) Paging(int page, int pageSize) => (Math.Clamp(page, 1, 100000), Math.Clamp(pageSize, 1, 100));
    public Task<TabReportResponse> Report(string metric, DateTimeOffset? fromUtc, DateTimeOffset? toUtc, int page, int pageSize, CancellationToken ct) => ReportCore(metric, fromUtc, toUtc, page, pageSize, ct);
}
