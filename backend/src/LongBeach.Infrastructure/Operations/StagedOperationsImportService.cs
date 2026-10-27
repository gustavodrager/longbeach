using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Operations;
using LongBeach.Contracts.Operations;
using LongBeach.Domain.Auditing;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace LongBeach.Infrastructure.Operations;

/// <summary>Create-only reconciliation for independent, allowlisted staging schemas. No financial postings.</summary>
public abstract class StagedOperationsImportService(LongBeachDbContext db, IAuditContext audit, TimeProvider time, bool rentals)
{
    public Task<GradeImportPreview> Preview(Guid batchId, CancellationToken ct) => Read(batchId, ct);

    public async Task<GradeImportPreview> Apply(Guid batchId, string confirmationToken, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        // Same lock as manual arena writes: capacity and overlap validation remain atomic across replicas.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
        var plan = await Read(batchId, ct);
        if (plan.Applied) return plan;
        if (!plan.CanApply || plan.ConfirmationToken != confirmationToken)
            throw new BarRuleException("O lote ou os cadastros mudaram. Confira novamente antes de aplicar.");
        foreach (var item in plan.Items)
        {
            var payload = JsonNode.Parse(item.Body.GetRawText())!.AsObject();
            payload["version"] = 1;
            db.OperationalRecords.Add(new OperationalRecord(item.Id, item.Kind, item.Name, payload.ToJsonString()));
        }
        db.AuditLogs.Add(AuditLog.Create(audit.UserId, rentals ? "RentalGroupsImported" : "ClassGradeApplied", "ImportBatch", batchId.ToString(),
            JsonSerializer.Serialize(new { Records = plan.Items.Length, Classes = plan.Items.Count(x => x.Kind == "classes"), Enrollments = plan.Items.Count(x => x.Kind == "enrollments") }),
            audit.IpAddress, audit.UserAgent, audit.CorrelationId, time.GetUtcNow()));
        await db.SaveChangesAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE import_rows SET review_status = 'Applied' WHERE batch_id = {batchId}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE import_batches SET status = 'Applied' WHERE id = {batchId}", ct);
        await transaction.CommitAsync(ct);
        return plan with { Applied = true };
    }

    private async Task<GradeImportPreview> Read(Guid batchId, CancellationToken ct)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open) await connection.OpenAsync(ct);
        var sourceName = ""; var sourceHash = ""; var status = ""; var count = 0;
        await using (var command = Command("SELECT source_name, source_sha256, status, row_count FROM import_batches WHERE id = @id"))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            if (!await reader.ReadAsync(ct)) throw new BarRuleException("Lote não encontrado.");
            sourceName = reader.GetString(0); sourceHash = reader.GetString(1).Trim(); status = reader.GetString(2); count = reader.GetInt32(3);
        }
        var items = new List<GradeImportItem>();
        var externalIds = new HashSet<string>(StringComparer.Ordinal);
        await using (var command = Command("SELECT source_sheet, source_row, record_type, external_id, payload::text FROM import_rows WHERE batch_id = @id ORDER BY source_sheet, source_row, external_id"))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                using var document = JsonDocument.Parse(reader.GetString(4));
                var source = document.RootElement;
                var externalId = reader.IsDBNull(3) ? "" : reader.GetString(3);
                if (reader.GetString(2) != "reference-data" || source.ValueKind != JsonValueKind.Object ||
                    OperationalValidation.Text(source, "schema") != (rentals ? "longbeach.rental-groups.v1" : "longbeach.class-grade-operations.v1") ||
                    string.IsNullOrWhiteSpace(externalId) || !externalIds.Add(externalId) ||
                    !source.TryGetProperty("body", out var body) || body.ValueKind != JsonValueKind.Object)
                    throw new BarRuleException("Este lote não corresponde ao tipo de importação selecionado.");
                var kind = OperationalValidation.Text(source, "kind");
                if ((rentals ? kind != "rentalGroups" : kind is not ("team" or "classes" or "enrollments")) ||
                    !Guid.TryParse(OperationalValidation.Text(body, "id"), out var id) || id == Guid.Empty || OperationalValidation.Version(body) != 0)
                    throw new BarRuleException(rentals ? "O lote aceita somente novos grupos mensalistas." : "A grade aceita somente novos professores, turmas e matrículas.");
                var payload = JsonNode.Parse(body.GetRawText())!.AsObject();
                // Keep the original source fields and user corrections in staging, referenced from each record.
                payload["importSource"] = JsonSerializer.SerializeToNode(new { batchId, sourceHash, externalId, sheet = reader.GetString(0), row = reader.GetInt32(1) });
                payload["name"] = OperationalValidation.Text(body, "name").Trim();
                items.Add(new(kind, id, payload["name"]!.GetValue<string>(), reader.GetString(0), reader.GetInt32(1), JsonSerializer.SerializeToElement(payload), null));
            }
        }
        if (count != items.Count || count is < 1 or > 500 || items.Select(x => x.Id).Distinct().Count() != count)
            throw new BarRuleException("Importação incompleta, extensa demais ou com identificadores repetidos.");
        var records = await db.OperationalRecords.AsNoTracking().OrderBy(row => row.Id).ToListAsync(ct);
        var snapshot = records.GroupBy(row => row.Kind).ToDictionary(group => group.Key, group => group.Select(row => JsonSerializer.Deserialize<JsonElement>(row.Payload)).ToArray());
        var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime.AddHours(-3));
        var applied = status == "Applied";
        var compared = new List<GradeImportItem>();
        foreach (var item in items.OrderBy(item => item.Kind switch { "team" => 0, "classes" => 1, _ => 2 }).ThenBy(item => item.SourceRow).ThenBy(item => item.Id))
        {
            string? error = null;
            var existing = records.SingleOrDefault(row => row.Id == item.Id);
            if (applied)
            {
                if (existing is null || existing.Kind != item.Kind) error = "Registro aplicado ausente. É necessário reconciliar o lote.";
            }
            else if (existing is not null) error = "Identificador já cadastrado. O importador não sobrescreve registros.";
            else if (item.Kind == "team" && records.Any(row => row.Kind == "team" && string.Equals(row.Name.Trim(), item.Name, StringComparison.OrdinalIgnoreCase)))
                error = "Professor já cadastrado. Use seu identificador nas turmas e retire a criação duplicada.";
            else if (rentals && snapshot.GetValueOrDefault("rentalGroups", []).Any(row => string.Equals(OperationalValidation.Text(row, "name").Trim(), item.Name, StringComparison.OrdinalIgnoreCase)))
                error = "Grupo já cadastrado. Confira o registro existente para evitar duplicidade.";
            else error = OperationalValidation.Validate(item.Kind, item.Id, item.Body, snapshot, today);
            compared.Add(item with { Conflict = error });
            if (!applied && error is null) snapshot[item.Kind] = [.. snapshot.GetValueOrDefault(item.Kind, []), item.Body];
        }
        // Changes between preview and apply require another reconciliation, including linked student/teacher edits.
        var material = JsonSerializer.Serialize(new { batchId, sourceHash, today, items = compared, records = records.Select(row => new { row.Id, row.Kind, row.Payload }) });
        var fingerprint = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(material)));
        return new(batchId, sourceName, applied, fingerprint, compared.ToArray());

        System.Data.Common.DbCommand Command(string sql)
        {
            var command = connection.CreateCommand(); command.CommandText = sql;
            command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
            var parameter = command.CreateParameter(); parameter.ParameterName = "id"; parameter.DbType = DbType.Guid; parameter.Value = batchId;
            command.Parameters.Add(parameter); return command;
        }
    }
}
