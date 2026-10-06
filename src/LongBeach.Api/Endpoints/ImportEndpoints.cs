using System.Data;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using LongBeach.Application.Authorization;
using LongBeach.Domain.Auditing;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace LongBeach.Api.Endpoints;

public static partial class ImportEndpoints
{
    private const int MaxRows = 2_000;
    private const int MaxPayloadBytes = 32_768;
    private static readonly HashSet<string> RecordTypes = ["student", "student-history", "class-session", "rental", "cost", "balance", "customer-summary", "calendar", "reference-data"];

    public static IEndpointRouteBuilder MapImportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/imports").WithTags("Imports").RequireAuthorization(AuthorizationPolicyCatalog.Owner);
        group.MapGet("/", ListBatches);
        group.MapGet("/{batchId:guid}/rows", ListRows);
        group.MapGet("/{batchId:guid}/bar-catalog", (Guid batchId, LongBeach.Application.Bar.ICatalogImport service, CancellationToken ct) => service.Preview(batchId, ct));
        group.MapPost("/{batchId:guid}/bar-catalog/apply", (Guid batchId, LongBeach.Contracts.Bar.ApplyCatalogImportInput input, LongBeach.Application.Bar.ICatalogImport service, CancellationToken ct) => service.Apply(batchId, input.ConfirmationToken, ct));
        group.MapPost("/", StageBatch).WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(8_000_000));
        return endpoints;
    }

    private static async Task<IResult> StageBatch(ImportBatchInput input, HttpContext http, LongBeachDbContext db, CancellationToken ct)
    {
        var sourceName = Path.GetFileName(input.SourceName?.Trim() ?? string.Empty);
        if (string.IsNullOrWhiteSpace(sourceName) || sourceName.Length > 240 || !Sha256Regex().IsMatch(input.SourceSha256 ?? string.Empty))
            return Results.BadRequest(new { message = "Informe o nome do arquivo e o SHA-256 de 64 caracteres." });
        var records = input.Records;
        if (records is null || records.Count == 0 || records.Count > MaxRows)
            return Results.BadRequest(new { message = $"O lote deve ter de 1 a {MaxRows} linhas." });

        var serialized = new List<string>(records.Count);
        foreach (var row in records)
        {
            if (string.IsNullOrWhiteSpace(row.SheetName) || row.SheetName.Length > 160 || row.RowNumber < 1 ||
                !RecordTypes.Contains(row.RecordType) || row.Data.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
                return Results.BadRequest(new { message = "Uma linha do lote tem aba, linha, tipo ou conteúdo inválido." });
            var payload = row.Data.GetRawText();
            if (System.Text.Encoding.UTF8.GetByteCount(payload) > MaxPayloadBytes)
                return Results.BadRequest(new { message = "Uma linha ultrapassa o limite de 32 KB." });
            serialized.Add(payload);
        }

        var connection = db.Database.GetDbConnection();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await using (var existing = connection.CreateCommand())
        {
            existing.Transaction = db.Database.CurrentTransaction!.GetDbTransaction();
            existing.CommandText = "SELECT id, row_count, status FROM import_batches WHERE source_name = $1 AND source_sha256 = $2";
            Add(existing, sourceName, DbType.String);
            Add(existing, input.SourceSha256!.ToLowerInvariant(), DbType.String);
            await using var reader = await existing.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
                return Results.Ok(new { id = reader.GetGuid(0), rowCount = reader.GetInt32(1), status = reader.GetString(2), alreadyImported = true });
        }

        var batchId = Guid.NewGuid();
        var actorId = Guid.TryParse(http.User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ? userId : (Guid?)null;
        var now = DateTimeOffset.UtcNow;
        await using (var batch = connection.CreateCommand())
        {
            batch.Transaction = db.Database.CurrentTransaction!.GetDbTransaction();
            batch.CommandText = "INSERT INTO import_batches (id, source_name, source_sha256, status, row_count, created_by, created_at_utc) VALUES ($1,$2,$3,'NeedsReview',$4,$5,$6)";
            Add(batch, batchId, DbType.Guid); Add(batch, sourceName, DbType.String); Add(batch, input.SourceSha256!.ToLowerInvariant(), DbType.String);
            Add(batch, records.Count, DbType.Int32); Add(batch, actorId, DbType.Guid); Add(batch, now, DbType.DateTimeOffset);
            await batch.ExecuteNonQueryAsync(ct);
        }

        for (var i = 0; i < records.Count; i++)
        {
            var row = records[i];
            await using var insert = connection.CreateCommand();
            insert.Transaction = db.Database.CurrentTransaction!.GetDbTransaction();
            insert.CommandText = "INSERT INTO import_rows (id, batch_id, source_sheet, source_row, record_type, external_id, payload, review_status) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'NeedsReview')";
            Add(insert, Guid.NewGuid(), DbType.Guid); Add(insert, batchId, DbType.Guid); Add(insert, row.SheetName, DbType.String);
            Add(insert, row.RowNumber, DbType.Int32); Add(insert, row.RecordType, DbType.String); Add(insert, row.ExternalId, DbType.String);
            Add(insert, serialized[i], DbType.String);
            await insert.ExecuteNonQueryAsync(ct);
        }

        db.AuditLogs.Add(AuditLog.Create(actorId, "ImportStaged", "ImportBatch", batchId.ToString(),
            JsonSerializer.Serialize(new { sourceName, sourceSha256 = input.SourceSha256!.ToLowerInvariant(), rowCount = records.Count, status = "NeedsReview" }),
            http.Connection.RemoteIpAddress?.ToString(), http.Request.Headers.UserAgent.ToString(), http.TraceIdentifier, now));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Created($"/api/v1/imports/{batchId}", new { id = batchId, sourceName, rowCount = records.Count, status = "NeedsReview", alreadyImported = false });
    }

    private static async Task<IResult> ListBatches(LongBeachDbContext db, CancellationToken ct)
    {
        var connection = db.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, source_name, source_sha256, status, row_count, created_at_utc FROM import_batches ORDER BY created_at_utc DESC";
        if (connection.State != ConnectionState.Open) await connection.OpenAsync(ct);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var result = new List<object>();
        while (await reader.ReadAsync(ct))
            result.Add(new { id = reader.GetGuid(0), sourceName = reader.GetString(1), sourceSha256 = reader.GetString(2).Trim(), status = reader.GetString(3), rowCount = reader.GetInt32(4), createdAtUtc = reader.GetFieldValue<DateTimeOffset>(5) });
        return Results.Ok(result);
    }

    private static async Task<IResult> ListRows(Guid batchId, int offset, int limit, string? recordType, LongBeachDbContext db, CancellationToken ct)
    {
        if (offset < 0 || offset > 10_000 || limit is < 1 or > 100) return Results.BadRequest(new { message = "Paginação inválida." });
        var connection = db.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT source_sheet, source_row, record_type, external_id, payload::text, review_status FROM import_rows WHERE batch_id = $1 AND ($2 IS NULL OR record_type = $2) ORDER BY source_sheet, source_row OFFSET $3 LIMIT $4";
        Add(command, batchId, DbType.Guid); Add(command, recordType, DbType.String); Add(command, offset, DbType.Int32); Add(command, limit, DbType.Int32);
        if (connection.State != ConnectionState.Open) await connection.OpenAsync(ct);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var result = new List<object>();
        while (await reader.ReadAsync(ct))
            result.Add(new { sheetName = reader.GetString(0), rowNumber = reader.GetInt32(1), recordType = reader.GetString(2), externalId = reader.IsDBNull(3) ? null : reader.GetString(3), data = JsonSerializer.Deserialize<JsonElement>(reader.GetString(4)), reviewStatus = reader.GetString(5) });
        return Results.Ok(new { batchId, offset, limit, rows = result });
    }

    private static void Add(System.Data.Common.DbCommand command, object? value, DbType type)
    {
        var parameter = command.CreateParameter();
        parameter.DbType = type;
        parameter.Value = value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    [GeneratedRegex("^[a-fA-F0-9]{64}$", RegexOptions.CultureInvariant)]
    private static partial Regex Sha256Regex();

    public sealed record ImportBatchInput(string? SourceName, string? SourceSha256, List<ImportRecordInput>? Records);
    public sealed record ImportRecordInput(string SheetName, int RowNumber, string RecordType, string? ExternalId, JsonElement Data);
}
