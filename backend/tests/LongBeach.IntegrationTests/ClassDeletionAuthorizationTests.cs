using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using LongBeach.Domain.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class ClassDeletionAuthorizationTests
{
    private static readonly string Path = $"/api/v1/operations/classes/{Guid.NewGuid()}?version=1";

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Anonymous_visitors_cannot_delete_classes_even_in_public_demo(bool publicDemo)
    {
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["DemoMode:PublicOperationalData"] = publicDemo.ToString() })));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.DeleteAsync(Path)).StatusCode);
    }

    [Theory]
    [InlineData("Operations")]
    [InlineData("Teacher")]
    [InlineData("Student")]
    public async Task Other_profiles_cannot_delete_even_with_old_management_claims(string role)
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), [role], SystemPermissions.All.ToArray()));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync(Path)).StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("?version=-1")]
    [InlineData("?version=invalid")]
    public async Task Manager_must_submit_a_valid_explicit_version(string query)
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.DeleteAsync($"/api/v1/operations/classes/{Guid.NewGuid()}{query}")).StatusCode);
    }

    [Fact]
    public async Task Delete_endpoint_does_not_allow_deleting_other_operational_modules()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/v1/operations/enrollments/{Guid.NewGuid()}?version=1")).StatusCode);
    }

    [Fact]
    public async Task Existing_token_loses_delete_access_immediately_after_role_change_or_deactivation()
    {
        var user = TestSessionUsers.Register(Guid.NewGuid(), "Manager");
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(user.Id, ["Manager"]));
        user.SetRole(new Role("Operations"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync(Path)).StatusCode);
        user.Deactivate();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.DeleteAsync(Path)).StatusCode);
    }

    [Fact]
    public async Task Pending_first_access_cannot_delete_even_with_a_manager_profile()
    {
        var user = User.CreateForFirstAccess("Gestor pendente", "pending-" + Guid.NewGuid().ToString("N"), "fixture-hash", DateTimeOffset.UtcNow.AddDays(1));
        user.AssignRole(new Role("Manager")); TestSessionUsers.Add(user);
        var claims = new[] { new Claim("sub", user.Id.ToString()), new Claim(ClaimTypes.Role, "Manager"), new Claim("requires_first_access", "true"), new Claim("permission", SystemPermissions.StudentsWrite) };
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", claims,
            DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256)));
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync(Path)).StatusCode);
    }
}
