using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Bar;
public sealed partial class BarCatalogService
{
    public async Task<ManagedProduct> SaveProductStock(Guid id, ProductStockInput input, Guid actor, CancellationToken ct)
    {
        if (actor == Guid.Empty || input.OperationId == Guid.Empty) throw new BarRuleException("Responsável e operação obrigatórios.");
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { action="productStock", id, input, actor }))));
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            var key = BitConverter.ToInt64(SHA256.HashData(input.OperationId.ToByteArray()),0);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({key})",ct);
            var previous = await db.Set<BarTabOperation>().SingleOrDefaultAsync(x=>x.Id==input.OperationId,ct);
            if(previous is not null)
            {
                if(previous.Fingerprint!=fingerprint) throw new BarRuleException("Chave reutilizada para outra edição.");
                return JsonSerializer.Deserialize<ManagedProduct>(previous.ResponseJson)!;
            }
            if(await db.Set<BarTabPayment>().AnyAsync(x=>x.OperationId==input.OperationId,ct) || await db.Set<BarTabRefund>().AnyAsync(x=>x.OperationId==input.OperationId,ct)) throw new BarRuleException("Chave já usada em outra operação.");
            var product = await db.Set<BarProduct>().SingleOrDefaultAsync(x=>x.Id==id,ct) ?? throw new BarRuleException("Produto não encontrado.");
            if(input.Available is decimal available)
            {
                BarRules.Quantity(available,true);
                if(!product.ControlsStock || product.Prepared || !input.Product.ControlsStock || input.Product.Prepared) throw new BarRuleException("Este produto não possui estoque próprio para ajustar.");
                if(input.Product.SaleUnit!=product.SaleUnit) throw new BarRuleException("Mantenha a unidade ao ajustar o estoque.");
                var balance = await new BarStockService(db).Balance(id,StockModel.Bar,ct);
                if(input.StockVersion!=balance.Version) throw new BarRuleException("O estoque mudou. Atualize os dados e confira novamente.");
                var delta=available-balance.Available;
                if(delta!=0) db.Add(new StockMovement(balance,delta,input.Product.AverageCost,"InventoryAdjustment","Correção da quantidade disponível no cadastro de produtos",input.OperationId,actor));
            }
            var result = await SaveProduct(id,input.Product,ct);
            db.Add(new BarTabOperation(input.OperationId,fingerprint,JsonSerializer.Serialize(result)));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return result;
        }
        catch(Exception ex) when(ex is DbUpdateConcurrencyException || ex.GetBaseException() is Npgsql.PostgresException {SqlState:"40001" or "23505"})
        { db.ChangeTracker.Clear(); throw new BarRuleException("Produto ou estoque alterado durante a edição. Atualize os dados e confira novamente."); }
        catch { db.ChangeTracker.Clear(); throw; }
    }
}
