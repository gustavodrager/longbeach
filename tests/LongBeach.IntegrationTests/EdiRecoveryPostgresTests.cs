using System.Net;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Finance;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace LongBeach.IntegrationTests;

public sealed class EdiRecoveryPostgresTests
{
    private static LongBeachDbContext Database() => new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).Options, TimeProvider.System);
    private static IConfiguration Config() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Integrations:PagBankEdi:Enabled"]="true", ["Integrations:PagBankEdi:User"]="123", ["Integrations:PagBankEdi:Token"]="test-only", ["Integrations:PagBankEdi:StartDate"]="2026-01-01" }).Build();
    private static ServiceProvider Scopes() => new ServiceCollection().AddSingleton(TimeProvider.System).AddDbContext<LongBeachDbContext>(o=>o.UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL"))).BuildServiceProvider();
    private static PagBankEdiWorker Worker(ServiceProvider scopes, Feed feed,TimeProvider? clock=null) => new(scopes.GetRequiredService<IServiceScopeFactory>(),feed,Config(),clock??TimeProvider.System,NullLogger<PagBankEdiWorker>.Instance);
    private static async Task Reset(LongBeachDbContext db)
    {
        await db.Database.MigrateAsync();
        await db.Database.ExecuteSqlRawAsync("TRUNCATE TABLE billing_settlements; DELETE FROM provider_documents WHERE provider='pagbank-edi'; DELETE FROM provider_sync_state WHERE provider='pagbank-edi'");
    }
    private static DateOnly Yesterday => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3)).AddDays(-1);

    [PostgresFact] public async Task Later_incomplete_day_preserves_completed_day_and_retry_does_not_duplicate()
    {
        await using var db=Database();await Reset(db);using var scopes=Scopes();var feed=new Feed{FailDay=Yesterday};var worker=Worker(scopes,feed);
        await Assert.ThrowsAsync<FinancialRuleException>(()=>worker.Run("123","test-only",Yesterday.AddDays(-1),default));
        Assert.Equal(Yesterday.AddDays(-1),await db.Database.SqlQuery<DateOnly>($"SELECT complete_through AS \"Value\" FROM provider_sync_state WHERE provider='pagbank-edi'").SingleAsync());
        Assert.Equal(4,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM provider_documents WHERE provider='pagbank-edi'").SingleAsync());
        feed.FailDay=null;await worker.Run("123","test-only",Yesterday.AddDays(-1),default);await worker.Run("123","test-only",Yesterday.AddDays(-1),default);
        Assert.Equal(8,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM provider_documents WHERE provider='pagbank-edi'").SingleAsync());
        Assert.Equal(Yesterday,await db.Database.SqlQuery<DateOnly>($"SELECT complete_through AS \"Value\" FROM provider_sync_state WHERE provider='pagbank-edi'").SingleAsync());
    }
    [PostgresFact] public async Task Replay_is_audited_and_does_not_advance_daily_cursor_or_clear_failure()
    {
        await using var db=Database();await Reset(db);using var scopes=Scopes();var worker=Worker(scopes,new Feed());
        await worker.Run("123","test-only",Yesterday,default);
        await db.Database.ExecuteSqlRawAsync("UPDATE provider_sync_state SET failure_code='EDI_HTTP_503',failure_count=2 WHERE provider='pagbank-edi'");
        var user=User.Create("Owner EDI",Guid.NewGuid()+"@example.invalid","test");db.Add(user);await db.SaveChangesAsync();
        await worker.Reprocess(Yesterday.AddDays(-10),Yesterday.AddDays(-9),"Conferência de histórico",user.Id,default);
        Assert.Equal(Yesterday,await db.Database.SqlQuery<DateOnly>($"SELECT complete_through AS \"Value\" FROM provider_sync_state WHERE provider='pagbank-edi'").SingleAsync());
        Assert.Equal("EDI_HTTP_503",await db.Database.SqlQuery<string>($"SELECT failure_code AS \"Value\" FROM provider_sync_state WHERE provider='pagbank-edi'").SingleAsync());
        Assert.True(await db.AuditLogs.AnyAsync(x=>x.Action=="ProviderDocumentsReprocessed"));
        Assert.Equal(12,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM provider_documents WHERE provider='pagbank-edi'").SingleAsync());
        await Assert.ThrowsAsync<FinancialRuleException>(()=>worker.Reprocess(Yesterday.AddDays(-7),Yesterday,"intervalo longo",user.Id,default));
        await Assert.ThrowsAsync<FinancialRuleException>(()=>worker.Reprocess(Yesterday,Yesterday.AddDays(1),"dia futuro",user.Id,default));
    }
    [PostgresFact] public async Task Body_timeout_releases_transaction_and_allows_retry()
    {
        await using var db=Database();await Reset(db);using var scopes=Scopes();var feed=new Feed{HangBody=true};var worker=Worker(scopes,feed,new FastDeadlineClock());
        await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>worker.Run("123","test-only",Yesterday,default));
        Assert.Equal(0,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM provider_documents WHERE provider='pagbank-edi'").SingleAsync());
        feed.HangBody=false;await Worker(scopes,feed).Run("123","test-only",Yesterday,default);
        Assert.Equal(4,await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM provider_documents WHERE provider='pagbank-edi'").SingleAsync());
    }
    [PostgresFact] public async Task Successful_but_stale_collection_is_not_reported_as_current()
    {
        await using var db=Database();await Reset(db);using var scopes=Scopes();await Worker(scopes,new Feed()).Run("123","test-only",Yesterday,default);
        await db.Database.ExecuteSqlRawAsync("UPDATE provider_sync_state SET last_success_utc=now()-interval '30 hours' WHERE provider='pagbank-edi'");
        var service=new FinancialHistoryService(db,new NullAuditContext(),TimeProvider.System,Config());
        Assert.Equal("Coleta atrasada",(await service.Integrations(default))[0].State);
    }
    [Fact] public async Task Failure_recording_does_not_escape_when_database_unavailable()
    {
        using var scopes=new ServiceCollection().AddSingleton(TimeProvider.System).AddDbContext<LongBeachDbContext>(o=>o.UseNpgsql("Host=127.0.0.1;Port=1;Database=unavailable;Username=test;Password=test;Timeout=1")).BuildServiceProvider();
        await Worker(scopes,new Feed()).RecordFailure("EDI_NETWORK",default);
    }
    private sealed class FastDeadlineClock:TimeProvider
    {
        public override ITimer CreateTimer(TimerCallback callback,object? state,TimeSpan dueTime,TimeSpan period)=>base.CreateTimer(callback,state,TimeSpan.FromMilliseconds(50),period);
    }
    private sealed class Feed:IHttpClientFactory
    {
        public DateOnly? FailDay;public bool HangBody;
        public HttpClient CreateClient(string name)=>new(new Handler(this));
        private sealed class Handler(Feed owner):HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)
            {
                var day=DateOnly.Parse(request.RequestUri!.Segments[^1]);
                var response=new HttpResponseMessage(HttpStatusCode.OK){Content=owner.HangBody?new StreamContent(new HangingStream()):new StringContent(JsonSerializer.Serialize(new{detalhes=Array.Empty<object>(),pagination=new{page=1,totalPages=0,totalElements=0}}))};
                response.Headers.Add("VALIDADO",day==owner.FailDay?"false":"true");return Task.FromResult(response);
            }
        }
    }
    private sealed class HangingStream:Stream
    {
        public override bool CanRead=>true;public override bool CanSeek=>false;public override bool CanWrite=>false;
        public override long Length=>throw new NotSupportedException();public override long Position{get=>0;set=>throw new NotSupportedException();}
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer,CancellationToken ct=default){await Task.Delay(Timeout.Infinite,ct);return 0;}
        public override int Read(byte[] buffer,int offset,int count)=>throw new NotSupportedException();public override void Flush(){}
        public override long Seek(long offset,SeekOrigin origin)=>throw new NotSupportedException();public override void SetLength(long value)=>throw new NotSupportedException();public override void Write(byte[] buffer,int offset,int count)=>throw new NotSupportedException();
    }
}
