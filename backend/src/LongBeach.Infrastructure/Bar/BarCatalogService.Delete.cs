using System.Data;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Purchases;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace LongBeach.Infrastructure.Bar;

public sealed partial class BarCatalogService
{
    public async Task DeleteProduct(Guid id, int version, CancellationToken ct)
    {
        if (version <= 0) throw new BarRuleException("Atualize o produto antes de excluir.", 409);
        await using var transaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct) : null;
        if (db.Database.CurrentTransaction!.GetDbTransaction().IsolationLevel != IsolationLevel.Serializable)
            throw new InvalidOperationException("A exclusão do produto exige uma transação serializável.");
        var product = await db.Set<BarProduct>().FromSqlInterpolated($"SELECT * FROM bar_products WHERE \"Id\" = {id} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw new BarRuleException("Produto não encontrado.", 404);
        var entry = db.Entry(product);
        if (entry.State != EntityState.Unchanged)
            throw new BarRuleException("Conclua ou descarte a edição pendente do produto antes de excluir.", 409);
        await entry.ReloadAsync(ct);
        // A repeat of a completed deletion does not alter its version or history.
        if (!product.Active) return;
        if (product.Version != version) throw new BarRuleException("Produto alterado por outro usuário. Recarregue o cadastro.", 409);
        await EnsureCanArchive(id, ct);
        product.Archive();
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
    }

    private async Task EnsureCanArchive(Guid id, CancellationToken ct)
    {
        // Pending compound commands must not flush new dependencies after this
        // check. Persisted dependencies are read in the same serializable graph
        // as purchases, counts, stock, recipes, sales and tab operations.
        db.ChangeTracker.DetectChanges();
        if (db.ChangeTracker.Entries().Any(e => (e.State is EntityState.Added or EntityState.Modified) && (e.Entity switch
        {
            StockBalance b => b.ProductId == id && (b.Quantity != 0 || b.Reserved != 0),
            PurchaseItem i => i.ProductId == id,
            InventoryCountItem i => i.ProductId == id,
            BarSaleItem i => i.ProductId == id,
            BarTabItem i => i.ProductId == id,
            BarRecipeIngredient i => i.ProductId == id,
            BarTabIngredientSnapshot i => i.ProductId == id,
            _ => false
        }))) throw new BarRuleException("Conclua ou descarte as operações pendentes deste produto antes de excluir.", 409);

        if (await db.Set<StockBalance>().AnyAsync(x => x.ProductId == id && (x.Quantity != 0 || x.Reserved != 0), ct))
            throw new BarRuleException("Produto com saldo ou reserva de estoque. Confira as movimentações antes de excluir.", 409);
        if (await (from i in db.Set<PurchaseItem>() join p in db.Set<Purchase>() on i.PurchaseId equals p.Id
                   where i.ProductId == id && (p.State == "Ordered" || p.State == "PartiallyReceived") select i.Id).AnyAsync(ct))
            throw new BarRuleException("Produto em compra pendente. Conclua ou cancele a compra antes de excluir.", 409);
        if (await (from i in db.Set<InventoryCountItem>() join c in db.Set<InventoryCount>() on i.CountId equals c.Id
                   where i.ProductId == id && c.State == "Counting" select i.Id).AnyAsync(ct))
            throw new BarRuleException("Produto em inventário aberto. Conclua ou cancele a contagem antes de excluir.", 409);
        if (await (from i in db.Set<BarSaleItem>() join s in db.Set<BarSale>() on i.SaleId equals s.Id
                   where i.ProductId == id && (s.State == "Draft" || s.State == "AwaitingPayment") select i.Id).AnyAsync(ct)
            || await (from i in db.Set<BarTabItem>() join t in db.Set<BarTab>() on i.TabId equals t.Id
                      where i.ProductId == id && t.State == "Open" && i.State != "Rejected" && i.State != "Reversed" select i.Id).AnyAsync(ct)
            || await (from ingredient in db.Set<BarTabIngredientSnapshot>() join i in db.Set<BarTabItem>() on ingredient.ItemId equals i.Id
                      join t in db.Set<BarTab>() on i.TabId equals t.Id
                      where ingredient.ProductId == id && t.State == "Open" && (i.State == "Accepted" || i.State == "Fulfilled") select ingredient.Id).AnyAsync(ct))
            throw new BarRuleException("Produto em comanda, pedido ou venda em aberto. Finalize o atendimento antes de excluir.", 409);
        if (await (from i in db.Set<BarRecipeIngredient>() join r in db.Set<BarRecipeVersion>() on i.RecipeId equals r.Id
                   join p in db.Set<BarProduct>() on r.ProductId equals p.Id
                   where i.ProductId == id && p.Active && p.Prepared
                       && !db.Set<BarRecipeVersion>().Any(next => next.ProductId == r.ProductId && next.Version > r.Version)
                   select i.Id).AnyAsync(ct))
            throw new BarRuleException("Produto usado em ficha técnica ativa. Atualize a receita antes de excluir.", 409);
    }
}
