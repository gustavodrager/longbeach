using System.Data;
using System.Data.Common;
using System.Text.Json;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace LongBeach.Infrastructure.Bar;

public sealed class CatalogImportService(LongBeachDbContext db) : ICatalogImport
{
    public async Task<CatalogImportPreview> Preview(Guid batchId, CancellationToken ct) => await Read(batchId, ct);

    public Task<CatalogImportPreview> Apply(Guid batchId, string confirmationToken, CancellationToken ct)
        => throw new BarRuleException("A importação de produtos PagVendas foi desativada. Cadastre e controle os produtos no Long Beach. O histórico continua disponível.");

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
