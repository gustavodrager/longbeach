using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace LongBeach.IntegrationTests;

public sealed class BankImportDeduplicationPostgresTests
{
    [PostgresFact]
    public async Task Reexports_match_bank_identity_across_files_and_accept_additional_same_day_movements()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var history = History(db);
        foreach (var bank in new[] { "pagbank", "c6" })
        {
            var original = Row(bank);
            var balance = Row(bank, kind: "balance");
            var first = await Stage(db, original, balance);
            var initial = await history.Preview(first.Id, default);
            Assert.Equal(2, initial.Creates); Assert.Equal(0, initial.Matches);
            await history.Apply(first.Id, initial.ConfirmationToken, default);
            var additional = original with { SourceCell = Cell(bank, "movement", 'b'), Label = "Outro movimento na mesma data", AmountCents = 2350 };
            var laterBalance = balance with { SourceCell = Cell(bank, "balance", 'b'), PeriodStart = balance.PeriodStart.AddDays(1), PeriodEnd = balance.PeriodEnd.AddDays(1), AmountCents = 9000 };
            var second = await Stage(db, original, additional, balance, laterBalance);
            var preview = await history.Preview(second.Id, default);
            Assert.Equal(2, preview.Creates); Assert.Equal(2, preview.Matches);
            await history.Apply(second.Id, preview.ConfirmationToken, default);
            Assert.Equal(2, await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM financial_observations WHERE source_sha256={second.Hash}").SingleAsync());
            Assert.Equal(first.Hash, await db.Database.SqlQuery<string>($"SELECT trim(source_sha256) AS \"Value\" FROM financial_observations WHERE source_cell={original.SourceCell}").SingleAsync());
            var audit = await db.AuditLogs.AsNoTracking().SingleAsync(x => x.Action == "FinancialHistoryApplied" && x.ResourceId == second.Id.ToString());
            using (var details = JsonDocument.Parse(audit.MetadataJson))
            {
                Assert.Equal(2, details.RootElement.GetProperty("Created").GetInt32());
                Assert.Equal(2, details.RootElement.GetProperty("Matched").GetInt32());
            }
            var third = await Stage(db, original, additional, balance, laterBalance);
            var replay = await history.Preview(third.Id, default);
            Assert.Equal(0, replay.Creates); Assert.Equal(4, replay.Matches);
            await history.Apply(third.Id, replay.ConfirmationToken, default);
            await history.Apply(third.Id, replay.ConfirmationToken, default);
            Assert.Equal(0, await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM financial_observations WHERE source_sha256={third.Hash}").SingleAsync());
            var report = await history.Report("2076-10", bank + "-conta", null, 1, default);
            Assert.Equal(2, report.Total); Assert.Equal(original, report.Items.Single(x => x.Data.SourceCell == original.SourceCell).Data);
        }
    }

    [PostgresFact]
    public async Task Existing_bank_identity_rejects_reinterpreted_payload_and_applies_no_part_of_the_batch()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var history = History(db); var original = Row();
        var first = await Stage(db, original); await Apply(history, first.Id);
        FinancialObservation[] changes = [original with { AmountCents = original.AmountCents + 1 },
            original with { PeriodStart = original.PeriodStart.AddMonths(1), PeriodEnd = original.PeriodEnd.AddMonths(1) },
            original with { Label = "Descrição reinterpretada" }, original with { Notes = "Outra classificação" },
            original with { Metric = "saidas-extrato", AmountCents = -original.AmountCents }];
        foreach (var changed in changes)
        {
            var additional = Row(id: 'b');
            var staged = await Stage(db, changed, additional);
            await Assert.ThrowsAsync<FinancialRuleException>(() => history.Preview(staged.Id, default));
            var token = FinancialHistoryRules.Fingerprint(staged.Hash, [changed, additional]);
            await Assert.ThrowsAsync<FinancialRuleException>(() => history.Apply(staged.Id, token, default));
            Assert.Equal("NeedsReview", await db.Database.SqlQuery<string>($"SELECT status AS \"Value\" FROM import_batches WHERE id={staged.Id}").SingleAsync());
            Assert.Equal(1, await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM financial_observations").SingleAsync());
        }
    }

    [PostgresFact]
    public async Task Same_account_snapshot_date_rejects_another_id_even_when_amount_matches()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var history = History(db); var original = Row(kind: "balance");
        var first = await Stage(db, original); await Apply(history, first.Id);
        foreach (var amount in new[] { original.AmountCents, original.AmountCents + 1 })
        {
            var anotherId = original with { SourceCell = Cell("c6", "balance", 'b'), AmountCents = amount };
            var staged = await Stage(db, anotherId);
            await Assert.ThrowsAsync<FinancialRuleException>(() => history.Preview(staged.Id, default));
        }
        var otherAccount = original with { SourceCell = Cell("c6", "balance", 'a', "fedcba9876543210") };
        var different = await Stage(db, otherAccount); Assert.Equal(1, (await history.Preview(different.Id, default)).Creates);
        await Apply(history, different.Id);
        var repeatedSameDay = await Stage(db, original with { PeriodStart = new(2076, 11, 25), PeriodEnd = new(2076, 11, 25), SourceCell = Cell("c6", "balance", 'c') },
            original with { PeriodStart = new(2076, 11, 25), PeriodEnd = new(2076, 11, 25), SourceCell = Cell("c6", "balance", 'd') });
        await Assert.ThrowsAsync<FinancialRuleException>(() => history.Preview(repeatedSameDay.Id, default));
    }

