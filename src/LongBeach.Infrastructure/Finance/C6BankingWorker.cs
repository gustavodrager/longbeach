using System.Security.Cryptography;
using System.Globalization;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Domain.Auditing;
using LongBeach.Infrastructure.C6;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LongBeach.Infrastructure.Finance;

// Read-only C6 requests. These documents never create revenue or settle an account.
public sealed class C6BankingWorker(IServiceScopeFactory scopes, IConfiguration config, TimeProvider time,
    ILogger<C6BankingWorker> logger) : BackgroundService, IC6Collection
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (!C6FinanceScope.Enabled(config)) return;
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10), time);
        do
        {
            var attemptedAt = time.GetUtcNow();
            try { await Run(ct); }
            catch (Exception error) when (!ct.IsCancellationRequested)
            {
                var code = Failure(error);
                logger.LogWarning("C6 banking collection deferred: {FailureCode}", code);
                await RecordFailure(code, ct, attemptedAt);
            }
        } while (await timer.WaitForNextTickAsync(ct));
    }

    public Task Run(CancellationToken ct) => Collect(null, null, null, null, ct);

    public async Task Reprocess(DateOnly from, DateOnly through, string reason, Guid actor, CancellationToken ct)
    {
        C6StatementRules.Period(from, through, C6FinanceScope.Today(time));
        if (actor == Guid.Empty || string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new FinancialRuleException("Informe o responsável e um motivo de 3 a 500 caracteres.");
        try { await Collect(from, through, actor, reason.Trim(), ct); }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException && !ct.IsCancellationRequested)
        { throw new FinancialRuleException("A consulta C6 não foi concluída. Confira a conexão e repita o mesmo período."); }
    }

    public async Task RecordFailure(string code, CancellationToken ct, DateTimeOffset? attemptedAt = null)
    {
        try
        {
            var account = C6FinanceScope.Read(config);
            if (account.Account.Length == 0) return;
            var failedAt = time.GetUtcNow();
            var attempt = attemptedAt ?? failedAt;
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO c6_sync_state(environment,account_id,last_attempt_utc,failure_code,failure_count)
                VALUES({account.Environment},{account.Account},{failedAt},{code},1)
                ON CONFLICT(environment,account_id) DO UPDATE SET last_attempt_utc=EXCLUDED.last_attempt_utc,
                    failure_code=EXCLUDED.failure_code,failure_count=c6_sync_state.failure_count+1
                WHERE (c6_sync_state.last_success_utc IS NULL OR c6_sync_state.last_success_utc<={attempt})
                    AND (c6_sync_state.last_attempt_utc IS NULL OR c6_sync_state.last_attempt_utc<={attempt})
                """, ct);
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        { logger.LogWarning("C6 banking failure status unavailable; collection will retry."); }
    }

    private async Task Collect(DateOnly? replayFrom, DateOnly? replayThrough, Guid? actor, string? reason, CancellationToken ct)
    {
        var account = C6FinanceScope.Read(config);
        if (!C6FinanceScope.Enabled(config) || string.IsNullOrWhiteSpace(account.Account))
            throw new FinancialRuleException("Saldo e extrato C6 ainda não habilitados ou configurados.");
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var api = scope.ServiceProvider.GetRequiredService<IC6BankingApi>();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var lockName = "longbeach:c6-finance:" + account.Environment + ":" + account.Account;
        var locked = await db.Database.SqlQuery<bool>($"SELECT pg_try_advisory_xact_lock(hashtextextended({lockName},0)) AS \"Value\"").SingleAsync(ct);
        if (!locked)
        {
            if (replayFrom.HasValue) throw new FinancialRuleException("Outra consulta C6 está em andamento. Tente novamente depois.");
            return;
        }
        var state = await db.Database.SqlQuery<Cursor>($"""
            SELECT complete_through AS "CompleteThrough",last_attempt_utc AS "LastAttemptUtc",failure_count AS "Failures"
            FROM c6_sync_state WHERE environment={account.Environment} AND account_id={account.Account}
            """).SingleOrDefaultAsync(ct);
        if (!replayFrom.HasValue && state?.Failures > 0 && state.LastAttemptUtc.HasValue
            && time.GetUtcNow() - state.LastAttemptUtc.Value < TimeSpan.FromMinutes(Math.Min(360, 10 * Math.Pow(2, Math.Min(state.Failures, 6))))) return;
        var today = C6FinanceScope.Today(time);
        var from = replayFrom ?? state?.CompleteThrough?.AddDays(-2) ?? today.AddDays(-29);
        var through = replayThrough ?? (from.AddDays(29) < today ? from.AddDays(29) : today);
        C6StatementRules.Period(from, through, today);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(90), time);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);
        using var statement = await api.Statement(from, through, deadline.Token);
        var entries = C6StatementRules.Parse(statement.RootElement, from, through);
        // Validate every response before persisting any part of this period.
        using var balance = replayFrom.HasValue ? null : await api.Balance(deadline.Token);
        var bankBalance = balance is null ? null : ParseBalance(balance.RootElement, today);
        var collectedAt = time.GetUtcNow();
        var documentId = await Document(db, account, "statement", from, through, statement, collectedAt, ct);
        foreach (var entry in entries)
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO c6_statement_entries(id,environment,account_id,entry_id,booked_date,amount_cents,title,description,
                    operation_type,transaction_type,end_to_end_id,document_id)
                VALUES({Guid.NewGuid()},{account.Environment},{account.Account},{entry.EntryId},{entry.BookedDate},{entry.AmountCents},
                    {entry.Title},{entry.Description},{entry.OperationType},{entry.TransactionType},{entry.EndToEndId},{documentId})
                ON CONFLICT(environment,account_id,entry_id) DO UPDATE SET booked_date=EXCLUDED.booked_date,
                    amount_cents=EXCLUDED.amount_cents,title=EXCLUDED.title,description=EXCLUDED.description,
                    operation_type=EXCLUDED.operation_type,transaction_type=EXCLUDED.transaction_type,
                    end_to_end_id=EXCLUDED.end_to_end_id,document_id=EXCLUDED.document_id
                """, ct);
        // This is a derived current view; old complete responses remain immutable evidence.
        var ids = entries.Select(entry => entry.EntryId).ToArray();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            DELETE FROM c6_statement_entries WHERE environment={account.Environment} AND account_id={account.Account}
                AND booked_date>={from} AND booked_date<={through} AND NOT(entry_id=ANY({ids}))
            """, ct);
        if (balance is not null)
        {
            var balanceDocument = await Document(db, account, "balance", today, today, balance, collectedAt, ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO c6_balance_snapshots(id,environment,account_id,amount_cents,source_date,collected_at_utc,document_id)
                VALUES({Guid.NewGuid()},{account.Environment},{account.Account},{bankBalance!.AmountCents},{bankBalance.SourceDate},{collectedAt},{balanceDocument})
                ON CONFLICT(environment,account_id,collected_at_utc) DO NOTHING
                """, ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO c6_sync_state(environment,account_id,complete_through,last_success_utc,last_attempt_utc,failure_count)
                VALUES({account.Environment},{account.Account},{through},{collectedAt},{collectedAt},0)
                ON CONFLICT(environment,account_id) DO UPDATE SET complete_through=GREATEST(c6_sync_state.complete_through,EXCLUDED.complete_through),
                    last_success_utc=EXCLUDED.last_success_utc,last_attempt_utc=EXCLUDED.last_attempt_utc,failure_code=NULL,failure_count=0
                """, ct);
        }
        db.AuditLogs.Add(AuditLog.Create(actor, replayFrom.HasValue ? "C6StatementReprocessed" : "C6BankingCollected", "Integration", "c6",
            JsonSerializer.Serialize(new { account.Environment, Account = account.Account, From = from, Through = through, Reason = reason, Entries = entries.Count }),
            null, "LongBeachOS", "c6", collectedAt));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private static async Task<Guid> Document(LongBeachDbContext db, C6FinanceScope account, string kind, DateOnly from, DateOnly through,
        JsonDocument document, DateTimeOffset collected, CancellationToken ct)
    {
        var payload = document.RootElement.GetRawText();
        var hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(payload)));
        // Upserting only the existing ID leaves the original payload and observation time intact.
        var query = db.Database.SqlQuery<Guid>($"""
            INSERT INTO c6_finance_documents(id,environment,account_id,kind,period_from,period_through,source_sha256,payload,collected_at_utc)
            VALUES({Guid.NewGuid()},{account.Environment},{account.Account},{kind},{from},{through},{hash},{payload}::jsonb,{collected})
            ON CONFLICT(environment,account_id,kind,period_from,period_through,source_sha256) DO UPDATE SET id=c6_finance_documents.id
            RETURNING id AS "Value"
            """);
        // Do not compose LINQ over a PostgreSQL INSERT ... RETURNING statement.
        var result = await query.ToListAsync(ct);
        return result.Single();
    }

    public sealed record C6Balance(long AmountCents, DateOnly SourceDate);
    public static C6Balance ParseBalance(JsonElement root, DateOnly today)
    {
        try
        {
            if (root.GetProperty("currency_code").GetString() != "BRL") throw new FinancialRuleException("C6_BALANCE_CURRENCY");
            var date = DateOnly.ParseExact(root.GetProperty("date").GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture);
            if (date < new DateOnly(2000, 1, 1) || date > today) throw new FinancialRuleException("C6_BALANCE_DATE");
            // available is money held by the bank. total_available may include a credit limit.
            return new(C6StatementRules.Money(root.GetProperty("available")), date);
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or FormatException or InvalidOperationException or OverflowException or ArgumentException)
        { throw new FinancialRuleException("C6_BALANCE_SCHEMA"); }
    }

    private static string Failure(Exception error) => error switch
    {
        FinancialRuleException rule when rule.Message.StartsWith("C6_", StringComparison.Ordinal) => rule.Message,
        HttpRequestException request when request.StatusCode.HasValue => "C6_HTTP_" + (int)request.StatusCode.Value,
        HttpRequestException => "C6_NETWORK",
        OperationCanceledException => "C6_TIMEOUT",
        JsonException => "C6_SCHEMA",
        LongBeach.Domain.Bar.BarRuleException or FinancialRuleException => "C6_CONFIGURATION",
        _ => "C6_INTERNAL"
    };
    private sealed record Cursor(DateOnly? CompleteThrough, DateTimeOffset? LastAttemptUtc, int Failures);
}
