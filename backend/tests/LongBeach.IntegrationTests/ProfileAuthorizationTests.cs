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
    internal static string Token(Guid id, string[] roles, string[]? permissions = null, bool registerUser = true)
    {
        if (registerUser)
        {
            if (roles.Length == 1 && SystemRoles.IsValid(roles[0])) TestSessionUsers.Register(id, roles[0]);
            else TestSessionUsers.RegisterLegacy(id, roles);
        }
        var claims = new List<Claim> { new("sub", id.ToString()) };
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));
        claims.AddRange((permissions ?? SystemPermissions.All.ToArray()).Select(p => new Claim("permission", p)));
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", claims,
            DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256)));
    }

    [Theory]
    [InlineData("Teacher", "/api/v1/operations/students")]
    [InlineData("Teacher", "/api/v1/operations/classes")]
    [InlineData("Teacher", "/api/v1/operations/courts/schedule?date=2026-10-10")]
    [InlineData("Teacher", "/api/v1/operations/financeEntries")]
    [InlineData("Teacher", "/api/v1/teaching/access")]
    [InlineData("Teacher", "/api/v1/portal/requests")]
    [InlineData("Student", "/api/v1/operations/students")]
    [InlineData("Student", "/api/v1/me/teaching")]
    [InlineData("Student", "/api/v1/bar/tabs")]
    [InlineData("Student", "/api/v1/financial-history")]
    [InlineData("Operations", "/api/v1/me/teaching")]
    [InlineData("Operations", "/api/v1/financial-history")]
    [InlineData("Operations", "/api/v1/bar/products")]
    [InlineData("Operations", "/api/v1/billing/accounts")]
    public async Task Old_broad_claims_cannot_escape_current_profile(string role, string path)
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(Guid.NewGuid(), [role]));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
    }

    [Theory][InlineData("Owner")][InlineData("Administrator")][InlineData("Manager")]
    public async Task Converted_manager_uses_current_profile_even_with_legacy_or_empty_claims(string oldRole)
    {
        var id = Guid.NewGuid(); TestSessionUsers.Register(id, "Manager");
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(id, [oldRole], []));
        var me = await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me");
        Assert.NotNull(me); Assert.Equal(new[] { "Manager" }, me.Roles);
        Assert.Equal(SystemPermissions.All.Order(), me.Permissions.Order());
    }

    [Theory]
    [InlineData("Owner")][InlineData("Administrator")][InlineData("BarOperator")][InlineData("BarSupervisor")]
    [InlineData("StockManager")][InlineData("BarFinance")][InlineData("Viewer")][InlineData("Auditor")][InlineData("Custom")]
    public async Task Unconverted_account_is_rejected_even_with_valid_signed_administrative_claims(string role)
    {
        var id = Guid.NewGuid(); TestSessionUsers.RegisterLegacy(id, role);
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(id, ["Manager"]));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Multiple_profiles_do_not_combine_or_recover_access_from_old_tokens()
    {
        var id = Guid.NewGuid(); TestSessionUsers.RegisterLegacy(id, "Manager", "Teacher");
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(id, ["Manager"]));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Same_access_token_immediately_observes_role_change_and_deactivation()
    {
        var user = TestSessionUsers.Register(Guid.NewGuid(), "Manager");
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(user.Id, ["Manager"]));
        Assert.Contains("finance:write", (await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me"))!.Permissions);
        user.SetRole(new Role("Operations"));
        var attendant = await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me");
        Assert.Equal(new[] { "Operations" }, attendant!.Roles);
        Assert.Contains("students:write", attendant.Permissions);
        Assert.DoesNotContain("finance:read", attendant.Permissions);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/billing/accounts")).StatusCode);
        user.SetRole(new Role("Student"));
        Assert.Empty((await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me"))!.Permissions);
        user.Deactivate();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Missing_accounts_cannot_use_a_previously_signed_token()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(Guid.NewGuid(), ["Manager"], registerUser: false));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }
}
