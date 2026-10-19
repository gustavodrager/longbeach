using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Payments;
using LongBeach.Domain.Purchases;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Bar;
public sealed class BarPurchasesService(LongBeachDbContext db):IBarPurchases
{
    public async Task<IReadOnlyList<Supplier>> Suppliers(CancellationToken ct)=>await db.Set<Supplier>().AsNoTracking().OrderBy(x=>x.Name).ToListAsync(ct);
    public async Task<Supplier> CreateSupplier(string name,CancellationToken ct) {var s=new Supplier(name);db.Add(s);await db.SaveChangesAsync(ct);return s;}
    public async Task<IReadOnlyList<Purchase>> Purchases(CancellationToken ct, string? document = null)=>await db.Set<Purchase>().AsNoTracking().Include(x=>x.Items).Where(x => document == null || x.Document == document).OrderByDescending(x=>x.CreatedAtUtc).Take(100).ToListAsync(ct);
    public Task<Purchase?> Find(Guid id, CancellationToken ct) => db.Set<Purchase>().AsNoTracking().Include(p => p.Items).SingleOrDefaultAsync(p => p.Id == id, ct);
    public async Task<IReadOnlyList<PurchaseProduct>> Products(CancellationToken ct) =>
        await db.Set<BarProduct>().AsNoTracking().Where(p => p.ControlsStock).OrderBy(p => p.Name)
            .Select(p => new PurchaseProduct(p.Id, p.Name, p.Code, p.PurchaseUnit, p.SaleUnit, p.ConversionFactor, p.Active)).ToListAsync(ct);
    public async Task<PurchaseHistory> History(string? search, string? state, string? document, int page, CancellationToken ct)
    {
        var query = db.Set<Purchase>().AsNoTracking().Where(p => document == null || p.Document == document);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(p => p.Document.ToLower().Contains(term) || db.Set<Supplier>().Any(s => s.Id == p.SupplierId && s.Name.ToLower().Contains(term)));
        }
        var awaiting = await query.CountAsync(p => p.State == "Ordered", ct);
        var partial = await query.CountAsync(p => p.State == "PartiallyReceived", ct);
        var completed = await query.CountAsync(p => p.State == "Received" || p.State == "Canceled", ct);
        query = state switch {
            "awaiting" => query.Where(p => p.State == "Ordered"),
            "partial" => query.Where(p => p.State == "PartiallyReceived"),
            "completed" => query.Where(p => p.State == "Received" || p.State == "Canceled"),
            _ => query
        };
        var total = await query.CountAsync(ct); const int size = 20;
        page = Math.Clamp(page, 1, Math.Max(1, (total + size - 1) / size));
        var items = await query.Include(p => p.Items).OrderBy(p => p.State == "Ordered" || p.State == "PartiallyReceived" ? 0 : 1)
            .ThenByDescending(p => p.CreatedAtUtc).ThenBy(p => p.Id).Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return new(items, page, size, total, awaiting, partial, completed);
    }
    public async Task<Purchase> Create(PurchaseInput input,Guid actor,CancellationToken ct)
    {
        if(input.Items is null || input.Items.Count is 0 or >100 || input.Items.Select(x=>x.ProductId).Distinct().Count()!=input.Items.Count) throw new BarRuleException("Informe de 1 a 100 produtos sem repetir itens.");
        if(!await db.Set<Supplier>().AnyAsync(x=>x.Id==input.SupplierId,ct)) throw new BarRuleException("Fornecedor inexistente.");
        var purchase=new Purchase(input.SupplierId,input.Document,actor);
        foreach(var i in input.Items)
        {
            var product=await db.Set<BarProduct>().SingleOrDefaultAsync(x=>x.Id==i.ProductId,ct) ?? throw new BarRuleException("Produto inexistente.");
            if(!product.ControlsStock) throw new BarRuleException("Compra de estoque exige produto estocável.");
            purchase.Items.Add(new PurchaseItem(purchase.Id,product,i.Quantity,i.PurchaseCost));
        }
        purchase.Terms(input.Freight,input.Discount,input.PaymentMethod,input.AccountReference,input.PurchasedAtUtc,
            input.Items.Where(x=>x.Total.HasValue).ToDictionary(x=>x.ProductId,x=>x.Total!.Value));
        db.Add(purchase);await db.SaveChangesAsync(ct);return purchase;
    }
    public async Task<Purchase> CorrectPaymentReference(Guid id,PurchasePaymentReferenceInput input,CancellationToken ct)
    {
        var purchase=await db.Set<Purchase>().Include(x=>x.Items).SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new BarRuleException("Compra inexistente.");
        if(input.Version!=purchase.Version)throw new BarRuleException("Compra alterada por outro usuário. Recarregue a lista.");
        purchase.CorrectPaymentReference(input.PaymentMethod,input.AccountReference);
        await db.SaveChangesAsync(ct);return purchase;
    }
    public async Task<Purchase> Cancel(Guid id,string reason,Guid actor,CancellationToken ct){var p=await db.Set<Purchase>().Include(x=>x.Items).SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new BarRuleException("Compra inexistente.");p.Cancel(reason,actor);await db.SaveChangesAsync(ct);return p;}
    public async Task<Purchase> Receive(Guid id,ReceiptInput input,Guid actor,CancellationToken ct)
    {
        if(input.OperationId==Guid.Empty || input.Items is null || input.Items.Count is 0 or >100 || input.Items.Select(x=>x.ProductId).Distinct().Count()!=input.Items.Count) throw new BarRuleException("Recebimento inválido.");
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        var purchase=await db.Set<Purchase>().Include(x=>x.Items).SingleOrDefaultAsync(x=>x.Id==id,ct) ?? throw new BarRuleException("Compra inexistente.");
        var existing=await db.Set<PurchaseReceipt>().SingleOrDefaultAsync(x=>x.OperationId==input.OperationId,ct);
        if(existing is not null) {if(existing.PurchaseId!=id)throw new BarRuleException("Operação pertence a outra compra.");return purchase;}
        if(purchase.State=="Received" || purchase.State=="Canceled") throw new BarRuleException("Compra já finalizada.");
        var receipt=new PurchaseReceipt(id,input.LocationId,input.OperationId,actor);var stock=new BarStockService(db);decimal total=0;
        foreach(var i in input.Items)
        {
            var item=purchase.Items.SingleOrDefault(x=>x.ProductId==i.ProductId) ?? throw new BarRuleException("Item não pertence à compra."); var receivedCost=item.Receive(i.Quantity);
            var product=await db.Set<BarProduct>().SingleAsync(x=>x.Id==i.ProductId,ct);
            var balances=await db.Set<StockBalance>().Where(x=>x.ProductId==i.ProductId).ToListAsync(ct);
            var quantity=BarRules.Quantity(i.Quantity*item.Conversion);var unitCost=decimal.Round(item.LandedTotal/(item.Quantity*item.Conversion),6);
            product.ReceiveCost(balances.Sum(x=>x.Quantity),quantity,unitCost);
            db.Add(new StockMovement(await stock.Balance(i.ProductId,input.LocationId,ct),quantity,unitCost,"PurchaseReceived","Recebimento: "+purchase.Document,receipt.Id,actor));
            total+=receivedCost;
        }
        purchase.Receive();db.Add(receipt);db.Add(new BarEvent("PurchaseReceived",receipt.Id,total));await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return purchase;
    }
}
