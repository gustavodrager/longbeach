using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Domain.Auditing;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Metadata;

namespace LongBeach.Infrastructure.Auditing;

public sealed class AuditSaveChangesInterceptor(
    IAuditContext auditContext,
    TimeProvider timeProvider) : SaveChangesInterceptor
{
    private static readonly string[] SensitiveFragments =
        ["password", "token", "secret", "key"];

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        AppendAuditEntries(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        AppendAuditEntries(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void AppendAuditEntries(DbContext? dbContext)
    {
        if (dbContext is null)
        {
            return;
        }

        dbContext.ChangeTracker.DetectChanges();
        var now = timeProvider.GetUtcNow();
        var candidates = dbContext.ChangeTracker
            .Entries()
            .Where(entry => entry.Entity is not AuditLog &&
                            entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToArray();

        if (candidates.Length == 0)
        {
            return;
        }

        var audits = candidates.Select(entry => AuditLog.Create(
            auditContext.UserId,
            entry.State.ToString(),
            entry.Metadata.ClrType.Name,
            GetPrimaryKey(entry),
            JsonSerializer.Serialize(BuildChanges(entry)),
            auditContext.IpAddress,
            auditContext.UserAgent,
            auditContext.CorrelationId,
            now));

        dbContext.Set<AuditLog>().AddRange(audits);
    }

    private static string? GetPrimaryKey(EntityEntry entry)
    {
        var values = entry.Properties
            .Where(property => property.Metadata.IsPrimaryKey())
            .Select(property => property.CurrentValue?.ToString())
            .Where(value => !string.IsNullOrWhiteSpace(value));

        var key = string.Join(':', values);
        return string.IsNullOrWhiteSpace(key) ? null : key;
    }

    private static object BuildChanges(EntityEntry entry)
    {
        if (entry.Entity is OperationalRecord record)
        {
            if (record.Kind == "financeEntries")
                return new { record.Kind, Classification = new
                {
                    Before = entry.State == EntityState.Added ? null : Classification(entry.Property(nameof(OperationalRecord.Payload)).OriginalValue as string),
                    After = Classification(record.Payload)
                }, Data = "[OMITTED: may contain personal data]" };
            return new { record.Kind, Data = "[OMITTED: may contain personal data]" };
        }
        if (entry.State == EntityState.Modified)
        {
            return entry.Properties
                .Where(property => property.IsModified)
                .ToDictionary(
                    property => property.Metadata.Name,
                    property => (object)new
                    {
                        Before = SafeValue(property.Metadata.Name, property.OriginalValue),
                        After = SafeValue(property.Metadata.Name, property.CurrentValue)
                    });
        }

        var useOriginal = entry.State == EntityState.Deleted;
        return entry.Properties.ToDictionary(
            property => property.Metadata.Name,
            property => SafeValue(
                property.Metadata.Name,
                useOriginal ? property.OriginalValue : property.CurrentValue));
    }

    private static object? Classification(string? payload)
    {
        if (payload is null) return null;
        using var doc = JsonDocument.Parse(payload);
        string? Read(string key, params string[] allowed) => doc.RootElement.TryGetProperty(key, out var value)
            && value.ValueKind == JsonValueKind.String && allowed.Contains(value.GetString()) ? value.GetString() : null;
        return new { AllocationScope = Read("allocationScope", "Unit", "Shared", "Unclassified"), BusinessUnitId = Read("businessUnitId", "bar", "quadra") };
    }

    private static object? SafeValue(string propertyName, object? value) =>
        SensitiveFragments.Any(fragment => propertyName.Contains(fragment, StringComparison.OrdinalIgnoreCase))
            ? "[REDACTED]"
            : value;
}
