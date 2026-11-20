using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using LongBeach.Api.Middleware;
using LongBeach.Application.Staff;
using LongBeach.Contracts.Auth;
using LongBeach.Domain.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class OwnerFullAccessAuthorizationTests
{
    private static User RestrictedManager()
    {
        var user = User.Create("Synthetic owner", "owner-full-access@example.invalid", "test-only-hash");
        var type = StaffAccessCatalog.Default("gestor");
        type.Update("Finance consultation", ["finance"], []);
        user.AssignRole(new Role(SystemRoles.Manager));
        user.AttachStaffMembership(new(user.Id, Guid.NewGuid(), type));
        return TestSessionUsers.Add(user);
    }

    private static string PreviousOwnerToken(User user)
    {
        Claim[] claims = [new("sub", user.Id.ToString()), new(ClaimTypes.Role, SystemRoles.Manager),
            new("can_manage_staff", "true"), new("staff_managed", "true"), new("staff_type_id", "gestor"),
            new("staff_menu", "finance"), new("staff_action", "finance.operate"),
            .. SystemPermissions.All.Select(permission => new Claim("permission", permission))];
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", claims,
            DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")),
                SecurityAlgorithms.HmacSha256)));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_current_owner_gets_complete_access_even_with_a_limited_template_and_old_scope_claims(bool googleOnly)
    {
        var user = RestrictedManager();
        if (googleOnly)
        {
            user.LinkGoogle("synthetic-owner-google-subject", "owner-google@example.invalid");
            user.DisableLocalPassword("replacement-test-hash");
        }
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.PostConfigure<StaffAccessOptions>(options => options.OwnerUserIds = [user.Id])));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", PreviousOwnerToken(user));

        var me = await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me");

        Assert.NotNull(me);
        Assert.Equal(user.Id, me.Id);
        Assert.True(me.CanManageStaff);
        Assert.Null(me.StaffAccess);
        Assert.Equal([SystemRoles.Manager], me.Roles);
        Assert.Equal(SystemPermissions.All.Order(StringComparer.Ordinal), me.Permissions.Order(StringComparer.Ordinal));
        Assert.Equal(googleOnly, me.GoogleLinked);
        Assert.Equal(!googleOnly, me.LocalPasswordEnabled);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/messaging/capabilities")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/bar/tabs/config")).StatusCode);
        Assert.Equal(["finance"], user.StaffMembership!.AccessType.Menus);
    }

    [Fact]
    public async Task The_same_token_loses_owner_access_when_current_configuration_removes_the_identity()
    {
        var user = RestrictedManager();
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.PostConfigure<StaffAccessOptions>(options => options.OwnerUserIds = [user.Id])));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", PreviousOwnerToken(user));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/messaging/capabilities")).StatusCode);

        factory.Services.GetRequiredService<IOptions<StaffAccessOptions>>().Value.OwnerUserIds = [];
        var me = await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me");

        Assert.NotNull(me);
        Assert.False(me.CanManageStaff);
        Assert.Equal("gestor", me.StaffAccess!.TypeId);
        Assert.Equal(["finance"], me.StaffAccess.Menus);
        Assert.Contains(SystemPermissions.FinanceRead, me.Permissions);
        Assert.DoesNotContain(SystemPermissions.FinanceWrite, me.Permissions);
        Assert.DoesNotContain(SystemPermissions.EmployeesWrite, me.Permissions);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/messaging/capabilities")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/bar/tabs/config")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/staff-access/context")).StatusCode);
    }

    [Fact]
    public async Task A_bar_account_does_not_inherit_owner_access_from_configured_id_or_old_token_claims()
    {
        var user = RestrictedManager();
        user.SetRole(new Role(SystemRoles.Operations));
        user.StaffMembership!.SetType(StaffAccessCatalog.Default("bar"));
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.PostConfigure<StaffAccessOptions>(options => options.OwnerUserIds = [user.Id])));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", PreviousOwnerToken(user));

        var me = await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me");

        Assert.NotNull(me);
        Assert.False(me.CanManageStaff);
        Assert.Equal([SystemRoles.Operations], me.Roles);
        Assert.Equal("bar", me.StaffAccess!.TypeId);
        Assert.DoesNotContain(SystemPermissions.FinanceRead, me.Permissions);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/bar/tabs/config")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/messaging/capabilities")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/staff-access/context")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/owner-overview")).StatusCode);
    }

    [Theory]
    [InlineData("GET", true, true)]
    [InlineData("HEAD", true, true)]
    [InlineData("POST", true, false)]
    [InlineData("GET", false, false)]
    public void The_overview_scope_requires_owner_authority_and_read_only_access(string method, bool owner, bool allowed)
    {
        Claim[] claims = [new("staff_menu", "overview"), new("can_manage_staff", owner ? "true" : "false")];
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "fixture"));
        Assert.Equal(allowed, StaffApiScope.Allowed(principal, method, "/api/v1/owner-overview"));
    }
}
