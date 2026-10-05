using System.Net;
using System.Net.Http.Json;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
namespace LongBeach.IntegrationTests;
public sealed class BarClientAccessTests
{
    [Theory]
    [InlineData("")]
    [InlineData("/catalog")]
    [InlineData("/config")]
    public async Task Missing_credential_returns_401_before_any_account_data(string suffix)
    {
        await using var factory=new LongBeachWebApplicationFactory(); using var client=factory.CreateClient();
        var response=await client.GetAsync("/api/v1/bar/client"+suffix);
        Assert.Equal(HttpStatusCode.Unauthorized,response.StatusCode);
        Assert.DoesNotContain("\"items\"",await response.Content.ReadAsStringAsync());
    }
    [PostgresFact]
    public async Task Revoked_expired_and_closed_credentials_return_410_and_foreign_payment_returns_403()
    {
        await using var factory=Factory(); using var client=factory.CreateClient();
        var actor=Guid.NewGuid(); Guid locationId; Guid productId;
        await using (var scope=factory.Services.CreateAsyncScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>(); await db.Database.MigrateAsync();
            var location=new StockLocation("Acesso de teste "+Guid.NewGuid()); var category=new BarProductCategory("Acesso de teste "+Guid.NewGuid());
            var product=new BarProduct(Guid.NewGuid().ToString(),"Produto teste","Produto",category.Id,"un","cx",1,10,0,0,false,false,0);
            db.AddRange(location,category,product); await db.SaveChangesAsync(); locationId=location.Id; productId=product.Id;
        }
        async Task<(Guid TabId,string Token)> Access()
        {
            await using var scope=factory.Services.CreateAsyncScope(); var service=scope.ServiceProvider.GetRequiredService<IBarTabs>();
            var tab=await service.Open(new(Guid.NewGuid(),locationId),actor,default); var access=await service.IssueAccess(tab.Id,new(Guid.NewGuid()),actor,default); return (tab.Id,access.Token);
        }
        async Task<HttpResponseMessage> Get(string token,string suffix="")
        {
            using var request=new HttpRequestMessage(HttpMethod.Get,"/api/v1/bar/client"+suffix); request.Headers.Add("X-LongBeach-Tab",token); return await client.SendAsync(request);
        }
        var active=await Access(); Assert.Equal(HttpStatusCode.OK,(await Get(active.Token)).StatusCode);
        using (var invalid=await Get(new string('x',43))) Assert.Equal(HttpStatusCode.Unauthorized,invalid.StatusCode);
        Guid paymentId;
        await using (var scope=factory.Services.CreateAsyncScope())
        {
            var service=scope.ServiceProvider.GetRequiredService<IBarTabs>(); var other=await service.Open(new(Guid.NewGuid(),locationId),actor,default);
            await service.Add(other.Id,new(Guid.NewGuid(),[new(productId,1)],true),actor,null,default);
            paymentId=(await service.Pay(other.Id,new(Guid.NewGuid(),"CardManual",10,CardApproved:true),actor,null,default)).Id;
        }
        using (var request=new HttpRequestMessage(HttpMethod.Post,$"/api/v1/bar/client/payments/{paymentId}/refresh"))
        {
            request.Headers.Add("X-LongBeach-Tab",active.Token); Assert.Equal(HttpStatusCode.Forbidden,(await client.SendAsync(request)).StatusCode);
        }
        await using (var scope=factory.Services.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<IBarTabs>().RevokeAccess(active.TabId,new(Guid.NewGuid()),actor,default);
        foreach(var suffix in new[]{"","/catalog","/config"})
        {
            using var response=await Get(active.Token,suffix); Assert.Equal(HttpStatusCode.Gone,response.StatusCode); Assert.DoesNotContain("\"items\"",await response.Content.ReadAsStringAsync());
        }
        var expired=await Access();
        await using (var scope=factory.Services.CreateAsyncScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>(); var access=await db.Set<BarTabAccess>().SingleAsync(x=>x.TabId==expired.TabId);
            db.Entry(access).Property(x=>x.ExpiresAtUtc).CurrentValue=DateTimeOffset.UtcNow.AddSeconds(-1); await db.SaveChangesAsync();
        }
        using (var response=await Get(expired.Token)) Assert.Equal(HttpStatusCode.Gone,response.StatusCode);
        var closed=await Access();
        await using (var scope=factory.Services.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<IBarTabs>().Close(closed.TabId,new(Guid.NewGuid()),actor,default);
        using (var response=await Get(closed.Token)) Assert.Equal(HttpStatusCode.Gone,response.StatusCode);
    }
    private static WebApplicationFactory<Program> Factory()=>new LongBeachWebApplicationFactory().WithWebHostBuilder(builder=>builder
        .ConfigureAppConfiguration((_,config)=>config.AddInMemoryCollection(new Dictionary<string,string?>{{"ConnectionStrings:LongBeach",Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")}}))
        .ConfigureServices(services=>services.AddDbContext<LongBeachDbContext>(options=>options.UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")))));
}
