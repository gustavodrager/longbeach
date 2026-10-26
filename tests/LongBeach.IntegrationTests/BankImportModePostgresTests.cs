using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Billing;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace LongBeach.IntegrationTests;

public sealed class BankImportModePostgresTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 25, 15, 0, 0, TimeSpan.Zero);
    private static IConfiguration Config() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        [BankImportMode.Key] = "true", ["Payments:Billing:Enabled"] = "true",
        ["Integrations:C6:Enabled"] = "true", ["Integrations:C6:BankingEnabled"] = "true",
        ["Integrations:PagBankEdi:Enabled"] = "true"
    }).Build();

    [PostgresFact]
    public async Task Import_mode_preserves_pending_payments_refunds_and_entries_without_new_intents()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var actor = User.Create("Responsável fixture", Guid.NewGuid() + "@example.invalid", "fixture-only");
        var entryId = Guid.NewGuid();
        var entry = new OperationalRecord(entryId, "financeEntries", "Conta fixture", JsonSerializer.Serialize(new
        {
            id = entryId, name = "Conta fixture", amount = 100, direction = "Receber", dueDate = "2026-10-25",
            status = "Pendente", origin = "Arena", sourceKind = "", sourceId = "", paidDate = "", month = "2026-10"
        }));
        var account = new BillingAccount("Quadra", entry.Id, actor.Id, null, actor.Id);
        var pending = new BillingPayment(account.Id, Guid.NewGuid(), 40, "Pix", actor.Id, Now.AddMinutes(10));
        pending.Bind("ORDE_pending_fixture", "CHAR_pending_fixture", null, null);
        var approved = new BillingPayment(account.Id, Guid.NewGuid(), 60, "Pix", actor.Id, Now.AddMinutes(10));
        approved.Bind("ORDE_approved_fixture", "CHAR_approved_fixture", null, null); approved.Observe("PAID", 0, Now);
        var refund = new BillingRefund(approved.Id, Guid.NewGuid(), 10, 0, "Estorno fixture", actor.Id);
        db.AddRange(actor, entry, account, pending, approved, refund); await db.SaveChangesAsync();
        var paymentSnapshot = await db.Set<BillingPayment>().AsNoTracking().OrderBy(x => x.Id).Select(x => new { x.Id, x.State, x.Refunded, x.PaidAtUtc, x.Version }).ToArrayAsync();
        var originalPayload = entry.Payload; var auditCount = await db.AuditLogs.CountAsync(); db.ChangeTracker.Clear();
        var config = Config();
        // Any remote adapter access would throw; the import gate must stop before that.
        var service = new BillingService(db, null!, null!, null!, null!, new Clock(), NullLogger<BillingService>.Instance, config);
        await service.Recover(default);
        await Assert.ThrowsAsync<BarRuleException>(() => service.Refresh(account.Id, pending.Id, actor.Id, false, default));
        await Assert.ThrowsAsync<BarRuleException>(() => service.Refund(account.Id, approved.Id, new(Guid.NewGuid(), 5, "Nova solicitação fixture"), actor.Id, default));
        await Assert.ThrowsAsync<BarRuleException>(() => service.Pay(account.Id, null!, actor.Id, false, default));
        Assert.Equal(paymentSnapshot, await db.Set<BillingPayment>().AsNoTracking().OrderBy(x => x.Id).Select(x => new { x.Id, x.State, x.Refunded, x.PaidAtUtc, x.Version }).ToArrayAsync());
        Assert.Equal("Pending", (await db.Set<BillingRefund>().AsNoTracking().SingleAsync()).State);
        using var originalEntry = JsonDocument.Parse(originalPayload);
        using var savedEntry = JsonDocument.Parse((await db.OperationalRecords.AsNoTracking().SingleAsync()).Payload);
        Assert.True(JsonElement.DeepEquals(originalEntry.RootElement, savedEntry.RootElement));
        Assert.Equal(auditCount, await db.AuditLogs.CountAsync());
        Assert.False(db.ChangeTracker.HasChanges());
        var view = await service.Account(account.Id, null, default);
        Assert.Equal(60, view.Paid); Assert.Equal(40, view.Pending); Assert.Equal(0, view.Payable);
        Assert.Equal(10, view.Payments.Sum(x => x.RefundPending));
    }

    [PostgresFact]
    public async Task Current_position_uses_dated_C6_import_without_api_configuration_or_summing_snapshots()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var history = new FinancialHistoryService(db, new NullAuditContext(), new Clock(), Config());
        var absent = (await history.CurrentPosition(default)).CurrentBank;
        Assert.Equal("Imported", absent.Status); Assert.Null(absent.AmountCents); Assert.Null(absent.AsOfUtc); Assert.Null(absent.SourceDate);
        await Snapshot(db, "future", new(2026, 10, 26), 99999);
        Assert.Null((await history.CurrentPosition(default)).CurrentBank.AmountCents);
        await Snapshot(db, "earlier", new(2026, 10, 23), 200);
        var importedAt = await Snapshot(db, "latest", new(2026, 10, 24), -125);
        var selected = (await history.CurrentPosition(default)).CurrentBank;
        Assert.Equal("Imported", selected.Status); Assert.Equal(-125, selected.AmountCents);
        Assert.Equal(new DateOnly(2026, 10, 24), selected.SourceDate); Assert.Equal(importedAt, selected.AsOfUtc);
        Assert.Contains("latest", selected.Source); Assert.Contains("arquivo", selected.Issue);
        await Snapshot(db, "contradictory", new(2026, 10, 24), 500);
        var ambiguous = (await history.CurrentPosition(default)).CurrentBank;
        Assert.Equal("Imported", ambiguous.Status); Assert.Null(ambiguous.AmountCents); Assert.Null(ambiguous.AsOfUtc);
        Assert.Equal(new DateOnly(2026, 10, 24), ambiguous.SourceDate); Assert.Contains("mais de um saldo C6", ambiguous.Issue);
        var diagnostics = await history.Integrations(default);
        Assert.All(diagnostics, value => { Assert.Equal(BankImportMode.State, value.State); Assert.Empty(value.Requirements!); });
    }

    private static async Task<DateTimeOffset> Snapshot(LongBeachDbContext db, string label, DateOnly day, long amount)
    {
        var batch = Guid.NewGuid(); var hash = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        var importedAt = Now.AddMinutes(-5);
        var observation = new FinancialObservation("financial-observation-v1", "BRL", label + "!A1", "saldos", "Saldo C6", label,
            "Informado no arquivo", day, day, "snapshot", amount, "Fixture importada");
        var payload = JsonSerializer.Serialize(observation);
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO import_batches(id,source_name,source_sha256,status,row_count,created_at_utc) VALUES({batch},{label},{hash},'Applied',1,{importedAt})");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO financial_observations(id,batch_id,source_sha256,source_cell,series,metric,state,period_start,period_end,amount_cents,payload,created_at_utc) VALUES({Guid.NewGuid()},{batch},{hash},{observation.SourceCell},{observation.Series},{observation.Metric},{observation.State},{day},{day},{amount},{payload}::jsonb,{importedAt})");
        return importedAt;
    }

    private sealed class Clock : TimeProvider { public override DateTimeOffset GetUtcNow() => Now; }
}
