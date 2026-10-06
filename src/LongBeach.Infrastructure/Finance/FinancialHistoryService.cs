using System.Data;
using System.Data.Common;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Auditing;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
namespace LongBeach.Infrastructure.Finance;

public sealed partial class FinancialHistoryService(LongBeachDbContext db, IAuditContext audit, TimeProvider time, IConfiguration config) : IFinancialHistory
{
    private sealed record Plan(string Name, string Hash, string Status, FinancialObservation[] Items, int Matches);
    private async Task<Plan> Read(Guid batchId, CancellationToken ct)
    {
        string name, hash, status; int count;
        await using(var command=await Command("SELECT source_name,source_sha256,status,row_count FROM import_batches WHERE id=@p0", ct, batchId))
        await using(var reader=await command.ExecuteReaderAsync(ct))
        {
            if(!await reader.ReadAsync(ct)) throw new FinancialRuleException("Lote não encontrado.");
            name=reader.GetString(0); hash=reader.GetString(1).Trim(); status=reader.GetString(2); count=reader.GetInt32(3);
        }
        var rows=new List<FinancialObservation>();
        await using(var command=await Command("SELECT record_type,external_id,payload::text FROM import_rows WHERE batch_id=@p0 ORDER BY source_sheet,source_row",ct,batchId))
        await using(var reader=await command.ExecuteReaderAsync(ct))
        {
            while(await reader.ReadAsync(ct))
            {
                using var json=JsonDocument.Parse(reader.GetString(2)); var item=FinancialHistoryRules.Parse(json.RootElement);
                if(reader.GetString(0)!="reference-data" || reader.IsDBNull(1) || reader.GetString(1)!="finance:"+item.SourceCell)
                    throw new FinancialRuleException("Referência financeira de origem inválida.");
                rows.Add(item);
            }
        }
        if(rows.Count!=count || count is < 1 or > 2000 || rows.Select(x=>x.SourceCell).Distinct().Count()!=count)
            throw new FinancialRuleException("Lote financeiro incompleto ou com células duplicadas.");
        var originals=new Dictionary<string,FinancialObservation>();
        await using(var command=await Command("SELECT source_cell,payload::text FROM financial_observations WHERE source_sha256=@p0",ct,hash))
        await using(var reader=await command.ExecuteReaderAsync(ct))
            while(await reader.ReadAsync(ct)){ using var json=JsonDocument.Parse(reader.GetString(1)); originals.Add(reader.GetString(0),FinancialHistoryRules.Parse(json.RootElement)); }
        foreach(var item in rows)
            if(originals.TryGetValue(item.SourceCell,out var original) && original!=item)
                throw new FinancialRuleException("Uma célula desta fonte já foi aplicada com interpretação diferente. Revise a conciliação.");
        // A newer export may repeat a period with changed cells. Require reconciliation instead of adding it twice.
        var otherSources=new List<(string Series,string Metric,DateOnly Start,DateOnly End)>();
        await using(var command=await Command("SELECT DISTINCT series,metric,period_start,period_end FROM financial_observations WHERE source_sha256<>@p0 AND period_start<=@p1 AND period_end>=@p2",ct,hash,rows.Max(x=>x.PeriodEnd),rows.Min(x=>x.PeriodStart)))
        await using(var reader=await command.ExecuteReaderAsync(ct))
            while(await reader.ReadAsync(ct))otherSources.Add((reader.GetString(0),reader.GetString(1),reader.GetFieldValue<DateOnly>(2),reader.GetFieldValue<DateOnly>(3)));
        if(rows.Any(item=>otherSources.Any(old=>old.Series==item.Series && old.Metric==item.Metric && old.Start<=item.PeriodEnd && old.End>=item.PeriodStart)))
            throw new FinancialRuleException("Outra fonte já cobre este controle e período. Concilie as versões antes de aplicar para evitar valores duplicados.");
        return new(name,hash,status,rows.ToArray(),rows.Count(x=>originals.ContainsKey(x.SourceCell)));
    }
    public async Task<HistoryPreview> Preview(Guid batchId,CancellationToken ct)
    {
        var plan=await Read(batchId,ct);
        return new(batchId,plan.Name,plan.Status=="Applied",FinancialHistoryRules.Fingerprint(plan.Hash,plan.Items),
            plan.Items.Length-plan.Matches,plan.Matches,FinancialHistoryRules.Totals(plan.Items));
    }
    public async Task<HistoryPreview> Apply(Guid batchId,string confirmationToken,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(IsolationLevel.Serializable,ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(19771006)",ct);
        var plan=await Read(batchId,ct);
        if(plan.Status=="Applied") return await Preview(batchId,ct);
        if(FinancialHistoryRules.Fingerprint(plan.Hash,plan.Items)!=confirmationToken)
            throw new FinancialRuleException("A conferência mudou. Confira novamente antes de aplicar.");
        foreach(var item in plan.Items)
        {
            await using var insert=await Command("""
                INSERT INTO financial_observations(id,batch_id,source_sha256,source_cell,series,metric,state,period_start,period_end,amount_cents,payload,created_at_utc)
                VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10::jsonb,@p11)
                ON CONFLICT(source_sha256,source_cell) DO NOTHING
                """,ct,Guid.NewGuid(),batchId,plan.Hash,item.SourceCell,item.Series,item.Metric,item.State,
                item.PeriodStart,item.PeriodEnd,item.AmountCents,JsonSerializer.Serialize(item),time.GetUtcNow());
            await insert.ExecuteNonQueryAsync(ct);
        }
        db.AuditLogs.Add(AuditLog.Create(audit.UserId,"FinancialHistoryApplied","ImportBatch",batchId.ToString(),
            JsonSerializer.Serialize(new { plan.Hash, Created=plan.Items.Length-plan.Matches, Matched=plan.Matches }),
            audit.IpAddress,audit.UserAgent,audit.CorrelationId,time.GetUtcNow()));
        await db.SaveChangesAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE import_rows SET review_status='Applied' WHERE batch_id={batchId}",ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE import_batches SET status='Applied' WHERE id={batchId}",ct);
        await tx.CommitAsync(ct);
        return await Preview(batchId,ct);
    }
    public async Task<HistoryReport> Report(string? month,string? series,string? metric,int page,CancellationToken ct)
    {
        if(page<1 || page>10000 || series is not null && !FinancialHistoryRules.Series.Contains(series) || metric?.Length>80)
            throw new FinancialRuleException("Filtro de histórico inválido.");
        var months=new List<string>();
        await using(var command=await Command("SELECT DISTINCT to_char(period_start,'YYYY-MM') AS month FROM financial_observations ORDER BY month DESC",ct))
        await using(var reader=await command.ExecuteReaderAsync(ct)) while(await reader.ReadAsync(ct))months.Add(reader.GetString(0));
        if(month is null && series is not null)
        {
            await using var command=await Command("SELECT to_char(MAX(period_start),'YYYY-MM') FROM financial_observations WHERE series=@p0",ct,series);
            month=await command.ExecuteScalarAsync(ct) as string;
        }
        month??=months.FirstOrDefault()??time.GetUtcNow().ToString("yyyy-MM");
        if(!DateOnly.TryParseExact(month+"-01","yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out var first))
            throw new FinancialRuleException("Selecione um mês válido.");
        // Competência mensal: não inventa dia de recebimento quando a planilha não informa.
        var items=new List<HistoryItem>();
        await using(var command=await Command("""
            SELECT o.id,o.batch_id,b.source_name,o.source_sha256,o.payload::text
            FROM financial_observations o JOIN import_batches b ON b.id=o.batch_id
            WHERE o.period_start<=@p1 AND o.period_end>=@p0
            AND (@p2::text IS NULL OR o.series=@p2) AND (@p3::text IS NULL OR o.metric=@p3)
            ORDER BY o.period_start,o.series,o.source_cell,o.id
            """,ct,first,first.AddMonths(1).AddDays(-1),series,metric))
        await using(var reader=await command.ExecuteReaderAsync(ct))
            while(await reader.ReadAsync(ct)){using var json=JsonDocument.Parse(reader.GetString(4));items.Add(new(reader.GetGuid(0),reader.GetGuid(1),reader.GetString(2),reader.GetString(3).Trim(),FinancialHistoryRules.Parse(json.RootElement)));}
        return new(month,months,FinancialHistoryRules.Totals(items.Select(x=>x.Data)),items.Skip((page-1)*50).Take(50).ToArray(),items.Count,page,time.GetUtcNow());
    }
    public async Task<DashboardBalances> DashboardBalances(CancellationToken ct)
    {
        var rows = new List<HistoryItem>();
        var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime.AddHours(-3));
        // Independent latest dates for the monthly control and the PagBank snapshot; no pagination loss.
        await using (var command = await Command("""
            WITH candidates AS (
                SELECT * FROM financial_observations
                WHERE period_start <= @p0 AND
                  ((series='consolidado' AND payload->>'Grain'='month') OR
                   (series='saldos' AND lower(trim(metric))='saldo pagbank' AND payload->>'Grain'='snapshot'))
            )
            SELECT o.id,o.batch_id,b.source_name,o.source_sha256,o.payload::text
            FROM candidates o JOIN import_batches b ON b.id=o.batch_id
            WHERE o.period_start=(SELECT MAX(c.period_start) FROM candidates c WHERE c.series=o.series)
            ORDER BY o.series,o.source_cell,o.id
            """, ct, today))
        await using (var reader = await command.ExecuteReaderAsync(ct)) while (await reader.ReadAsync(ct))
        {
            using var json = JsonDocument.Parse(reader.GetString(4));
            rows.Add(new(reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2), reader.GetString(3).Trim(), FinancialHistoryRules.Parse(json.RootElement)));
        }
        var result = DashboardBalanceRules.Summarize(rows, today);
        var reviewed = await db.OperationalRecords.AsNoTracking().Where(x => x.Kind == MonthlyControlRules.Kind && x.Name.CompareTo(today.ToString("yyyy-MM")) <= 0)
            .OrderByDescending(x => x.Name).Select(x => x.Payload).FirstOrDefaultAsync(ct);
        if (reviewed is not null)
        {
            var control = JsonSerializer.Deserialize<MonthlyControlDocument>(reviewed, MonthlyJson)!;
            if (result.General.Month is null || string.CompareOrdinal(control.Month, result.General.Month) >= 0)
                result = result with { General = MonthlyControlRules.Balance(control) };
        }
        return result;
    }

