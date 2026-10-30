using System.Net;
using System.Net.Http.Json;
using LongBeach.Contracts.Auth;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class CurrentSessionPostgresTests
{
    [PostgresFact]
    public async Task Persisted_profile_change_and_blocking_take_effect_on_the_same_access_token()
    {
        await using var factory = OperationalPostgresTests.Factory();
        using var client = factory.CreateClient();
        await OperationalPostgresTests.Migrate(factory);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        async Task<Role> Role(string name) => await db.Roles.SingleOrDefaultAsync(r => r.Name == name) ?? new Role(name);
        var manager = await Role("Manager");
        var teacher = await Role("Teacher");
        var user = User.Create("Session fixture", $"{Guid.NewGuid():N}@example.test", "fixture-hash");
        user.AssignRole(manager);
        db.Users.Add(user); await db.SaveChangesAsync();
        client.DefaultRequestHeaders.Authorization = new("Bearer", ProfileAuthorizationTests.Token(user.Id, ["Manager"], registerUser: false));
        Assert.Contains("finance:write", (await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me"))!.Permissions);

        user.SetRole(teacher); await db.SaveChangesAsync();
        var current = await client.GetFromJsonAsync<UserSummary>("/api/v1/auth/me");
        Assert.Equal(new[] { "Teacher" }, current!.Roles);
        Assert.Empty(current.Permissions);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/billing/accounts")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/operations/students")).StatusCode);

        user.Deactivate(); await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        user.Activate(); await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        db.Users.Remove(user); await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }
}
