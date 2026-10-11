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
    [InlineData("/api/v1/bar/stock/valuation")]
    [InlineData("/api/v1/bar/cash/sessions")]
    [InlineData("/api/v1/bar/sales")]
    [InlineData("/api/v1/bar/purchases")]
    [InlineData("/api/v1/bar/payments")]
    [InlineData("/api/v1/bar/dashboard")]
    [InlineData("/api/v1/bar/recipes")]
    [InlineData("/api/v1/bar/recipes/00000000-0000-0000-0000-000000000001")]
    [InlineData("/api/v1/bar/tabs")]
    [InlineData("/api/v1/bar/tabs/locations")]
    [InlineData("/api/v1/bar/tabs/catalog")]
    [InlineData("/api/v1/bar/tabs/config")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001")]
    [InlineData("/api/v1/bar/tabs/reports/received")]
    [InlineData("/api/v1/bar/tabs/payments/00000000-0000-0000-0000-000000000001")]
    [InlineData("/api/v1/bar/tabs/resources/cash/00000000-0000-0000-0000-000000000001")]
    [InlineData("/api/v1/bar/cash/locations")]
    [InlineData("/api/v1/imports")]
    [InlineData("/api/v1/imports/00000000-0000-0000-0000-000000000001/rows")]
    public async Task Bar_requires_login_even_when_operational_demo_is_public(string path)
    {
        await using var factory=new LongBeachWebApplicationFactory().WithWebHostBuilder(b=>b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["DemoMode:PublicOperationalData"]="true"})));
        using var client=factory.CreateClient();Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",Token());
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(path)).StatusCode);
    }
    [Theory]
    [InlineData("/api/v1/bar/tabs/reports/received")]
    [InlineData("/api/v1/bar/stock/valuation")]
    [InlineData("/api/v1/bar/tabs/payments/00000000-0000-0000-0000-000000000001")]
    [InlineData("/api/v1/bar/tabs/resources/cash/00000000-0000-0000-0000-000000000001")]
    public async Task Sales_reader_cannot_access_financial_drilldown(string path)
    {
        await using var factory = new LongBeachWebApplicationFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token("bar:sales:read"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
    }
    [Fact]
    public async Task Stock_reader_cannot_access_inventory_costs_and_profit()
    {
        await using var factory = new LongBeachWebApplicationFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token("bar:stock:read"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/bar/stock/valuation")).StatusCode);
    }
    [Theory]
    [InlineData("/api/v1/bar/tabs")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/items")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/payments")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/access")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/access/revoke")]
    [InlineData("/api/v1/bar/recipes")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/adjustments")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/payments/00000000-0000-0000-0000-000000000002/reconcile")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/payments/00000000-0000-0000-0000-000000000002/refund")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/items/00000000-0000-0000-0000-000000000002/reverse")]
    [InlineData("/api/v1/bar/purchases/00000000-0000-0000-0000-000000000001/payment-reference")]
    public async Task Tab_mutations_require_login_and_their_permission(string path)
    {
        await using var factory = new LongBeachWebApplicationFactory();
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync(path, JsonBody())).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(path, JsonBody())).StatusCode);
    }
    [Theory]
    [InlineData("/api/v1/bar/recipes")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/adjustments")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/payments/00000000-0000-0000-0000-000000000002/reconcile")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/payments/00000000-0000-0000-0000-000000000002/refund")]
    [InlineData("/api/v1/bar/tabs/00000000-0000-0000-0000-000000000001/items/00000000-0000-0000-0000-000000000002/reverse")]
    [InlineData("/api/v1/bar/purchases/00000000-0000-0000-0000-000000000001/payment-reference")]
    public async Task Operator_cannot_approve_supervisory_actions(string path)
    {
        await using var factory = new LongBeachWebApplicationFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token("bar:sales:operate"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(path, JsonBody())).StatusCode);
    }
    [Fact]
    public async Task Unsigned_webhook_cannot_approve_payment()
    {await using var f=new LongBeachWebApplicationFactory();using var c=f.CreateClient();Assert.Equal(HttpStatusCode.Unauthorized,(await c.PostAsync("/api/v1/integrations/pagbank/webhook",new StringContent("{}",Encoding.UTF8,"application/json"))).StatusCode);}
    private static StringContent JsonBody() => new("{}", Encoding.UTF8, "application/json");
    private static string Token(params string[] permissions)
    {
        var creds=new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")),SecurityAlgorithms.HmacSha256);
        var claims = new[] { new Claim("sub", Guid.NewGuid().ToString()) }.Concat(permissions.Select(permission => new Claim("permission", permission)));
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests","LongBeach.Tests.Client",claims,DateTime.UtcNow.AddMinutes(-1),DateTime.UtcNow.AddMinutes(5),creds));
    }
}
