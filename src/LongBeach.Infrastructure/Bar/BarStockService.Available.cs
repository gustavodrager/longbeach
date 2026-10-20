using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Bar;
public sealed partial class BarStockService
{
    public async Task SetAvailable(AvailableStockInput input, Guid actor, CancellationToken ct)
    {
        BarRules.Quantity(input.Available, true);
        if(actor == Guid.Empty || input.OperationId == Guid.Empty || input.ExpectedVersion < 0)
            throw new BarRuleException("Responsável, versão e operação obrigatórios.");
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { action="availableStock", input, actor }))));
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        try
        {
            var key = BitConverter.ToInt64(SHA256.HashData(input.OperationId.ToByteArray()),0);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({key})",ct);
            var previous = await db.Set<BarTabOperation>().SingleOrDefaultAsync(x=>x.Id==input.OperationId,ct);
            if(previous is not null) { if(previous.Fingerprint!=fingerprint)throw new BarRuleException("Chave reutilizada para outro ajuste."); return; }
            if(await db.Set<BarTabPayment>().AnyAsync(x=>x.OperationId==input.OperationId,ct) || await db.Set<BarTabRefund>().AnyAsync(x=>x.OperationId==input.OperationId,ct))
                throw new BarRuleException("Chave já usada em outra operação.");
            var product = await Product(input.ProductId,ct);
            if(!product.Active || product.Prepared) throw new BarRuleException("Ajuste somente produtos ativos com estoque próprio.");
            if(input.LocationId!=StockModel.Bar) throw new BarRuleException("O ajuste rápido usa somente o estoque do Bar.");
            var balance = await Balance(input.ProductId,input.LocationId,ct);
            if(balance.Version!=input.ExpectedVersion) throw new BarRuleException("O estoque mudou. Atualize o saldo e confira a quantidade antes de salvar novamente.");
            var delta = input.Available-balance.Available;
            if(delta!=0) db.Add(new StockMovement(balance,delta,product.AverageCost,"InventoryAdjustment","Correção da quantidade disponível pela gestão",input.OperationId,actor));
            db.Add(new BarTabOperation(input.OperationId,fingerprint,"null"));
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        catch(Exception ex) when(ex is DbUpdateConcurrencyException || ex.GetBaseException() is Npgsql.PostgresException {SqlState:"40001" or "23505"})
        {
            db.ChangeTracker.Clear();
            throw new BarRuleException("O estoque mudou durante o ajuste. Atualize os dados e confira novamente.");
        }
        catch { db.ChangeTracker.Clear(); throw; }
    }
}
