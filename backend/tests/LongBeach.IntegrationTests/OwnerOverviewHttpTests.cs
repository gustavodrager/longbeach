using System.Net;
using System.Net.Http.Json;
using LongBeach.Application.Overview;
using LongBeach.Contracts.Overview;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class OwnerOverviewHttpTests
{
    [Theory]
    [InlineData("Manager")][InlineData("Operations")][InlineData("Teacher")][InlineData("Student")]
    public async Task Anonymous_and_non_owner_profiles_never_execute_the_overview_query(string role)
    {
        var stub = new OverviewStub(); var ownerId = Guid.NewGuid();
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["StaffAccess:OwnerUserIds:0"] = ownerId.ToString() }));
            builder.ConfigureServices(services => services.AddSingleton<IOwnerOverview>(stub));
        });
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/owner-overview?month=2026-11")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), [role]));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/owner-overview?month=2026-11")).StatusCode);
        Assert.Equal(0, stub.Calls);
    }

    [Fact]
    public async Task Owner_gets_the_aggregate_contract_without_private_payloads_or_cache_and_invalid_month_is_rejected()
    {
        var stub = new OverviewStub(); var ownerId = Guid.NewGuid();
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["StaffAccess:OwnerUserIds:0"] = ownerId.ToString() }));
            builder.ConfigureServices(services => services.AddSingleton<IOwnerOverview>(stub));
        });
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(ownerId, ["Manager"]));
        var response = await client.GetAsync("/api/v1/owner-overview?month=2026-10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.True(response.Headers.CacheControl?.NoStore);
        var result = await response.Content.ReadFromJsonAsync<OwnerOverviewResponse>();
        Assert.NotNull(result); Assert.Equal("2026-10", result.Month); Assert.Equal(7, result.Weekdays.Count);
        Assert.Equal("competence", result.Finance.School.Basis); Assert.Equal("due-date", result.Finance.OtherSchool.Basis);
        Assert.Equal("confirmation-date", result.Finance.Bar.Basis); Assert.Equal("event-date", result.Finance.BarLegacy.Basis);
        Assert.Equal(0, result.Finance.School.OverdueCents); Assert.Equal(0, result.Finance.OtherSchool.OverdueChargeCount);
        Assert.Null(result.Recurring.TargetMonthlyCents); Assert.Equal(210, result.Targets.WeeklyPlaces);
        var json = await response.Content.ReadAsStringAsync();
        foreach (var field in new[] { "customerId", "studentId", "userId", "password", "email", "phone", "pixText" }) Assert.DoesNotContain("\"" + field + "\"", json);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/owner-overview?month=2026-13")).StatusCode);
        Assert.Equal(HttpStatusCode.MethodNotAllowed, (await client.PostAsJsonAsync("/api/v1/owner-overview", new { })).StatusCode);
    }

    private sealed class OverviewStub : IOwnerOverview
    {
        public int Calls { get; private set; }
        public Task<OwnerOverviewResponse> Read(string? month, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(OwnerOverviewRules.Summarize(new([], [], [], [], []), month,
                new DateTimeOffset(2026, 11, 20, 12, 0, 0, TimeSpan.Zero)));
        }
    }
}
