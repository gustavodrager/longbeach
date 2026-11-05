using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using LongBeach.Api.Middleware;
using LongBeach.Application.Staff;
using LongBeach.Application.Operations;
using LongBeach.Contracts.Operations;
using LongBeach.Contracts.Staff;
using LongBeach.Domain.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class StaffScopeAuthorizationTests
{
    [Fact]
    public void Cancellation_requires_the_existing_tabs_menu_and_supervision_action()
    {
        const string path = "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/cancel";
        Assert.False(StaffApiScope.Allowed(Principal(["bar.tabs"], ["bar.tabs"]), "POST", path));
        Assert.False(StaffApiScope.Allowed(Principal(["bar.sell"], ["bar.supervise"]), "POST", path));
        Assert.True(StaffApiScope.Allowed(Principal(["bar.tabs"], ["bar.supervise"]), "POST", path));
    }

    [Theory]
    [InlineData("GET", "/api/v1/billing/accounts")]
    [InlineData("GET", "/api/v1/financial-history")]
    [InlineData("PUT", "/api/v1/operations/financeEntries/11111111-1111-1111-1111-111111111111")]
    [InlineData("GET", "/api/v1/imports")]
    [InlineData("GET", "/api/v1/messaging/conversations")]
    [InlineData("GET", "/api/v1/operations/students")]
    [InlineData("GET", "/api/v1/me/portal/profile")]
    [InlineData("GET", "/api/v1/unclassified-future-module")]
    public void Bar_cannot_reuse_broad_base_grants_for_other_areas(string method, string path)
    {
        var user = Principal(["bar.sell", "bar.tabs", "bar.orders", "bar.receive", "bar.cash"],
            ["bar.sell", "bar.tabs", "bar.orders", "bar.receive", "bar.cash"]);
        Assert.False(StaffApiScope.Allowed(user, method, path));
    }

    [Theory]
    [InlineData("POST", "/api/v1/bar/tabs")]
    [InlineData("POST", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/items")]
    [InlineData("POST", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/items/22222222-2222-2222-2222-222222222222/deliver")]
    [InlineData("POST", "/api/v1/bar/cash/sessions")]
    [InlineData("POST", "/api/v1/bar/sales/11111111-1111-1111-1111-111111111111/discount")]
    [InlineData("POST", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/payments/22222222-2222-2222-2222-222222222222/refund")]
    public void Receiving_only_cannot_sell_change_orders_open_cash_or_supervise(string method, string path)
    {
        Assert.False(StaffApiScope.Allowed(Principal(["bar.receive"], ["bar.receive"]), method, path));
    }

    [Theory]
    [InlineData("GET", "/api/v1/bar/tabs")]
    [InlineData("GET", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111")]
    [InlineData("GET", "/api/v1/bar/cash/current")]
    [InlineData("GET", "/api/v1/bar/tabs/config")]
    [InlineData("POST", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/payments")]
    [InlineData("POST", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/payments/22222222-2222-2222-2222-222222222222/refresh")]
    public void Receiving_keeps_its_readonly_dependencies_and_payment_action(string method, string path)
    {
        Assert.True(StaffApiScope.Allowed(Principal(["bar.receive"], ["bar.receive"]), method, path));
    }

    [Theory]
    [InlineData("GET", "/api/v1/bar/cash/history")]
    [InlineData("POST", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/adjustments")]
    [InlineData("POST", "/api/v1/bar/sales/11111111-1111-1111-1111-111111111111/refund")]
    [InlineData("GET", "/api/v1/billing/accounts")]
    public void Manager_stock_permission_package_does_not_restore_unchecked_finance(string method, string path)
    {
        Assert.False(StaffApiScope.Allowed(Principal(["stock"], ["stock.operate"]), method, path));
    }

    [Fact]
    public void Removing_operation_keeps_consultation_but_prevents_mutation()
    {
        var user = Principal(["bar.orders", "finance"], []);
        Assert.True(StaffApiScope.Allowed(user, "GET", "/api/v1/bar/tabs"));
        Assert.False(StaffApiScope.Allowed(user, "POST", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/items/22222222-2222-2222-2222-222222222222/deliver"));
        Assert.True(StaffApiScope.Allowed(user, "GET", "/api/v1/billing/accounts"));
        Assert.False(StaffApiScope.Allowed(user, "POST", "/api/v1/billing/accounts"));
    }

    [Fact]
    public void Comandas_can_open_and_identify_but_cannot_add_products_or_receive_without_those_actions()
    {
        var user = Principal(["bar.tabs"], ["bar.tabs"]);
        Assert.True(StaffApiScope.Allowed(user, "POST", "/api/v1/bar/tabs"));
        Assert.True(StaffApiScope.Allowed(user, "PUT", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/customer"));
        Assert.True(StaffApiScope.Allowed(user, "POST", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/access"));
        Assert.False(StaffApiScope.Allowed(user, "POST", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/items"));
        Assert.False(StaffApiScope.Allowed(user, "POST", "/api/v1/bar/tabs/11111111-1111-1111-1111-111111111111/payments"));
        Assert.True(StaffApiScope.Allowed(Principal(["stock"], ["stock.operate"]), "POST", "/api/v1/bar/categories"));
    }

    [Fact]
    public void Dependencies_are_minimal_routes_and_critical_actions_do_not_come_from_a_parent_menu()
    {
        var agenda = Principal(["agenda"], ["agenda.operate"]);
        Assert.True(StaffApiScope.Allowed(agenda, "GET", "/api/v1/customers/lookup", "reservations"));
        Assert.True(StaffApiScope.Allowed(agenda, "POST", "/api/v1/customers", "reservations"));
        Assert.False(StaffApiScope.Allowed(agenda, "GET", "/api/v1/customers"));
        Assert.False(StaffApiScope.Allowed(agenda, "PUT", "/api/v1/customers/11111111-1111-1111-1111-111111111111"));
        var customers = Principal(["customers"], ["customers.operate"]);
        Assert.False(StaffApiScope.Allowed(customers, "POST", "/api/v1/customers/merge"));
        Assert.True(StaffApiScope.Allowed(Principal(["customers"], ["customers.operate", "customers.merge"]), "POST", "/api/v1/customers/merge"));
        Assert.False(StaffApiScope.Allowed(Principal(["stock"], ["stock.operate"]), "GET", "/api/v1/received-invoices"));
        Assert.True(StaffApiScope.Allowed(Principal(["stock"], ["stock.operate", "stock.fiscal"]), "GET", "/api/v1/received-invoices"));
        var sends = Principal(["messaging.sends"], ["messaging.sends.operate"]);
        Assert.True(StaffApiScope.Allowed(sends, "GET", "/api/v1/messaging/operations/11111111-1111-1111-1111-111111111111"));
        Assert.True(StaffApiScope.Allowed(sends, "POST", "/api/v1/messaging/messages/11111111-1111-1111-1111-111111111111/cancel"));
        Assert.False(StaffApiScope.Allowed(sends, "POST", "/api/v1/messaging/conversations"));
        Assert.True(StaffApiScope.Allowed(Principal(["finance"], ["finance.operate"]), "PUT", "/api/v1/financial-history/monthly-controls/2026-11"));
        Assert.False(StaffApiScope.Allowed(Principal(["finance"], []), "PUT", "/api/v1/financial-history/monthly-controls/2026-11"));
        Assert.False(StaffApiScope.Allowed(Principal(["reports"], []), "POST", "/api/v1/financial-history/imports/11111111-1111-1111-1111-111111111111/apply"));
        var owner = Principal(["overview"], []); ((ClaimsIdentity)owner.Identity!).AddClaim(new("can_manage_staff", "true"));
        Assert.False(StaffApiScope.Allowed(owner, "POST", "/api/v1/imports"));
    }

    [Fact]
    public void Teacher_scope_has_its_rosters_and_explicit_presence_action_only()
    {
        var user = Principal(["teaching.attendance"], ["teaching.presence"]);
        Assert.True(StaffApiScope.Allowed(user, "GET", "/api/v1/me/teaching"));
        var roster = "/api/v1/me/teaching/classes/11111111-1111-1111-1111-111111111111";
        Assert.True(StaffApiScope.Allowed(user, "GET", roster));
        Assert.True(StaffApiScope.Allowed(Principal(["teaching.classes"], []), "GET", roster));
        Assert.True(StaffApiScope.Allowed(Principal(["teaching.today"], []), "GET", "/api/v1/me/teaching"));
        Assert.False(StaffApiScope.Allowed(Principal(["teaching.today"], []), "GET", roster));
        Assert.True(StaffApiScope.Allowed(user, "PUT", "/api/v1/me/teaching/classes/11111111-1111-1111-1111-111111111111/presences"));
        Assert.False(StaffApiScope.Allowed(user, "PUT", "/api/v1/operations/presences/11111111-1111-1111-1111-111111111111"));
        Assert.False(StaffApiScope.Allowed(user, "GET", "/api/v1/operations/students"));
        Assert.False(StaffApiScope.Allowed(Principal(["teaching.classes"], []), "PUT", "/api/v1/me/teaching/classes/11111111-1111-1111-1111-111111111111/presences"));
        Assert.True(StaffApiScope.Allowed(user, "GET", "/api/v1/me/auth-methods"));
    }

    [Theory]
    [InlineData("GET", "/api/v1/staff-access/context")]
    [InlineData("GET", "/api/v1/staff-access/types")]
    [InlineData("PUT", "/api/v1/staff-access/types/bar")]
    [InlineData("GET", "/api/v1/staff-access/members/11111111-1111-1111-1111-111111111111")]
    [InlineData("PUT", "/api/v1/staff-access/members/11111111-1111-1111-1111-111111111111")]
    [InlineData("POST", "/api/v1/staff-access/members/11111111-1111-1111-1111-111111111111/reset")]
    [InlineData("POST", "/api/v1/staff-access/members/11111111-1111-1111-1111-111111111111/block")]
    [InlineData("POST", "/api/v1/staff-access/members/11111111-1111-1111-1111-111111111111/reactivate")]
    [InlineData("PUT", "/api/v1/operations/team/11111111-1111-1111-1111-111111111111")]
    [InlineData("PUT", "/api/v1/teaching/access")]
    public async Task A_manager_cannot_forge_owner_authority_in_a_signed_stale_token(string method, string path)
    {
        var service = new StaffStub();
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.Replace(ServiceDescriptor.Singleton<IStaffAccess>(service))));
        using var client = factory.CreateClient();
        var user = TestSessionUsers.Register(Guid.NewGuid(), SystemRoles.Manager);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(user.Id, [new("can_manage_staff", "true"), new("staff_type_id", "manager"), new("staff_managed", "false")]));
        using var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { }) };
        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(request)).StatusCode);
        Assert.Equal(0, service.Calls);
    }

    [Fact]
    public async Task Explicit_owner_context_is_no_store_and_does_not_create_accounts()
    {
        var service = new StaffStub();
        var owner = TestSessionUsers.Register(Guid.NewGuid(), SystemRoles.Manager);
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["StaffAccess:OwnerUserIds:0"] = owner.Id.ToString() }))
            .ConfigureServices(services => services.Replace(ServiceDescriptor.Singleton<IStaffAccess>(service))));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(owner.Id));
        var response = await client.GetAsync("/api/v1/staff-access/context");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString());
        Assert.Equal(1, service.Calls);
    }

    [Theory]
    [InlineData(SystemRoles.Teacher)]
    [InlineData(SystemRoles.Operations)]
    [InlineData(SystemRoles.Student)]
    public async Task Configured_identity_with_a_non_manager_profile_is_not_an_owner(string role)
    {
        var user = TestSessionUsers.Register(Guid.NewGuid(), role);
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["StaffAccess:OwnerUserIds:0"] = user.Id.ToString() })));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(user.Id, [new("can_manage_staff", "true")]));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/staff-access/context")).StatusCode);
    }

    [Fact]
    public async Task An_empty_owner_configuration_never_falls_back_to_all_managers()
    {
        var user = TestSessionUsers.Register(LongBeachWebApplicationFactory.StaffOwnerId, SystemRoles.Manager);
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureServices(services => services.PostConfigure<StaffAccessOptions>(settings => settings.OwnerUserIds = [])));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(user.Id));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/staff-access/context")).StatusCode);
    }

    [Fact]
    public async Task New_staff_first_access_requires_local_password_even_when_google_is_enabled()
    {
        var user = User.CreateForStaffFirstAccess("Synthetic pending staff", null, "11999991234", "test-only-hash", DateTimeOffset.UtcNow.AddHours(24));
        user.AssignRole(new Role(SystemRoles.Operations)); TestSessionUsers.Add(user);
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:Google:Enabled"] = "true", ["Authentication:Google:ClientId"] = "staff-tests.apps.googleusercontent.com"
            })));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(user.Id, [new("requires_first_access", "true")]));
        client.DefaultRequestHeaders.Add("X-Google-Id-Token", "not-a-provider-token");
        var response = await client.PostAsJsonAsync("/api/v1/auth/first-access/google", new { });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.True(user.RequiresFirstAccess);
        Assert.True(user.RequiresLocalPasswordChange);
        Assert.Null(user.GoogleSubject);
    }

    [Fact]
    public async Task Class_import_cannot_create_team_for_a_non_owner_manager()
    {
        var imports = new GradeStub(true);
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.Replace(ServiceDescriptor.Singleton<IGradeImport>(imports))));
        using var client = factory.CreateClient();
        var user = TestSessionUsers.Register(Guid.NewGuid(), SystemRoles.Manager);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(user.Id));
        var response = await client.PostAsJsonAsync($"/api/v1/imports/{Guid.NewGuid()}/class-grade/apply", new ApplyGradeImportInput("fixture"));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, imports.ApplyCalls);
    }

    [Fact]
    public async Task Class_import_without_new_team_retains_the_managers_existing_authority()
    {
        var imports = new GradeStub(false);
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.Replace(ServiceDescriptor.Singleton<IGradeImport>(imports))));
        using var client = factory.CreateClient();
        var user = TestSessionUsers.Register(Guid.NewGuid(), SystemRoles.Manager);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(user.Id));
        var response = await client.PostAsJsonAsync($"/api/v1/imports/{Guid.NewGuid()}/class-grade/apply", new ApplyGradeImportInput("fixture"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, imports.ApplyCalls);
    }

    [Theory]
    [InlineData("passwordHash")]
    [InlineData("CanManageStaff")]
    [InlineData("userId")]
    [InlineData("roles")]
    public async Task Even_an_owner_cannot_inject_account_fields_through_the_grade_import(string field)
    {
        var imports = new GradeStub(true, field);
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.Replace(ServiceDescriptor.Singleton<IGradeImport>(imports))));
        using var client = factory.CreateClient();
        TestSessionUsers.Register(LongBeachWebApplicationFactory.StaffOwnerId, SystemRoles.Manager);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(LongBeachWebApplicationFactory.StaffOwnerId));
        var response = await client.PostAsJsonAsync($"/api/v1/imports/{Guid.NewGuid()}/class-grade/apply", new ApplyGradeImportInput("fixture"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, imports.ApplyCalls);
    }

    private static ClaimsPrincipal Principal(string[] menus, string[] actions)
    {
        var claims = new List<Claim> { new(ClaimTypes.Role, SystemRoles.Manager), new("staff_managed", "true") };
        claims.AddRange(SystemPermissions.All.Select(permission => new Claim("permission", permission)));
        claims.AddRange(menus.Select(menu => new Claim("staff_menu", menu)));
        claims.AddRange(actions.Select(action => new Claim("staff_action", action)));
        return new(new ClaimsIdentity(claims, "fixture"));
    }

    private static string Token(Guid id, Claim[]? extra = null)
    {
        Claim[] claims = [new("sub", id.ToString()), new(ClaimTypes.Role, SystemRoles.Manager), .. SystemPermissions.All.Select(p => new Claim("permission", p)), .. (extra ?? [])];
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", claims,
            DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256)));
    }

    private sealed class StaffStub : IStaffAccess
    {
        public int Calls { get; private set; }
        public Task<StaffAccessContext> ContextAsync(Guid actorId, CancellationToken ct = default) { Calls++; return Task.FromResult(new StaffAccessContext([], new([], []), [], [])); }
        public Task<StaffAccessTypeSummary[]> TypesAsync(Guid actorId, CancellationToken ct = default) { Calls++; return Task.FromResult(Array.Empty<StaffAccessTypeSummary>()); }
        public Task<StaffAccessTypeSummary> SaveTypeAsync(Guid actorId, string typeId, StaffAccessTypeInput input, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<StaffMemberAccessStatus> MemberAsync(Guid actorId, Guid teamId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<StaffMemberResult> SaveMemberAsync(Guid actorId, Guid teamId, StaffMemberInput input, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<StaffMemberResult> ResetAsync(Guid actorId, Guid teamId, StaffMemberCommand input, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<StaffMemberAccessStatus> BlockAsync(Guid actorId, Guid teamId, StaffMemberCommand input, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<StaffMemberAccessStatus> ReactivateAsync(Guid actorId, Guid teamId, StaffMemberCommand input, CancellationToken ct = default) => throw new NotSupportedException();
    }

    private sealed class GradeStub(bool team, string? injectedField = null) : IGradeImport
    {
        public int ApplyCalls { get; private set; }
        public Task<GradeImportPreview> Preview(Guid batchId, CancellationToken ct)
        {
            var fields = new Dictionary<string, object> { ["name"] = "Synthetic import" };
            if (injectedField is not null) fields[injectedField] = "rejected-value";
            return Task.FromResult(new GradeImportPreview(batchId, "synthetic.json", false, "fixture",
                [new(team ? "team" : "classes", Guid.NewGuid(), "Synthetic import", "Synthetic", 1, System.Text.Json.JsonSerializer.SerializeToElement(fields), null)]));
        }
        public async Task<GradeImportPreview> Apply(Guid batchId, string confirmationToken, CancellationToken ct)
        { ApplyCalls++; return (await Preview(batchId, ct)) with { Applied = true }; }
    }
}
