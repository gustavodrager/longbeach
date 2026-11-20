using LongBeach.Application.Overview;

namespace LongBeach.Api.Endpoints;

public static class OwnerOverviewEndpoints
{
    public static IEndpointRouteBuilder MapOwnerOverviewEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/v1/owner-overview", (string? month, IOwnerOverview service, CancellationToken ct) => service.Read(month, ct))
            .WithTags("Visão geral dos donos")
            .RequireAuthorization(StaffAccessEndpoints.OwnerPolicy);
        return endpoints;
    }
}
