using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Payments;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Bar;
public sealed class BarSalesService(LongBeachDbContext db, IPaymentGateway? gateway = null) : IBarSales
{
    public async Task<object> Create(SaleInput input, Guid actor, CancellationToken ct)
    {
        if (input.Items is null || input.Items.Count is 0 or > 100) throw new BarRuleException("Informe de 1 a 100 itens.");
        var session = await Session(input.SessionId, ct); session.EnsureOpen();
        var sale = new BarSale(session.Id, session.LocationId, actor);
        foreach (var item in input.Items)
        { var product = await db.Set<BarProduct>().SingleOrDefaultAsync(x => x.Id == item.ProductId, ct) ?? throw new BarRuleException("Produto inexistente."); sale.Add(product, item.Quantity); }
        db.Add(sale); await db.SaveChangesAsync(ct); return Public(sale, false);
    }
    public async Task<object> List(Guid actor, bool all, bool costs, CancellationToken ct) =>
        (await db.Set<BarSale>().AsNoTracking().Include(x => x.Items).Where(x => all || x.ActorId == actor).OrderByDescending(x => x.CreatedAtUtc).Take(200).ToListAsync(ct)).Select(x => Public(x,costs)).ToArray();
    public async Task<object> Pay(Guid saleId, ManualPaymentInput input, string method, Guid actor, CancellationToken ct)
    {
        if (input.OperationId == Guid.Empty) throw new BarRuleException("Chave de operação obrigatória.");
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var sale = await Sale(saleId, ct); Own(sale, actor);
        var existing = await db.Set<BarPayment>().SingleOrDefaultAsync(x => x.OperationId == input.OperationId, ct);
        if (existing is not null) { if (existing.SaleId != saleId || existing.Method != method || existing.Tendered != input.Tendered || existing.Authorization != input.Authorization) throw new BarRuleException("Chave reutilizada para outro pagamento."); return new {sale = Public(sale, false), paymentId = existing.Id, change = method == "Cash" ? existing.Tendered - existing.Amount : 0}; }
        var session = await Session(sale.SessionId, ct); session.EnsureOpen();
        BarRules.Money(input.Tendered); if (method == "Cash" && input.Tendered < sale.Total) throw new BarRuleException("Dinheiro recebido insuficiente.");
        sale.Paid(); var payment = new BarPayment(sale.Id, sale.Total, method, input.OperationId, actor, input.Authorization,input.Tendered);
        db.Add(payment); await Consume(sale, "Sale", actor, ct);
        if (method == "Cash") db.Add(new CashMovement(session, sale.Total, "Sale", "Venda em dinheiro", actor, sale.Id));
        db.Add(new BarEvent("SalePaid", sale.Id, sale.Total)); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new { sale = Public(sale, false), paymentId = payment.Id, change = method == "Cash" ? input.Tendered - sale.Total : 0 };
    }
    public async Task<object> Discount(Guid saleId,DiscountInput input,Guid actor,CancellationToken ct){var sale=await Sale(saleId,ct);db.Add(new BarSaleDiscount(sale,input.Amount,input.Reason,actor));await db.SaveChangesAsync(ct);return Public(sale,false);}
    public async Task<object> Courtesy(Guid saleId, string reason, Guid actor, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var sale = await Sale(saleId, ct); (await Session(sale.SessionId,ct)).EnsureOpen(); sale.Paid(true, reason);
        db.Add(new BarPayment(sale.Id, 0, "Courtesy", sale.Id, actor)); await Consume(sale,"Courtesy",actor,ct);
        db.Add(new BarEvent("CourtesyApproved",sale.Id,sale.Cost)); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Public(sale,false);
    }
    public async Task Cancel(Guid saleId, string reason, Guid actor, CancellationToken ct) { var sale = await Sale(saleId, ct); Own(sale,actor); sale.Cancel(reason); await db.SaveChangesAsync(ct); }
    public async Task Refund(Guid saleId, RefundInput input, Guid actor, CancellationToken ct)
    {
        BarRules.Text(input.Reason,500,"Motivo");
        var sale = await Sale(saleId, ct); var payment = await db.Set<BarPayment>().SingleAsync(x => x.SaleId == saleId, ct);
        if(sale.State!="Paid" || payment.State!="Approved")throw new BarRuleException("Somente venda paga pode ser estornada.");
        var returned = input.ReturnStock ? sale.Items.Where(x=>x.ControlsStock).Select(x=>new ReceiptItemInput(x.ProductId,x.Quantity)).ToArray() : input.ReturnedItems?.ToArray() ?? [];
        if(returned.Select(x=>x.ProductId).Distinct().Count()!=returned.Length)throw new BarRuleException("Produto repetido no retorno.");
        foreach(var item in returned){var original=sale.Items.SingleOrDefault(x=>x.ProductId==item.ProductId&&x.ControlsStock);if(original is null || item.Quantity>original.Quantity)throw new BarRuleException("Quantidade devolvida inválida.");BarRules.Quantity(item.Quantity);}
        if (payment.Method == "Pix")
        {
            if(gateway is null || payment.ProviderId is null)throw new BarRuleException("Gateway de estorno indisponível.");
            var confirmed=await gateway.Refund(payment.ProviderId,payment.Id,payment.Amount,ct);
            if(confirmed.Reference!=payment.Id.ToString() || confirmed.Currency!="BRL" || confirmed.Amount!=checked((long)(payment.Amount*100)) || confirmed.Refunded!=checked((long)(payment.Amount*100)))throw new BarRuleException("Estorno diverge da cobrança registrada.");
        }
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        sale.Refund(input.Reason); payment.Refund();
        if (payment.Method == "Cash") db.Add(new CashMovement(await Session(sale.SessionId,ct), -payment.Amount, "Refund", input.Reason, actor, payment.Id));
        var stock = new BarStockService(db);
        foreach (var item in returned) { var original=sale.Items.Single(x=>x.ProductId==item.ProductId); db.Add(new StockMovement(await stock.Balance(item.ProductId,sale.LocationId,ct),item.Quantity,original.UnitCost,"SaleReturn",input.Reason,sale.Id,actor)); }
        db.Add(new BarEvent("SaleRefunded",sale.Id,-payment.Amount)); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    private async Task Consume(BarSale sale, string kind, Guid actor, CancellationToken ct)
    {
        var stock = new BarStockService(db);
        foreach (var item in sale.Items)
        {
            var product = await db.Set<BarProduct>().SingleAsync(x=>x.Id==item.ProductId,ct);
            if (!product.Active) throw new BarRuleException("Produto desativado desde a criação da venda.");
            if (!item.ControlsStock) continue;
            db.Add(new StockMovement(await stock.Balance(item.ProductId,sale.LocationId,ct),-item.Quantity,item.UnitCost,kind,sale.Reason ?? "Venda paga",sale.Id,actor));
        }
    }
    private async Task<BarSale> Sale(Guid id, CancellationToken ct) => await db.Set<BarSale>().Include(x=>x.Items).SingleOrDefaultAsync(x=>x.Id==id,ct) ?? throw new BarRuleException("Venda não encontrada.");
    private async Task<CashSession> Session(Guid id, CancellationToken ct) => await db.Set<CashSession>().SingleOrDefaultAsync(x=>x.Id==id,ct) ?? throw new BarRuleException("Caixa não encontrado.");
    private static void Own(BarSale sale, Guid actor) { if (sale.ActorId != actor) throw new BarRuleException("Esta venda pertence a outro operador."); }
    private static object Public(BarSale s, bool costs) => new {s.Id,s.SessionId,s.LocationId,s.ActorId,s.State,s.Reason,s.DiscountAmount,s.Total,s.CreatedAtUtc,Cost=costs?(decimal?)s.Cost:null,
        Items=s.Items.Select(x=>new {x.Id,x.ProductId,x.Name,x.Quantity,x.UnitPrice,x.Total,UnitCost=costs?(decimal?)x.UnitCost:null})};
}
