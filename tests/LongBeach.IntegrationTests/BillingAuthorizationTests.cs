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
    [InlineData("/api/v1/me/billing/accounts")]
    [InlineData("/api/v1/me/billing/config")]
    [InlineData("/api/v1/me/billing/subscriptions")]
    [InlineData("/api/v1/billing/accounts")]
    [InlineData("/api/v1/billing/candidates")]
    [InlineData("/api/v1/billing/settlements")]
    public async Task Billing_always_requires_individual_login(string path)
    { await using var f = new LongBeachWebApplicationFactory(); using var c = f.CreateClient(); Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync(path)).StatusCode); }
    [Theory]
    [InlineData("/api/v1/billing/accounts")]
    [InlineData("/api/v1/billing/candidates")]
    [InlineData("/api/v1/billing/settlements")]
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
    private static string Token() => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", [new Claim("sub", Guid.NewGuid().ToString()), new Claim(ClaimTypes.Role, "Student")], DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256)));
}
