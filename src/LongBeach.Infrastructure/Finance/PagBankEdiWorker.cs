using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Domain.Auditing;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
namespace LongBeach.Infrastructure.Finance;

// Merchant API credentials are independent of browser sessions. All requests are read-only.
public sealed class PagBankEdiWorker(IServiceScopeFactory scopes,IHttpClientFactory clients,IConfiguration config,
    TimeProvider time,ILogger<PagBankEdiWorker> logger) : BackgroundService, IPagBankEdiCollection
{
    private static readonly string[] Movements=["transactional","financial","cashouts","balances"];
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if(!config.GetValue("Integrations:PagBankEdi:Enabled",false))return;
        var merchant=config["Integrations:PagBankEdi:User"];var token=config["Integrations:PagBankEdi:Token"];
        if(string.IsNullOrWhiteSpace(merchant)||!merchant.All(char.IsAsciiDigit)||string.IsNullOrWhiteSpace(token))
        { logger.LogWarning("PagBank EDI requires merchant credentials.");return; }
        if(!DateOnly.TryParseExact(config["Integrations:PagBankEdi:StartDate"],"yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out var start)
            || start<new DateOnly(2000,1,1)) { logger.LogWarning("PagBank EDI requires an explicit backfill start date.");return; }
        using var timer=new PeriodicTimer(TimeSpan.FromMinutes(10),time);
        do
        {
            try { await Run(merchant,token,start,ct); }
            catch(Exception e) when(!ct.IsCancellationRequested)
            {
                var code=e is FinancialRuleException rule ? rule.Message : e is HttpRequestException ? "EDI_NETWORK" : e is OperationCanceledException ? "EDI_TIMEOUT" : e is JsonException ? "EDI_SCHEMA" : "EDI_INTERNAL";
                logger.LogWarning("PagBank EDI collection deferred: {FailureCode}",code);
                await RecordFailure(code,ct);
            }
        }while(await timer.WaitForNextTickAsync(ct));
    }
    // Failure reporting must never become a second unhandled worker failure.
    public async Task RecordFailure(string code,CancellationToken ct)
    {
        try
        {
            await using var scope=scopes.CreateAsyncScope();var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO provider_sync_state(provider,last_attempt_utc,failure_code,failure_count) VALUES('pagbank-edi',{time.GetUtcNow()},{code},1) ON CONFLICT(provider) DO UPDATE SET last_attempt_utc=EXCLUDED.last_attempt_utc,failure_code=EXCLUDED.failure_code,failure_count=provider_sync_state.failure_count+1",ct);
        }
        catch(Exception) when(!ct.IsCancellationRequested) { logger.LogWarning("PagBank EDI failure status unavailable; collection will retry."); }
    }
    private DateOnly Yesterday => DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime.AddHours(-3)).AddDays(-1);
    public Task Run(string merchant,string token,DateOnly start,CancellationToken ct) => Collect(merchant,token,start,null,null,null,ct);

    public async Task Reprocess(DateOnly from,DateOnly through,string reason,Guid actor,CancellationToken ct)
    {
        if(actor==Guid.Empty || string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new FinancialRuleException("Informe o responsável e o motivo do reprocessamento.");
        if(from<new DateOnly(2000,1,1)||through<from||through>Yesterday||through.DayNumber-from.DayNumber>6)
            throw new FinancialRuleException("Selecione até sete dias, terminando no máximo ontem.");
        var merchant=config["Integrations:PagBankEdi:User"];var token=config["Integrations:PagBankEdi:Token"];
        if(!config.GetValue("Integrations:PagBankEdi:Enabled",false)||string.IsNullOrWhiteSpace(merchant)||!merchant.All(char.IsAsciiDigit)||string.IsNullOrWhiteSpace(token))
            throw new FinancialRuleException("EDI ainda não habilitado ou configurado.");
        await Collect(merchant,token,from,through,actor,reason.Trim(),ct);
    }
    private async Task Collect(string merchant,string token,DateOnly start,DateOnly? replayThrough,Guid? actor,string? reason,CancellationToken ct)
    {
        await using var scope=scopes.CreateAsyncScope();var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        DateOnly? cursor=null;DateTimeOffset? lastAttempt=null;int failures=0;
        await db.Database.OpenConnectionAsync(ct);
        var connection=db.Database.GetDbConnection();
        await using(var command=connection.CreateCommand())
        {
            command.CommandText="SELECT complete_through,last_attempt_utc,failure_count FROM provider_sync_state WHERE provider='pagbank-edi'";
            await using var reader=await command.ExecuteReaderAsync(ct);
            if(await reader.ReadAsync(ct)){cursor=reader.IsDBNull(0)?null:reader.GetFieldValue<DateOnly>(0);lastAttempt=reader.IsDBNull(1)?null:reader.GetFieldValue<DateTimeOffset>(1);failures=reader.GetInt32(2);}
        }
        if(replayThrough is null && failures>0 && lastAttempt.HasValue && time.GetUtcNow()-lastAttempt.Value<TimeSpan.FromMinutes(Math.Min(360,10*Math.Pow(2,Math.Min(failures,6)))))return;
        var from=replayThrough.HasValue?start:cursor?.AddDays(-2)??start;if(from<start)from=start;
        var until=replayThrough??from.AddDays(6);if(until>Yesterday)until=Yesterday;
        using var client=clients.CreateClient("PagBankEdi");
        for(var day=from;day<=until;day=day.AddDays(1))
        {
            // Commit only after all four feeds for this day pass validation. A later day
            // may fail without discarding completed days. All writers share this lock.
            await using var tx=await db.Database.BeginTransactionAsync(ct);
            var locked=await db.Database.SqlQuery<bool>($"SELECT pg_try_advisory_xact_lock(19771007) AS \"Value\"").SingleAsync(ct);
            if(!locked)
            {
                if(replayThrough.HasValue)throw new FinancialRuleException("Outra coleta EDI está em andamento. Tente novamente depois.");
                return;
            }
            await db.Database.ExecuteSqlRawAsync("INSERT INTO provider_sync_state(provider) VALUES('pagbank-edi') ON CONFLICT DO NOTHING",ct);
            var collectionTime=time.GetUtcNow();
            foreach(var movement in Movements)
            {
                var page=1;var pages=1;var count=0;int? total=null;
                do
                {
                    using var request=new HttpRequestMessage(HttpMethod.Get,$"https://edi.api.pagbank.com.br/movement/v3.00/{movement}/{day:yyyy-MM-dd}?pageNumber={page}&pageSize=1000");
                    request.Headers.Authorization=new AuthenticationHeaderValue("Basic",Convert.ToBase64String(Encoding.UTF8.GetBytes(merchant+":"+token)));
                    request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));request.Headers.UserAgent.ParseAdd("LongBeachOS/1.0");
                    using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(45),time);
                    using var deadline=CancellationTokenSource.CreateLinkedTokenSource(ct,timeout.Token);
                    using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,deadline.Token);
                    if(!response.IsSuccessStatusCode)throw new FinancialRuleException("EDI_HTTP_"+(int)response.StatusCode);
                    if(!response.Headers.TryGetValues("VALIDADO",out var values)||!values.Any(x=>string.Equals(x,"true",StringComparison.OrdinalIgnoreCase)))
                        throw new FinancialRuleException("EDI_INCOMPLETE");
                    await using var stream=await response.Content.ReadAsStreamAsync(deadline.Token);using var output=new MemoryStream();
                    var buffer=new byte[8192];int length;
                    while((length=await stream.ReadAsync(buffer,deadline.Token))>0){if(output.Length+length>20_000_000)throw new FinancialRuleException("EDI_RESPONSE_LIMIT");output.Write(buffer,0,length);}
                    var bytes=output.ToArray();using var json=JsonDocument.Parse(bytes);var parsed=PagBankEdiRules.Parse(json.RootElement,page,merchant);
                    if(total.HasValue && (total.Value!=parsed.TotalElements||pages!=parsed.TotalPages))throw new FinancialRuleException("EDI_PAGINATION_CHANGED");
                    pages=parsed.TotalPages;total=parsed.TotalElements;count+=parsed.Details.Count;
                    var hash=Convert.ToHexStringLower(SHA256.HashData(bytes));var payload=json.RootElement.GetRawText();
                    await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO provider_documents(id,provider,movement,movement_date,page_number,source_sha256,payload,validated,fetched_at_utc) VALUES({Guid.NewGuid()},'pagbank-edi',{movement},{day},{page},{hash},{payload}::jsonb,true,{collectionTime}) ON CONFLICT(provider,movement,movement_date,page_number,source_sha256) DO UPDATE SET fetched_at_utc=EXCLUDED.fetched_at_utc",ct);
                    page++;
                }while(page<=pages);
                if(count!=total)throw new FinancialRuleException("EDI_COUNT_MISMATCH");
            }
            if(replayThrough is null)
                await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE provider_sync_state SET complete_through=GREATEST(complete_through,{day}),last_success_utc={time.GetUtcNow()},last_attempt_utc={time.GetUtcNow()},failure_code=NULL,failure_count=0 WHERE provider='pagbank-edi'",ct);
            // Replaying a historical period must not advance or clear the daily cursor.
            db.AuditLogs.Add(AuditLog.Create(actor,replayThrough.HasValue?"ProviderDocumentsReprocessed":"ProviderDocumentsCollected","Integration","pagbank-edi",JsonSerializer.Serialize(new{From=day,Through=day,Reason=reason}),null,"LongBeachOS","pagbank-edi",time.GetUtcNow()));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            db.ChangeTracker.Clear();
        }
    }
}
