using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LongBeach.Domain.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class PaymentVisibilityEndpointsTests
{
    [Theory]
    [InlineData("/api/v1/billing/accounts/11111111-1111-4111-8111-111111111111/settlements")]
    [InlineData("/api/v1/bar/payments/11111111-1111-4111-8111-111111111111/reconcile")]
    [InlineData("/api/v1/bar/tabs/11111111-1111-4111-8111-111111111111/payments/22222222-2222-4222-8222-222222222222/reconcile")]
    public async Task Removed_manual_matching_routes_cannot_mutate_even_for_management(string path)
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), [SystemRoles.Owner]));
        var response = await client.PostAsJsonAsync(path, new { operationId = Guid.NewGuid(), paymentId = Guid.NewGuid(), documentId = Guid.NewGuid(), fee = 3, net = 97, externalId = "historical-only", reason = "No manual matching" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Removed_matching_candidates_are_not_exposed()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ProfileAuthorizationTests.Token(Guid.NewGuid(), [SystemRoles.Owner]));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/v1/billing/settlements")).StatusCode);
    }

    [Fact]
    public void Payment_routes_keep_authorization_and_use_financial_access_instead_of_matching_permissions()
    {
        using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var routes = factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>().ToArray();
        foreach (var path in new[] { "/api/v1/bar/payments", "/api/v1/bar/payments/{id:guid}/refresh" })
        {
            var route = Assert.Single(routes, e => e.RoutePattern.RawText == path);
            Assert.Contains(route.Metadata.GetOrderedMetadata<IAuthorizeData>(), p => p.Policy == SystemPermissions.BarFinanceRead);
        }
        foreach (var path in new[]
        {
            "/api/v1/billing/accounts/{id:guid}/payments",
            "/api/v1/billing/accounts/{id:guid}/payments/{paymentId:guid}/refresh",
            "/api/v1/billing/accounts/{id:guid}/payments/{paymentId:guid}/refund",
            "/api/v1/me/billing/accounts/{id:guid}/subscriptions",
            "/api/v1/bar/tabs/{id:guid}/payments/{paymentId:guid}/refresh",
            "/api/v1/bar/tabs/{id:guid}/payments/{paymentId:guid}/refund"
        })
        {
            var route = Assert.Single(routes, e => e.RoutePattern.RawText == path);
            Assert.NotEmpty(route.Metadata.GetOrderedMetadata<IAuthorizeData>());
        }
        Assert.DoesNotContain("bar:payments:reconcile", SystemPermissions.All);
        Assert.DoesNotContain("bar:payments:reconcile", ProfileAccess.Permissions([SystemRoles.BarFinance], ["bar:payments:reconcile", SystemPermissions.BarFinanceRead]));
    }
}
