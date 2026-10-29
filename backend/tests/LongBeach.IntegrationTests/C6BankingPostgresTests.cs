using System.Net;
using System.Net.Http.Headers;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Finance;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.C6;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class C6BankingPostgresTests
{
    private static LongBeachDbContext Database() => new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).Options, TimeProvider.System);
    private static IConfiguration Config(string? account = null, string environment = "Sandbox") => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Integrations:C6:Enabled"] = "true", ["Integrations:C6:BankingEnabled"] = "true", ["Integrations:C6:AccountId"] = account ?? "test-" + Guid.NewGuid().ToString("N"),
        ["Integrations:C6:Environment"] = environment, ["Integrations:C6:ClientId"] = "test-only", ["Integrations:C6:ClientSecret"] = "test-only", ["Integrations:C6:CertificatePath"] = "test-only.pfx"
    }).Build();
    private static ServiceProvider Services(IC6BankingApi feed) => new ServiceCollection().AddSingleton(TimeProvider.System)
        .AddDbContext<LongBeachDbContext>(o => o.UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")))
        .AddSingleton(feed).BuildServiceProvider();
    private static C6BankingWorker Worker(ServiceProvider services, IConfiguration config, TimeProvider clock) =>
        new(services.GetRequiredService<IServiceScopeFactory>(), config, clock, NullLogger<C6BankingWorker>.Instance);
    private static FinancialHistoryService History(LongBeachDbContext db, IConfiguration config, TimeProvider clock) => new(db, new NullAuditContext(), clock, config);

    [PostgresFact]
    public async Task Repeated_collection_is_idempotent_preserves_documents_and_never_creates_income()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var clock = new Clock(); var config = Config(); var feed = new Feed(); using var services = Services(feed); var worker = Worker(services, config, clock);
        var financialRecords = await db.OperationalRecords.CountAsync();
        await worker.Run(default);
        Assert.Equal(new DateOnly(2026, 9, 20), feed.Periods[0].From); Assert.Equal(new DateOnly(2026, 10, 19), feed.Periods[0].Through);
        await worker.Run(default); await worker.Run(default);
        Assert.Equal(new DateOnly(2026, 10, 17), feed.Periods[1].From);
        var report = await History(db, config, clock).C6Statement(null, null, 1, default);
        Assert.Equal(1, report.Total); Assert.Equal(1250, Assert.Single(report.Items).AmountCents);
        Assert.Equal(financialRecords, await db.OperationalRecords.CountAsync());
        var account = config["Integrations:C6:AccountId"]!;
        Assert.Equal(3, await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM c6_finance_documents WHERE account_id={account}").SingleAsync());
        Assert.Equal(1, await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM c6_balance_snapshots WHERE account_id={account}").SingleAsync());
        var balance = (await History(db, config, clock).CurrentPosition(default)).CurrentBank;
        Assert.Equal(-4205, balance.AmountCents); Assert.Equal("Current", balance.Status); Assert.Equal("Sandbox", balance.Environment);
        clock.Now = clock.Now.AddMinutes(31);
        Assert.Equal("Stale", (await History(db, config, clock).CurrentPosition(default)).CurrentBank.Status);
        Assert.Equal("Coleta atrasada", (await History(db, config, clock).Integrations(default)).Single(x => x.Provider == "C6 saldo e extrato").State);
    }

    [PostgresFact]
    public async Task Invalid_balance_rolls_back_statement_and_retry_releases_lock()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var clock = new Clock(); var config = Config(); var feed = new Feed { InvalidBalance = true }; using var services = Services(feed); var worker = Worker(services, config, clock);
        await Assert.ThrowsAsync<FinancialRuleException>(() => worker.Run(default));
        var account = config["Integrations:C6:AccountId"]!;
        Assert.Equal(0, await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM c6_finance_documents WHERE account_id={account}").SingleAsync());
        Assert.Empty((await History(db, config, clock).C6Statement(null, null, 1, default)).Items);
        feed.InvalidBalance = false; await worker.Run(default);
        Assert.Single((await History(db, config, clock).C6Statement(null, null, 1, default)).Items);
    }

    [PostgresFact]
    public async Task Historical_replay_preserves_cursor_failure_and_balance_and_audits_actor()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var clock = new Clock(); var config = Config(); var feed = new Feed(); using var services = Services(feed); var worker = Worker(services, config, clock);
        await worker.Run(default); await worker.RecordFailure("C6_HTTP_503", default);
        var actor = User.Create("C6 teste", Guid.NewGuid() + "@example.invalid", "test-only"); db.Add(actor); await db.SaveChangesAsync();
        var account = config["Integrations:C6:AccountId"]!;
        var date = new DateOnly(2026, 9, 1);
        await worker.Reprocess(date, date.AddDays(1), "Conferência bancária", actor.Id, default);
        Assert.Equal(new DateOnly(2026, 10, 19), await db.Database.SqlQuery<DateOnly>($"SELECT complete_through AS \"Value\" FROM c6_sync_state WHERE account_id={account}").SingleAsync());
        Assert.Equal("C6_HTTP_503", await db.Database.SqlQuery<string>($"SELECT failure_code AS \"Value\" FROM c6_sync_state WHERE account_id={account}").SingleAsync());
        Assert.Equal(1, feed.BalanceReads);
        Assert.True(await db.AuditLogs.AnyAsync(x => x.ActorUserId == actor.Id && x.Action == "C6StatementReprocessed"));
        var before = feed.Periods.Count; await worker.Run(default); Assert.Equal(before, feed.Periods.Count); // Retry backoff remains active.
        await Assert.ThrowsAsync<FinancialRuleException>(() => worker.Reprocess(date, date.AddDays(30), "Período excessivo", actor.Id, default));
    }

    [PostgresFact]
    public async Task Corrected_source_is_versioned_and_accounts_and_environments_are_isolated()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var clock = new Clock(); var account = "test-" + Guid.NewGuid().ToString("N"); var sandbox = Config(account); var production = Config(account, "Production");
        var feed = new Feed(); using var services = Services(feed); var worker = Worker(services, sandbox, clock);
        await worker.Run(default);
        var initial = Assert.Single((await History(db, sandbox, clock).C6Statement(null, null, 1, default)).Items);
        feed.Amount = "19.00"; await worker.Run(default);
        var revised = Assert.Single((await History(db, sandbox, clock).C6Statement(null, null, 1, default)).Items);
        Assert.Equal(initial.Id, revised.Id); Assert.Equal(1900, revised.AmountCents); Assert.NotEqual(initial.SourceSha256, revised.SourceSha256);
        Assert.Equal(3, await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM c6_finance_documents WHERE account_id={account}").SingleAsync());
        Assert.Empty((await History(db, production, clock).C6Statement(null, null, 1, default)).Items);
        feed.Amount = "21.00"; await Worker(services, production, clock).Run(default);
        Assert.Equal(2100, Assert.Single((await History(db, production, clock).C6Statement(null, null, 1, default)).Items).AmountCents);
        Assert.Equal(1900, Assert.Single((await History(db, sandbox, clock).C6Statement(null, null, 1, default)).Items).AmountCents);
        Assert.Empty((await History(db, Config(), clock).C6Statement(null, null, 1, default)).Items);
    }

    [Fact]
    public async Task Statement_and_reprocess_require_management()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/financial-history/c6")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), ["Operations"], ["finance:read"]));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/financial-history/c6")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/v1/financial-history/c6/reprocess", new StringContent("{}", Encoding.UTF8, "application/json"))).StatusCode);
    }

    [PostgresFact]
    public async Task Statement_matches_only_exact_bank_identity_in_same_scope_without_settling_payment()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var clock = new Clock(); var config = Config(); var feed = new Feed(); using var services = Services(feed);
        var actor = User.Create("Conciliação C6 teste", Guid.NewGuid() + "@example.invalid", "test-only"); db.Add(actor);
        var accountId = config["Integrations:C6:AccountId"]!;
        BillingPayment Payment(string bankAccount, string environment, string provider = "C6")
        {
            var student = Guid.NewGuid(); var enrollment = Guid.NewGuid(); var entry = Guid.NewGuid();
            db.AddRange(new OperationalRecord(student, "students", "Aluno C6", JsonSerializer.Serialize(new { id = student, name = "Aluno C6" })),
                new OperationalRecord(enrollment, "enrollments", "Matrícula C6", JsonSerializer.Serialize(new { id = enrollment, studentId = student })),
                new OperationalRecord(entry, "financeEntries", "Mensalidade C6", JsonSerializer.Serialize(new
                {
                    id = entry, name = "Mensalidade C6", amount = 12.50m, dueDate = "2026-10-20", month = "2026-10", direction = "Receber",
                    origin = "Escola", sourceKind = "enrollments", sourceId = enrollment, status = "Pendente", paidDate = "", version = 1
                })));
            var account = new BillingAccount("Quadra", entry, actor.Id, student, actor.Id); db.Add(account);
            var payment = new BillingPayment(account.Id, Guid.NewGuid(), 12.50m, "Pix", actor.Id, clock.GetUtcNow().AddMinutes(10), provider, environment, bankAccount);
            db.Add(payment);
            // Simulate provider identity fields already stored; the query must still enforce provider scope.
            if (provider == "C6") payment.ObservePixIdentity("Etest");
            else db.Entry(payment).Property(x => x.PixEndToEndId).CurrentValue = "Etest";
            return payment;
        }
        Payment(accountId + "-other", "Sandbox");
        Payment(accountId, "Production");
        Payment(accountId, "Sandbox", "PagBank");
        await db.SaveChangesAsync();
        await Worker(services, config, clock).Run(default);
        Assert.Null(Assert.Single((await History(db, config, clock).C6Statement(null, null, 1, default)).Items).LinkedPaymentId);
        var exact = Payment(accountId, "Sandbox"); await db.SaveChangesAsync();
        Assert.False(await db.Set<BillingAccount>().Where(x => x.UserId == actor.Id)
            .AnyAsync(x => !db.OperationalRecords.Any(r => r.Id == x.SourceId && r.Kind == "financeEntries")));
        var recordCount = await db.OperationalRecords.CountAsync();
        var item = Assert.Single((await History(db, config, clock).C6Statement(null, null, 1, default)).Items);
        Assert.Equal(exact.Id, item.LinkedPaymentId);
        await db.Entry(exact).ReloadAsync(); Assert.Equal("Pending", exact.State);
        Assert.Equal(recordCount, await db.OperationalRecords.CountAsync());
    }

    [PostgresFact]
    public async Task Delayed_cursor_catches_up_in_thirty_day_windows_without_gaps()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var clock = new Clock(); var config = Config(); var feed = new Feed(); using var services = Services(feed); var worker = Worker(services, config, clock);
        var account = config["Integrations:C6:AccountId"]!;
        var today = new DateOnly(2026, 10, 19); var previous = today.AddDays(-75);
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO c6_sync_state(environment,account_id,complete_through) VALUES('Sandbox',{account},{previous})");
        for (var pass = 0; pass < 3; pass++)
        {
            await worker.Run(default);
            var requested = feed.Periods[pass];
            Assert.Equal(previous.AddDays(-2), requested.From);
            Assert.InRange(requested.Through.DayNumber - requested.From.DayNumber, 0, 29);
            Assert.True(requested.Through > previous);
            previous = await db.Database.SqlQuery<DateOnly>($"SELECT complete_through AS \"Value\" FROM c6_sync_state WHERE environment='Sandbox' AND account_id={account}").SingleAsync();
            Assert.Equal(requested.Through, previous);
        }
        Assert.Equal(today, previous);
    }

    [PostgresFact]
    public async Task Indistinguishable_movements_reject_whole_batch_and_preserve_last_confirmed_read()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var clock = new Clock(); var config = Config(); var feed = new Feed(); using var services = Services(feed); var worker = Worker(services, config, clock);
        await worker.Run(default);
        var before = Assert.Single((await History(db, config, clock).C6Statement(null, null, 1, default)).Items);
        feed.DuplicateUnidentified = true;
        Assert.Equal("C6_STATEMENT_INCONSISTENT", (await Assert.ThrowsAsync<FinancialRuleException>(() => worker.Run(default))).Message);
        var after = Assert.Single((await History(db, config, clock).C6Statement(null, null, 1, default)).Items);
        Assert.Equal(before, after);
        var account = config["Integrations:C6:AccountId"]!;
        Assert.Equal(2, await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM c6_finance_documents WHERE account_id={account}").SingleAsync());
        Assert.Equal(1, feed.BalanceReads);
    }

    [PostgresFact]
    public async Task Late_failure_from_an_older_attempt_cannot_override_a_newer_success()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var clock = new Clock(); var config = Config(); var feed = new Feed(); using var services = Services(feed); var worker = Worker(services, config, clock);
        var olderAttempt = clock.Now;
        clock.Now = clock.Now.AddMinutes(1); await worker.Run(default);
        // A failed replica may report after releasing its lock, while another replica already succeeded.
        await worker.RecordFailure("C6_HTTP_503", default, olderAttempt);
        var state = (await History(db, config, clock).Integrations(default)).Single(x => x.Provider == "C6 saldo e extrato");
        Assert.Equal("Automático", state.State); Assert.Null(state.FailureCode); Assert.Equal(clock.Now, state.LastSuccessUtc);
    }

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = new(2026, 10, 19, 15, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class Feed : IC6BankingApi
    {
        public bool InvalidBalance;
        public bool DuplicateUnidentified;
        public int BalanceReads;
        public string Amount = "12.50";
        public List<(DateOnly From, DateOnly Through)> Periods { get; } = [];
        public Task<JsonDocument> Statement(DateOnly from, DateOnly through, CancellationToken ct)
        {
            Periods.Add((from, through));
            var row = new
            {
                reference = DuplicateUnidentified ? null : "test-" + through.ToString("yyyyMMdd"), local_reference = DuplicateUnidentified ? null : "local-test", entry_date = through.ToString("yyyy-MM-dd"),
                created_at = through.ToString("yyyy-MM-dd") + "T00:01:00", amount = Amount, title = "Recebimento fictício", description = "Fixture",
                operation_type = "INCOMING", transaction_type = "CREDIT_QRCODE_PIX_PAYMENT_RECEIVED", end_to_end_id = "Etest"
            };
            return Task.FromResult(JsonDocument.Parse(JsonSerializer.Serialize(new { entries = DuplicateUnidentified ? new[] { row, row } : new[] { row } })));
        }
        public Task<JsonDocument> Balance(CancellationToken ct)
        {
            BalanceReads++;
            return Task.FromResult(JsonDocument.Parse(InvalidBalance ? "{}" : "{\"available\":-42.05,\"currency_code\":\"BRL\",\"date\":\"2026-10-19\",\"limit\":10000,\"total_available\":9957.95}"));
        }
    }
}
