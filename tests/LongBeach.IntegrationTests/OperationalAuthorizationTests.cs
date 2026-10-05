using System.Net;
using System.Net.Http.Headers;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;
public sealed class OperationalAuthorizationTests
{
    [Theory]
    [InlineData("students")]
    [InlineData("team")]
    [InlineData("inventory")]
    [InlineData("projects")]
    [InlineData("courts")]
    [InlineData("reservations")]
    [InlineData("classes")]
    [InlineData("enrollments")]
    [InlineData("presences")]
    [InlineData("financeEntries")]
    [InlineData("maintenance")]
    public async Task Arena_records_require_login_and_kind_permission(string kind)
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var path = $"/api/v1/operations/{kind}";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token("bar:sales:operate"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsync(path + "/00000000-0000-4000-8000-000000000001", new StringContent("{}", Encoding.UTF8, "application/json"))).StatusCode);
    }
    [Theory]
    [InlineData("courts")]
    [InlineData("reservations")]
    [InlineData("classes")]
    [InlineData("enrollments")]
    [InlineData("presences")]
    [InlineData("financeEntries")]
    [InlineData("maintenance")]
    public async Task Public_legacy_demo_does_not_open_new_arena_modules(string kind)
    {
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["DemoMode:PublicOperationalData"] = "true" })));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/v1/operations/{kind}")).StatusCode);
    }
    [Fact]
    public async Task Read_permission_does_not_allow_writing_student_records()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token("students:read"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsync("/api/v1/operations/students/00000000-0000-4000-8000-000000000001", new StringContent("{}", Encoding.UTF8, "application/json"))).StatusCode);
    }
    [Fact]
    public async Task Student_without_staff_role_cannot_read_other_students()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token("students:read", "Student"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/operations/students")).StatusCode);
    }
    [Fact]
    public async Task Court_capacity_requires_reception_permission_and_valid_date()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var path = "/api/v1/operations/courts/schedule?date=2026-10-05";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token("students:read"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token("projects:read"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/operations/courts/schedule?date=invalid")).StatusCode);
    }
    [Fact]
    public async Task Recurring_groups_require_individual_reception_write_permission_even_in_public_demo()
    {
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["DemoMode:PublicOperationalData"] = "true" })));
        using var client = factory.CreateClient(); const string path = "/api/v1/operations/reservations/recurring";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync(path, new StringContent("{}", Encoding.UTF8, "application/json"))).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token("projects:read"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(path, new StringContent("{}", Encoding.UTF8, "application/json"))).StatusCode);
    }
    private static string Token(string permission, string? role = null)
    {
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim> { new("sub", Guid.NewGuid().ToString()), new("permission", permission) };
        if (role is not null) claims.Add(new Claim(ClaimTypes.Role, role));
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", claims, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), credentials));
    }
}