    [PostgresFact]
    public async Task Bank_identity_never_bypasses_overlapping_legacy_aggregate_in_either_direction_or_same_file()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var history = History(db);
        foreach (var scenario in new[] { 0, 1, 2 })
        {
            var day = new DateOnly(2076, 5 + scenario, 25);
            var bank = Row(id: (char)('a' + scenario)) with { PeriodStart = day, PeriodEnd = day };
            var legacy = bank with { SourceCell = "Extrato!A" + scenario, Grain = "month", PeriodStart = new(day.Year, day.Month, 1), PeriodEnd = new DateOnly(day.Year, day.Month, 1).AddMonths(1).AddDays(-1) };
            var existing = await Stage(db, scenario == 1 ? bank : legacy); await Apply(history, existing.Id);
            var incoming = scenario == 1 ? legacy : bank;
            var next = await StageWithHash(db, scenario == 2 ? existing.Hash : Hash(), [incoming]);
            await Assert.ThrowsAsync<FinancialRuleException>(() => history.Preview(next.Id, default));
        }
    }

    private static FinancialHistoryService History(LongBeachDbContext db) => new(db, new NullAuditContext(), TimeProvider.System, new ConfigurationBuilder().Build());
    private static async Task Apply(FinancialHistoryService history, Guid id)
    {
        await history.Apply(id, (await history.Preview(id, default)).ConfirmationToken, default);
    }
    private static string Hash() => Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
    private static string Cell(string bank, string kind, char id, string account = "0123456789abcdef") => $"bank-v1:{bank}:{account}:{kind}:{new string(id, 32)}";
    private static FinancialObservation Row(string bank = "c6", string kind = "movement", char id = 'a') =>
        new("financial-observation-v1", "BRL", Cell(bank, kind, id), kind == "movement" ? bank + "-conta" : "saldos",
            kind == "movement" ? "entradas-extrato" : bank == "c6" ? "Saldo C6" : "Saldo Pagbank", "Descrição original",
            "Informado", new(2076, 10, 25), new(2076, 10, 25), kind == "movement" ? "day" : "snapshot", 1250, "Preservar origem");
    private static Task<(Guid Id, string Hash)> Stage(LongBeachDbContext db, params FinancialObservation[] rows) => StageWithHash(db, Hash(), rows);
    private static async Task<(Guid Id, string Hash)> StageWithHash(LongBeachDbContext db, string hash, FinancialObservation[] rows)
    {
        var batch = Guid.NewGuid(); var source = "fixture-" + batch + ".json";
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO import_batches(id,source_name,source_sha256,status,row_count,created_at_utc) VALUES({batch},{source},{hash},'NeedsReview',{rows.Length},{DateTimeOffset.UtcNow})");
        for (var index = 0; index < rows.Length; index++)
        {
            var json = JsonSerializer.Serialize(rows[index]); var external = "finance:" + rows[index].SourceCell;
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO import_rows(id,batch_id,source_sheet,source_row,record_type,external_id,payload,review_status) VALUES({Guid.NewGuid()},{batch},'Fixture',{index + 2},'reference-data',{external},{json}::jsonb,'NeedsReview')");
        }
        return (batch, hash);
    }
}
