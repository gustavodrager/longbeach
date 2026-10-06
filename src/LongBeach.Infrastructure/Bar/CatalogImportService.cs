using System.Data;
using System.Data.Common;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Auditing;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace LongBeach.Infrastructure.Bar;

public sealed class CatalogImportService(LongBeachDbContext db, IAuditContext audit, TimeProvider time) : ICatalogImport
{
    public async Task<CatalogImportPreview> Preview(Guid batchId, CancellationToken ct) => await Read(batchId, ct);

    public async Task<CatalogImportPreview> Apply(Guid batchId, string confirmationToken, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        // Serializa importações de catálogo; constraints e isolamento também protegem cadastros concorrentes.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(19771005)", ct);
        var plan = await Read(batchId, ct);
        if (plan.Applied) return plan;
        if (!plan.CanApply || !string.Equals(plan.ConfirmationToken, confirmationToken, StringComparison.Ordinal))
            throw new BarRuleException("A conferência mudou ou contém divergências. Confira novamente antes de aplicar.");
        var categories = await db.Set<BarProductCategory>().ToDictionaryAsync(x => x.Name, ct);
        foreach (var item in plan.Items.Where(x => x.Action == "Create"))
        {
            if (!categories.TryGetValue(item.Category, out var category))
            {
                category = new BarProductCategory(item.Category);
                categories.Add(item.Category, category);
                db.Add(category);
            }
            var product = new BarProduct(item.Code, item.Name, item.Name[..Math.Min(item.Name.Length, 80)],
                category.Id, "un", "un", 1, item.SalePrice, item.SourceCost, 0, true, false, 0);
            product.SetMetadata(item.Barcode, null, null);
            db.Add(product);
        }
        db.AuditLogs.Add(AuditLog.Create(audit.UserId, "PagVendasCatalogApplied", "ImportBatch", batchId.ToString(),
            JsonSerializer.Serialize(new { plan.SourceSha256, Created = plan.Creates, Matched = plan.Matches }),
            audit.IpAddress, audit.UserAgent, audit.CorrelationId, time.GetUtcNow()));
        await db.SaveChangesAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE import_rows SET review_status = 'Applied' WHERE batch_id = {batchId}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE import_batches SET status = 'Applied' WHERE id = {batchId}", ct);
        await transaction.CommitAsync(ct);
        return await Read(batchId, ct);
    }

    private async Task<CatalogImportPreview> Read(Guid batchId, CancellationToken ct)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open) await connection.OpenAsync(ct);
        string sourceName, sourceHash, status; int count;
        await using (var command = Command(connection, "SELECT source_name, source_sha256, status, row_count FROM import_batches WHERE id = @id", batchId))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            if (!await reader.ReadAsync(ct)) throw new BarRuleException("Lote não encontrado.");
            sourceName = reader.GetString(0); sourceHash = reader.GetString(1).Trim(); status = reader.GetString(2); count = reader.GetInt32(3);
        }
        var items = new List<CatalogImportItem>();
        await using (var command = Command(connection, "SELECT source_row, record_type, external_id, payload::text FROM import_rows WHERE batch_id = @id ORDER BY source_sheet, source_row", batchId))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                if (reader.GetString(1) != "reference-data") throw new BarRuleException("Este lote não é um catálogo PagVendas.");
                using var payload = JsonDocument.Parse(reader.GetString(3));
                items.Add(PagVendasCatalogRules.Parse(reader.GetInt32(0), reader.IsDBNull(2) ? null : reader.GetString(2), payload.RootElement));
            }
        }
        if (items.Count != count || count is < 1 or > 2000 || items.Select(x => x.Code).Distinct().Count() != count)
            throw new BarRuleException("Lote incompleto ou com códigos PagVendas duplicados.");
        var products = await db.Set<BarProduct>().AsNoTracking().Where(x => x.Code.StartsWith("PV-")).ToDictionaryAsync(x => x.Code, ct);
        var categories = await db.Set<BarProductCategory>().AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var compared = items.Select(item => {
            products.TryGetValue(item.Code, out var product);
            return PagVendasCatalogRules.Compare(item, product, product is null ? null : categories.GetValueOrDefault(product.CategoryId));
        }).ToArray();
        return new(batchId, sourceName, sourceHash, status == "Applied", PagVendasCatalogRules.Fingerprint(sourceHash, compared), compared);
    }

    private DbCommand Command(DbConnection connection, string sql, Guid id)
    {
        var command = connection.CreateCommand(); command.CommandText = sql;
        command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
        var parameter = command.CreateParameter(); parameter.ParameterName = "id"; parameter.DbType = DbType.Guid; parameter.Value = id;
        command.Parameters.Add(parameter); return command;
    }
}
