using System.Net;
using System.Net.Http.Headers;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Configuration;
namespace LongBeach.IntegrationTests;
public sealed class BarAuthorizationTests
{
    [Theory]
    [InlineData("/api/v1/bar/catalog")]
    [InlineData("/api/v1/bar/products")]
    [InlineData("/api/v1/bar/stock/balances")]
    [InlineData("/api/v1/bar/stock/movements")]
    [InlineData("/api/v1/bar/cash/sessions")]
    [InlineData("/api/v1/bar/sales")]
    [InlineData("/api/v1/bar/purchases")]
    [InlineData("/api/v1/bar/payments")]
    [InlineData("/api/v1/bar/dashboard")]
    public async Task Bar_requires_login_even_when_operational_demo_is_public(string path)
    {
        await using var factory=new LongBeachWebApplicationFactory().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["DemoMode:PublicOperationalData"]="true"})));
        using var client=factory.CreateClient();Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",Token());
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(path)).StatusCode);
    }
    [Fact]
    public async Task Unsigned_webhook_cannot_approve_payment()
    {await using var f=new LongBeachWebApplicationFactory();using var c=f.CreateClient();Assert.Equal(HttpStatusCode.Unauthorized,(await c.PostAsync("/api/v1/integrations/pagbank/webhook",new StringContent("{}",Encoding.UTF8,"application/json"))).StatusCode);}
    private static string Token()
    {
        var creds=new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")),SecurityAlgorithms.HmacSha256);
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests","LongBeach.Tests.Client",[new Claim("sub",Guid.NewGuid().ToString())],DateTime.UtcNow.AddMinutes(-1),DateTime.UtcNow.AddMinutes(5),creds));
    }
}
