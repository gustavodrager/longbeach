using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
namespace LongBeach.IntegrationTests;
public sealed class FinancialHistoryPostgresTests
{
    [PostgresFact] public async Task History_is_atomic_idempotent_audited_and_preserves_period_status()
    {
        await using var db=Database();await db.Database.MigrateAsync();
        var hash=Guid.NewGuid().ToString("N")+Guid.NewGuid().ToString("N");var metric="test-"+hash;
        var row=new FinancialObservation("financial-observation-v1","BRL","Teste!G2","alunos",metric,"Aluno teste","Não Pago",new(2045,8,1),new(2045,8,31),"month",12345,"");
        var batch=await Stage(db,hash,row);var service=new FinancialHistoryService(db,new NullAuditContext(),TimeProvider.System,new ConfigurationBuilder().Build());
        var preview=await service.Preview(batch,default);
        await Assert.ThrowsAsync<FinancialRuleException>(()=>service.Apply(batch,"stale",default));
        Assert.Equal(0,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM financial_observations WHERE source_sha256={hash}").SingleAsync());
        await service.Apply(batch,preview.ConfirmationToken,default);await service.Apply(batch,preview.ConfirmationToken,default);
        var repeatedBatch=await Stage(db,hash,row);var repeated=await service.Preview(repeatedBatch,default);Assert.Equal(0,repeated.Creates);Assert.Equal(1,repeated.Matches);
        await service.Apply(repeatedBatch,repeated.ConfirmationToken,default);
        Assert.Equal(1,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM financial_observations WHERE source_sha256={hash}").SingleAsync());
        Assert.True(await db.AuditLogs.AnyAsync(x=>x.Action=="FinancialHistoryApplied"&&x.ResourceId==batch.ToString()));
        var report=await service.Report("2045-08","alunos",metric,1,default);Assert.Single(report.Items);Assert.Equal("Não Pago",report.Totals.Single().State);Assert.Equal(12345,report.Totals.Single().AmountCents);
        var changed=await Stage(db,hash,row with{State="Pago"});await Assert.ThrowsAsync<FinancialRuleException>(()=>service.Preview(changed,default));
        var overlap=await Stage(db,new string('f',64),row);await Assert.ThrowsAsync<FinancialRuleException>(()=>service.Preview(overlap,default));
        Assert.Equal("NeedsReview",await db.Database.SqlQuery<string>($"SELECT status AS \"Value\" FROM import_batches WHERE id={overlap}").SingleAsync());
    }
    [PostgresFact] public async Task Edi_requires_all_feeds_all_pages_and_validated_data_before_advancing()
    {
        await using var db=Database();await db.Database.MigrateAsync();
        // Isolated provider test transaction state: only the test database is used.
        await db.Database.ExecuteSqlRawAsync("DELETE FROM provider_documents WHERE provider='pagbank-edi'; DELETE FROM provider_sync_state WHERE provider='pagbank-edi'");
        var connection=Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL");var services=new ServiceCollection();services.AddDbContext<LongBeachDbContext>(x=>x.UseNpgsql(connection));services.AddSingleton(TimeProvider.System);
        using var scopeProvider=services.BuildServiceProvider();var factory=new FakeFactory();
        var worker=new PagBankEdiWorker(scopeProvider.GetRequiredService<IServiceScopeFactory>(),factory,new ConfigurationBuilder().Build(),TimeProvider.System,NullLogger<PagBankEdiWorker>.Instance);
        var yesterday=DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3)).AddDays(-1);
        await Assert.ThrowsAsync<FinancialRuleException>(()=>worker.Run("123","test-only",yesterday,default));
        Assert.Equal(0,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM provider_documents WHERE provider='pagbank-edi'").SingleAsync());
        factory.Validated=true;await worker.Run("123","test-only",yesterday,default);
        Assert.Equal(yesterday,await db.Database.SqlQuery<DateOnly>($"SELECT complete_through AS \"Value\" FROM provider_sync_state WHERE provider='pagbank-edi'").SingleAsync());
        Assert.Equal(5,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM provider_documents WHERE provider='pagbank-edi'").SingleAsync());
        await worker.Run("123","test-only",yesterday,default);Assert.Equal(5,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM provider_documents WHERE provider='pagbank-edi'").SingleAsync());
        var service=new FinancialHistoryService(db,new NullAuditContext(),TimeProvider.System,new ConfigurationBuilder().Build());var report=await service.ProviderRecords(null,1,default);Assert.Equal(5,report.Total);
        Assert.True(await db.AuditLogs.AnyAsync(x=>x.Action=="ProviderDocumentsCollected"));
        factory.Foreign=true;await Assert.ThrowsAsync<FinancialRuleException>(()=>worker.Run("123","test-only",yesterday,default));
        Assert.Equal(5,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM provider_documents WHERE provider='pagbank-edi'").SingleAsync());
    }
    private sealed class FakeFactory:IHttpClientFactory
    {
        public bool Validated;public bool Foreign;
        public HttpClient CreateClient(string name)=>new(new Handler(this));
        private sealed class Handler(FakeFactory owner):HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)
            {
                Assert.Equal(HttpMethod.Get,request.Method);Assert.Equal("edi.api.pagbank.com.br",request.RequestUri!.Host);Assert.Equal("Basic",request.Headers.Authorization?.Scheme);
                var page=request.RequestUri.Query.Contains("pageNumber=2")?2:1;var pages=request.RequestUri.AbsolutePath.Contains("transactional")?2:1;
                var json=JsonSerializer.Serialize(new{detalhes=new[]{new{estabelecimento=owner.Foreign?"999":"123",valor_liquido=107.88}},pagination=new{page,totalPages=pages,totalElements=pages}});
                var response=new HttpResponseMessage(System.Net.HttpStatusCode.OK){Content=new StringContent(json)};response.Headers.Add("VALIDADO",owner.Validated?"true":"false");return Task.FromResult(response);
            }
        }
    }
    private static async Task<Guid> Stage(LongBeachDbContext db,string hash,FinancialObservation row)
    {
        var batch=Guid.NewGuid();var source="test-"+batch+".json";var json=JsonSerializer.Serialize(row);var external="finance:"+row.SourceCell;
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO import_batches(id,source_name,source_sha256,status,row_count,created_at_utc) VALUES({batch},{source},{hash},'NeedsReview',1,{DateTimeOffset.UtcNow})");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO import_rows(id,batch_id,source_sheet,source_row,record_type,external_id,payload,review_status) VALUES({Guid.NewGuid()},{batch},'Teste',2,'reference-data',{external},{json}::jsonb,'NeedsReview')");return batch;
    }
    private static LongBeachDbContext Database()=>new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).Options,TimeProvider.System);
}
