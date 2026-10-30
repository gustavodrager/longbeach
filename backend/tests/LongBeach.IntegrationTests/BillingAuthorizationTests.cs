using System.Net;
using System.Net.Http.Headers;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
namespace LongBeach.IntegrationTests;

public sealed class BillingAuthorizationTests
{
    [Theory]
    [InlineData("/api/v1/me/portal/profile")]
    [InlineData("/api/v1/me/portal/agenda")]
    [InlineData("/api/v1/me/portal/requests")]
    [InlineData("/api/v1/portal/requests")]
    [InlineData("/api/v1/me/billing/accounts")]
    [InlineData("/api/v1/me/billing/config")]
    [InlineData("/api/v1/me/billing/subscriptions")]
    [InlineData("/api/v1/bar/tabs/customers?search=cliente") ]
    [InlineData("/api/v1/billing/accounts")]
    [InlineData("/api/v1/billing/candidates")]
    [InlineData("/api/v1/portal/candidates")]
    [InlineData("/api/v1/portal/options")]
    public async Task Billing_always_requires_individual_login(string path)
    { await using var f = new LongBeachWebApplicationFactory(); using var c = f.CreateClient(); Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync(path)).StatusCode); }
    [Fact]
    public async Task Subscription_refresh_requires_login_even_without_a_request_body()
    {
        await using var f = new LongBeachWebApplicationFactory(); using var c = f.CreateClient();
        var response = await c.PostAsync("/api/v1/me/billing/subscriptions/00000000-0000-4000-8000-000000000001/refresh", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
    [Theory]
    [InlineData("/api/v1/bar/tabs/customers?search=cliente") ]
    [InlineData("/api/v1/billing/accounts")]
    [InlineData("/api/v1/billing/candidates")]
    [InlineData("/api/v1/portal/candidates")]
    [InlineData("/api/v1/portal/options")]
    [InlineData("/api/v1/portal/requests")]
    public async Task Student_cannot_enter_financial_management(string path)
    {
        await using var f = new LongBeachWebApplicationFactory(); using var c = f.CreateClient(); c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token()); Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(path)).StatusCode);
    }
    [Fact]
    public async Task Student_cannot_refund_or_assign_accounts()
    {
        await using var f = new LongBeachWebApplicationFactory(); using var c = f.CreateClient(); c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token());
        foreach (var path in new[] { "/api/v1/billing/accounts", "/api/v1/billing/accounts/00000000-0000-4000-8000-000000000001/payments/00000000-0000-4000-8000-000000000002/refund" }) Assert.Equal(HttpStatusCode.Forbidden, (await c.PostAsync(path, new StringContent("{}", Encoding.UTF8, "application/json"))).StatusCode);
    }
    private static string Token() => ProfileAuthorizationTests.Token(Guid.NewGuid(), ["Student"]);
}
