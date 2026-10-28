using System.Data;
using System.Text.Json.Nodes;
using LongBeach.Application.Inventory;
using LongBeach.Contracts.Inventory;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Inventory;

public sealed class MaterialStockService(LongBeachDbContext db) : IMaterialStock
{
    public async Task<MaterialOperationResult> Move(Guid id, MaterialMovementInput input, Guid actor, CancellationToken ct)
    {
        if (input.OperationId == Guid.Empty || input.ExpectedVersion is null or < 0)
            throw new InventoryRuleException("Identificador da operação e versão do material são obrigatórios.");
        var reason = MaterialMovement.Text(input.Reason, 500, "Motivo");
        var destination = MaterialMovement.Text(input.Destination, 160, "Área ou responsável pelo destino");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        // Same lock as operational metadata writes: one writer owns the existing quantity.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
        var record = await db.OperationalRecords.SingleOrDefaultAsync(x => x.Id == id && x.Kind == "inventory", ct)
            ?? throw new InventoryRuleException("Material não encontrado.");
        // A reused context must not apply an operation to a quantity cached before the lock.
        db.ChangeTracker.DetectChanges();
        var entry = db.Entry(record);
        if (entry.State != EntityState.Unchanged)
            throw new InventoryRuleException("Salve ou descarte as alterações pendentes do material antes de movimentar o estoque.");
        await entry.ReloadAsync(ct);
        var previous = await db.Set<MaterialMovement>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == input.OperationId, ct);
        if (previous is not null)
        {
            if (previous.MaterialId != id || previous.ActorId != actor || previous.ExpectedVersion != input.ExpectedVersion
                || previous.Kind != input.Kind || previous.RequestedQuantity != input.Quantity || previous.Reason != reason || previous.Destination != destination)
                throw new InventoryRuleException("Identificador utilizado em outra movimentação. Confira o histórico.");
            // Receipt stays original, while the returned material always contains its current version.
            return new(record.Payload, Row(previous, await ActorName(previous.ActorId, ct)));
        }
        var payload = JsonNode.Parse(record.Payload)!.AsObject();
        var version = payload["version"]?.GetValue<int>() ?? 0;
        if (input.ExpectedVersion != version) throw new DbUpdateConcurrencyException("O material mudou. Atualize e confira a quantidade.");
        if (input.Kind == "Consumption" && MaterialRecordRules.Text(payload, "nature") != "Consumable")
            throw new InventoryRuleException("Classifique o item como material de consumo antes de registrar consumo. Equipamentos reutilizáveis não são consumidos.");
        var movement = new MaterialMovement(input.OperationId, id, actor, version, input.Kind, input.Quantity,
            MaterialRecordRules.Number(payload, "quantity"), MaterialRecordRules.Text(payload, "unit"),
            MaterialRecordRules.Text(payload, "location"), reason, destination);
        payload["quantity"] = movement.After;
        payload["version"] = checked(version + 1);
        record.Update(record.Name, payload.ToJsonString());
        db.Add(movement);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new(record.Payload, Row(movement, await ActorName(actor, ct)));
    }

    public async Task<MaterialHistory> History(Guid id, int page, CancellationToken ct)
    {
        if (page < 1 || page > 1000000) throw new InventoryRuleException("Página inválida.");
        var query = db.Set<MaterialMovement>().AsNoTracking().Where(x => x.MaterialId == id);
        var rows = await (from movement in query
            join user in db.Users on movement.ActorId equals user.Id into actors
            from actor in actors.DefaultIfEmpty()
            orderby movement.CreatedAtUtc descending, movement.Id descending
            select new MaterialMovementRow(movement.Id, movement.MaterialId, movement.Kind, movement.Before, movement.Quantity,
                movement.After, movement.Unit, movement.Location, movement.Reason, movement.Destination, movement.ActorId,
                actor == null ? null : actor.Name, movement.CreatedAtUtc)).Skip((page - 1) * 50).Take(50).ToListAsync(ct);
        return new(rows, page, await query.CountAsync(ct));
    }

    private Task<string?> ActorName(Guid actor, CancellationToken ct) => db.Users.Where(x => x.Id == actor).Select(x => x.Name).FirstOrDefaultAsync(ct);
    private static MaterialMovementRow Row(MaterialMovement m, string? actor) => new(m.Id, m.MaterialId, m.Kind, m.Before, m.Quantity,
        m.After, m.Unit, m.Location, m.Reason, m.Destination, m.ActorId, actor, m.CreatedAtUtc);
}
