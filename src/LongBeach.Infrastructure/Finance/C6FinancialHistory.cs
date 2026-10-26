using System.Data;
using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace LongBeach.Infrastructure.Finance;

public sealed partial class FinancialHistoryService
{
    public async Task<C6StatementReport> C6Statement(DateOnly? from, DateOnly? through, int page, CancellationToken ct)
    {
        var scope = C6FinanceScope.Read(config);
        var end = through ?? C6FinanceScope.Today(time);
        var start = from ?? end.AddDays(-29);
        C6StatementRules.Period(start, end, C6FinanceScope.Today(time));
        if (page is < 1 or > 100000) throw new FinancialRuleException("Página inválida.");
        var items = new List<C6StatementItem>();
        if (scope.Account.Length == 0) return new(scope.Environment, scope.Account, start, end, items, 0, page);
        await using var snapshot = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        int total;
        await using (var command = await Command("""
            SELECT COUNT(*)::integer FROM c6_statement_entries
            WHERE environment=@p0 AND account_id=@p1 AND booked_date>=@p2 AND booked_date<=@p3
            """, ct, scope.Environment, scope.Account, start, end))
            total = Convert.ToInt32(await command.ExecuteScalarAsync(ct));
        await using (var command = await Command("""
            SELECT e.id,e.entry_id,e.booked_date,e.amount_cents,e.title,e.description,
                e.operation_type,e.transaction_type,e.end_to_end_id,d.source_sha256,p."Id"
            FROM c6_statement_entries e JOIN c6_finance_documents d ON d.id=e.document_id
            LEFT JOIN billing_payments p ON p."Provider"='C6' AND p."ProviderEnvironment"=e.environment
                AND p."ProviderAccountId"=e.account_id AND p."PixEndToEndId"=e.end_to_end_id
            WHERE e.environment=@p0 AND e.account_id=@p1 AND e.booked_date>=@p2 AND e.booked_date<=@p3
            ORDER BY e.booked_date DESC,e.entry_id LIMIT 50 OFFSET @p4
            """, ct, scope.Environment, scope.Account, start, end, (page - 1) * 50))
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) items.Add(new(reader.GetGuid(0), reader.GetString(1), reader.GetFieldValue<DateOnly>(2),
                reader.GetInt64(3), reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7),
                reader.IsDBNull(8) ? null : reader.GetString(8), reader.GetString(9).Trim(), reader.IsDBNull(10) ? null : reader.GetGuid(10)));
        await snapshot.CommitAsync(ct);
        return new(scope.Environment, scope.Account, start, end, items, total, page);
    }

    private async Task<CurrentBankBalance> C6CurrentBalance(CancellationToken ct)
    {
        if (BankImportMode.Enabled(config)) return await C6ImportedCurrentBalance(ct);
        if (!C6FinanceScope.Enabled(config)) return new(null, null, "NotConnected", "Saldo atual da conta não conectado. Extratos importados e a carteira EDI não informam o saldo bancário de agora.");
        C6FinanceScope scope;
        try { scope = C6FinanceScope.Read(config); }
        catch (FinancialRuleException) { return new(null, null, "NotConfigured", "Confira a configuração da conta C6.", "C6"); }
        var source = "C6 · " + scope.Account;
        if (scope.Account.Length == 0) return new(null, null, "NotConfigured", "Informe a identificação da conta C6 no servidor.", "C6", scope.Environment);
        var balance = await db.Database.SqlQuery<C6BalanceRow>($"""
            SELECT amount_cents AS "AmountCents",source_date AS "SourceDate",collected_at_utc AS "CollectedAtUtc"
            FROM c6_balance_snapshots WHERE environment={scope.Environment} AND account_id={scope.Account}
            ORDER BY collected_at_utc DESC LIMIT 1
            """).SingleOrDefaultAsync(ct);
        if (balance is null) return new(null, null, "AwaitingFirstRead", "Aguardando a primeira consulta de saldo C6 confirmada.", source, scope.Environment);
        var state = await ReadC6Sync(scope, ct);
        var stale = time.GetUtcNow() - balance.CollectedAtUtc > TimeSpan.FromMinutes(30) || balance.SourceDate < C6FinanceScope.Today(time);
        return new(balance.AmountCents, balance.CollectedAtUtc, stale ? "Stale" : state?.FailureCode is not null ? "Error" : "Current",
            stale ? "A leitura C6 tem mais de 30 minutos ou informa uma data bancária anterior a hoje. Confira antes de usar este saldo."
                : state?.FailureCode is not null ? "A última atualização C6 falhou. Exibindo a última leitura confirmada."
                : "Saldo disponível C6 informado pelo banco; não inclui limite de crédito nem outras contas.", source, scope.Environment, balance.SourceDate);
    }

    private async Task<CurrentBankBalance> C6ImportedCurrentBalance(CancellationToken ct)
    {
        var today = C6FinanceScope.Today(time);
        var rows = new List<(HistoryItem Item, DateTimeOffset ImportedAtUtc)>();
        await using (var command = await Command("""
            WITH candidates AS (
                SELECT * FROM financial_observations
                WHERE series='saldos' AND lower(trim(metric))='saldo c6'
                  AND payload->>'Grain'='snapshot' AND period_start<=@p0
            )
            SELECT o.id,o.batch_id,b.source_name,o.source_sha256,o.payload::text,o.created_at_utc
            FROM candidates o JOIN import_batches b ON b.id=o.batch_id
            WHERE o.period_start=(SELECT MAX(period_start) FROM candidates)
            ORDER BY o.source_cell,o.id
            """, ct, today))
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct))
            {
                using var json = JsonDocument.Parse(reader.GetString(4));
                rows.Add((new(reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2), reader.GetString(3).Trim(),
                    FinancialHistoryRules.Parse(json.RootElement)), reader.GetFieldValue<DateTimeOffset>(5)));
            }
        var balance = DashboardBalanceRules.BankSnapshot(rows.Select(x => x.Item), today, "Saldo C6", "C6");
        if (balance.AmountCents is null)
            return new(null, null, "Imported", balance.Issue!, "C6", SourceDate: balance.Date);
        var importedAtUtc = rows.Single(x => x.Item.Data.PeriodStart == balance.Date).ImportedAtUtc;
        return new(balance.AmountCents, importedAtUtc, "Imported",
            "Saldo C6 importado de arquivo, com a data da fonte preservada. Confira a data antes de usar este saldo.",
            "C6 · " + balance.SourceName, SourceDate: balance.Date);
    }

    private async Task<IntegrationStatus> C6Integration(CancellationToken ct)
    {
        if (BankImportMode.Enabled(config)) return new("C6 saldo e extrato", BankImportMode.State,
            "Importe extratos, movimentos e saldos C6 com data e origem. A consulta bancária está suspensa e o histórico anterior foi preservado.", null, null, null, null, []);
        var requirements = new List<string>();
        C6FinanceScope scope;
        try { scope = C6FinanceScope.Read(config); }
        catch (FinancialRuleException) { return new("C6 saldo e extrato", "Configuração incompleta", "Confira o ambiente e a identificação da conta C6.", null, null, null); }
        if (scope.Account.Length == 0) requirements.Add("Informe a identificação da conta C6.");
        foreach (var (key, instruction) in new[] { ("ClientId", "Configure o Client ID C6 no servidor."), ("ClientSecret", "Configure o Client Secret C6 no servidor."), ("CertificatePath", "Configure o certificado mTLS C6 no servidor.") })
            if (string.IsNullOrWhiteSpace(config["Integrations:C6:" + key])) requirements.Add(instruction);
        var enabled = C6FinanceScope.Enabled(config);
        if (!enabled) requirements.Add("Habilite saldo e extrato C6 após configurar e validar o ambiente.");
        var state = scope.Account.Length == 0 ? null : await ReadC6Sync(scope, ct);
        var status = !enabled ? "Desativado" : requirements.Count > 0 ? "Configuração incompleta"
            : state?.FailureCode is not null ? "Requer atenção" : state?.LastSuccessUtc is null ? "Aguardando primeira leitura"
            : time.GetUtcNow() - state.LastSuccessUtc.Value > TimeSpan.FromMinutes(30) ? "Coleta atrasada"
            : state.CompleteThrough < C6FinanceScope.Today(time) ? "Atualizando histórico" : "Automático";
        return new("C6 saldo e extrato", status,
            "Consulta a cada dez minutos. Movimentos são evidências bancárias e não geram receita nem baixa automática.",
            state?.LastSuccessUtc, state?.FailureCode, state?.CompleteThrough, scope.Environment, requirements);
    }

    private Task<C6SyncRow?> ReadC6Sync(C6FinanceScope scope, CancellationToken ct) => db.Database.SqlQuery<C6SyncRow>($"""
        SELECT complete_through AS "CompleteThrough",last_success_utc AS "LastSuccessUtc",failure_code AS "FailureCode"
        FROM c6_sync_state WHERE environment={scope.Environment} AND account_id={scope.Account}
        """).SingleOrDefaultAsync(ct);

    private sealed record C6BalanceRow(long AmountCents, DateOnly SourceDate, DateTimeOffset CollectedAtUtc);
    private sealed record C6SyncRow(DateOnly? CompleteThrough, DateTimeOffset? LastSuccessUtc, string? FailureCode);
}