    public async Task<ArenaHistorySummary> ArenaSummary(string? month, CancellationToken ct)
    {
        if (month is not null && !DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None, out _)) throw new FinancialRuleException("Selecione um mês válido.");
        const string control = """
            ((series IN ('alunos','mensalistas') AND metric='valor-informado' AND payload->>'Grain'='month')
             OR (series='aulas' AND metric='valor-escalonavel' AND payload->>'Grain'='day'))
            """;
        var months = new List<string>();
        await using (var command = await Command("SELECT DISTINCT to_char(period_start,'YYYY-MM') AS month FROM financial_observations WHERE " + control + " ORDER BY month DESC", ct))
        await using (var reader = await command.ExecuteReaderAsync(ct)) while (await reader.ReadAsync(ct)) months.Add(reader.GetString(0));
        var rows = new List<FinancialObservation>();
        // One complete month per control, independent of the history page's 50-row pagination.
        await using (var command = await Command("WITH controls AS (SELECT * FROM financial_observations WHERE " + control + ") " + """
            SELECT payload::text FROM controls c
            WHERE to_char(period_start,'YYYY-MM')=COALESCE(@p0::text,
                (SELECT to_char(MAX(period_start),'YYYY-MM') FROM controls latest WHERE latest.series=c.series))
            """, ct, month))
        await using (var reader = await command.ExecuteReaderAsync(ct)) while (await reader.ReadAsync(ct))
        {
            using var json = JsonDocument.Parse(reader.GetString(0));
            rows.Add(FinancialHistoryRules.Parse(json.RootElement));
        }
        return ArenaHistoryRules.Summarize(rows, months, month, time.GetUtcNow());
    }

    public async Task<IReadOnlyList<IntegrationStatus>> Integrations(CancellationToken ct)
    {
        var result=new List<IntegrationStatus>();
        var enabled=config.GetValue("Integrations:PagBankEdi:Enabled",false);
        DateTimeOffset? last=null; DateOnly? complete=null; string? failure=null;
        await using(var command=await Command("SELECT last_success_utc,complete_through,failure_code FROM provider_sync_state WHERE provider='pagbank-edi'",ct))
        await using(var reader=await command.ExecuteReaderAsync(ct)) if(await reader.ReadAsync(ct))
        {last=reader.IsDBNull(0)?null:reader.GetFieldValue<DateTimeOffset>(0);complete=reader.IsDBNull(1)?null:reader.GetFieldValue<DateOnly>(1);failure=reader.IsDBNull(2)?null:reader.GetString(2);}
        var configured=enabled && !string.IsNullOrWhiteSpace(config["Integrations:PagBankEdi:User"]) && config["Integrations:PagBankEdi:User"]!.All(char.IsAsciiDigit)
            && !string.IsNullOrWhiteSpace(config["Integrations:PagBankEdi:Token"])
            && DateOnly.TryParseExact(config["Integrations:PagBankEdi:StartDate"],"yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out var start) && start>=new DateOnly(2000,1,1);
        result.Add(new("PagBank EDI",!configured?"Aguardando configuração":failure is not null?"Requer atenção":last is null?"Aguardando primeira leitura":"Automático",
            "Vendas, liquidações e saldos em D+1. Documentos originais preservados; classificação financeira depende de conciliação.",last,failure,complete));
        result.Add(new("PagVendas","Exportação disponível","Histórico por exportação. API administrativa sem autenticação de navegador ainda não confirmada.",null,null,null));
        return result;
    }
    public async Task<ProviderReport> ProviderRecords(string? date,int page,CancellationToken ct)
    {
        if(page<1 || page>100000)throw new FinancialRuleException("Página inválida.");
        var dates=new List<string>();
        // Only expose days for which all four feeds and every page were validated atomically.
        await using(var command=await Command("SELECT DISTINCT to_char(movement_date,'YYYY-MM-DD') AS day FROM provider_documents WHERE provider='pagbank-edi' AND validated=true ORDER BY day DESC",ct))
        await using(var reader=await command.ExecuteReaderAsync(ct))while(await reader.ReadAsync(ct))dates.Add(reader.GetString(0));
        date??=dates.FirstOrDefault();
        if(date is null)return new(null,dates,[],0,page);
        if(!DateOnly.TryParseExact(date,"yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out var day))throw new FinancialRuleException("Data inválida.");
        var rows=new List<ProviderRecord>();
        const string latest="""
            SELECT movement,page_number,source_sha256,payload
            FROM provider_documents d WHERE provider='pagbank-edi' AND movement_date=@p0 AND validated=true
            AND fetched_at_utc=(SELECT MAX(fetched_at_utc) FROM provider_documents v WHERE v.provider=d.provider AND v.movement_date=d.movement_date AND v.movement=d.movement AND v.validated=true)
            """;
        int total;
        await using(var command=await Command("WITH latest AS ("+latest+") SELECT COALESCE(SUM(jsonb_array_length(payload->'detalhes')),0)::int FROM latest",ct,day))
            total=Convert.ToInt32(await command.ExecuteScalarAsync(ct));
        await using(var command=await Command("WITH latest AS ("+latest+") SELECT movement,page_number,source_sha256,detail.value::text FROM latest CROSS JOIN LATERAL jsonb_array_elements(payload->'detalhes') WITH ORDINALITY AS detail(value,n) ORDER BY movement,page_number,detail.n LIMIT 50 OFFSET @p1",ct,day,(page-1)*50))
        await using(var reader=await command.ExecuteReaderAsync(ct))while(await reader.ReadAsync(ct))
        {
            using var json=JsonDocument.Parse(reader.GetString(3));
            rows.Add(new(reader.GetString(0),day,reader.GetInt32(1),reader.GetString(2).Trim(),json.RootElement.Clone()));
        }
        return new(date,dates,rows,total,page);
    }
    private async Task<DbCommand> Command(string sql,CancellationToken ct,params object?[] values)
    {
        var connection=db.Database.GetDbConnection(); if(connection.State!=ConnectionState.Open)await connection.OpenAsync(ct);
        var command=connection.CreateCommand(); command.CommandText=sql; command.Transaction=db.Database.CurrentTransaction?.GetDbTransaction();
        for(var i=0;i<values.Length;i++){var p=command.CreateParameter();p.ParameterName="p"+i;p.Value=values[i]??DBNull.Value;command.Parameters.Add(p);}return command;
    }
}
