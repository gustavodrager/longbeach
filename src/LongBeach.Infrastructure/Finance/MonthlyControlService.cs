using System.Data;
using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Auditing;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Finance;

public sealed partial class FinancialHistoryService
{
    private static readonly JsonSerializerOptions MonthlyJson = new(JsonSerializerDefaults.Web);
    public async Task<MonthlyControlReport> MonthlyControl(string? month, CancellationToken ct)
    {
        var months = await db.OperationalRecords.AsNoTracking().Where(x => x.Kind == MonthlyControlRules.Kind)
            .OrderByDescending(x => x.Name).Select(x => x.Name).ToArrayAsync(ct);
        month ??= months.FirstOrDefault() ?? time.GetUtcNow().AddHours(-3).ToString("yyyy-MM");
        MonthlyControlRules.Month(month);
        var payload = await db.OperationalRecords.AsNoTracking().Where(x => x.Kind == MonthlyControlRules.Kind && x.Name == month)
            .Select(x => x.Payload).SingleOrDefaultAsync(ct);
        return new(month, months, payload is null ? null : JsonSerializer.Deserialize<MonthlyControlDocument>(payload, MonthlyJson));
    }

    public async Task<MonthlyControlDocument> SaveMonthlyControl(string month, MonthlyControlInput input, CancellationToken ct)
    {
        MonthlyControlRules.Validate(month, input);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
        var record = await db.OperationalRecords.SingleOrDefaultAsync(x => x.Kind == MonthlyControlRules.Kind && x.Name == month, ct);
        var existing = record is null ? null : JsonSerializer.Deserialize<MonthlyControlDocument>(record.Payload, MonthlyJson)!;
        if (existing is not null && existing.Notes == input.Notes && existing.Lines.SequenceEqual(input.Lines)) return existing;
        if (input.Version != (existing?.Version ?? 0))
            throw new MonthlyControlConflictException("Este controle mudou. Atualize a página e confira os valores antes de salvar.");
        var saved = new MonthlyControlDocument(month, checked(input.Version + 1), input.Lines, input.Notes, time.GetUtcNow());
        var json = JsonSerializer.Serialize(saved, MonthlyJson);
        if (record is null)
        {
            record = new OperationalRecord(Guid.NewGuid(), MonthlyControlRules.Kind, month, json);
            db.OperationalRecords.Add(record);
        }
        else record.Update(month, json);
        db.AuditLogs.Add(AuditLog.Create(audit.UserId, "MonthlyFinancialControlSaved", "OperationalRecord", record.Id.ToString(),
            JsonSerializer.Serialize(new { Month = month, Previous = existing, Current = saved }),
            audit.IpAddress, audit.UserAgent, audit.CorrelationId, time.GetUtcNow()));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return saved;
    }
}
