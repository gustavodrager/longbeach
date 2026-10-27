using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using LongBeach.Contracts.Auth;
using LongBeach.Domain.Identity;
using Microsoft.IdentityModel.Tokens;
namespace LongBeach.IntegrationTests;
public sealed class ProfileAuthorizationTests
{
    internal static string Token(Guid id, string[] roles, string[]? permissions=null)
    {
        var claims=new List<Claim>{new("sub",id.ToString())};claims.AddRange(roles.Select(r=>new Claim(ClaimTypes.Role,r)));claims.AddRange((permissions??SystemPermissions.All.ToArray()).Select(p=>new Claim("permission",p)));
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests","LongBeach.Tests.Client",claims,DateTime.UtcNow.AddMinutes(-1),DateTime.UtcNow.AddMinutes(5),new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")),SecurityAlgorithms.HmacSha256)));
    }
    [Theory]
    [InlineData("Teacher","/api/v1/operations/students")]
    [InlineData("Teacher","/api/v1/operations/classes")]
    [InlineData("Teacher","/api/v1/operations/courts/schedule?date=2026-10-10")]
    [InlineData("Teacher","/api/v1/operations/financeEntries")]
    [InlineData("Teacher","/api/v1/teaching/access")]
    [InlineData("Teacher","/api/v1/portal/requests")]
    [InlineData("Student","/api/v1/operations/students")]
    [InlineData("Student","/api/v1/me/teaching")]
    [InlineData("Student","/api/v1/bar/tabs")]
    [InlineData("Student","/api/v1/financial-history")]
    [InlineData("BarOperator","/api/v1/operations/students")]
    [InlineData("BarOperator","/api/v1/me/teaching")]
    [InlineData("BarOperator","/api/v1/bar/stock/balances")]
    [InlineData("BarOperator","/api/v1/financial-history")]
    [InlineData("BarOperator","/api/v1/bar/products")]
    public async Task Old_broad_claims_cannot_escape_profile(string role,string path)
    {
        await using var factory=new LongBeachWebApplicationFactory();using var client=factory.CreateClient();client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",Token(Guid.NewGuid(),[role]));
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(path)).StatusCode);
    }
    [Theory][InlineData("Owner")][InlineData("Administrator")][InlineData("Manager")]
    public async Task Management_receives_full_effective_permissions_even_with_old_claims(string role)
    {
        await using var factory=new LongBeachWebApplicationFactory();using var client=factory.CreateClient();client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",Token(Guid.NewGuid(),[role],[]));
        var me=await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me");Assert.NotNull(me);Assert.Equal(SystemPermissions.All.Order(),me.Permissions.Order());
    }
    [Fact]
    public async Task Combined_teacher_and_bar_role_keeps_only_bar_permissions()
    {
        await using var factory=new LongBeachWebApplicationFactory();using var client=factory.CreateClient();client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",Token(Guid.NewGuid(),["Teacher","Student","BarOperator"]));
        var me=await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me");Assert.NotNull(me);Assert.Contains("bar:sales:operate",me.Permissions);Assert.DoesNotContain("students:read",me.Permissions);Assert.DoesNotContain("bar:supervise",me.Permissions);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PutAsJsonAsync("/api/v1/operations/presences/00000000-0000-4000-8000-000000000001",new{})).StatusCode);
    }
}
