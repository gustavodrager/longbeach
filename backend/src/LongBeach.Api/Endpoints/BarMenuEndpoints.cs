using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Identity;
namespace LongBeach.Api.Endpoints;
public static class BarMenuEndpoints
{
    public static IEndpointRouteBuilder MapBarMenuEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var admin = endpoints.MapGroup("/api/v1/bar/menu").RequireAuthorization(SystemPermissions.BarCatalogWrite).WithTags("Cardápio");
        admin.MapGet("", (IBarMenu s, CancellationToken ct) => s.Get(ct));
        admin.MapPut("", (MenuSaveInput input, IBarMenu s, CancellationToken ct) => Handle(() => s.Save(input, ct)));
        admin.MapPost("/publish", (MenuPublishInput input, IBarMenu s, CancellationToken ct) => Handle(() => s.Publish(input, ct)));
        endpoints.MapGet("/api/v1/menu/published", async (HttpContext h, IBarMenu s, CancellationToken ct) =>
        {
            h.Response.Headers.CacheControl = "no-store";
            return await s.Published(ct) is { } menu ? Results.Ok(menu) : (IResult)Results.NotFound();
        }).AllowAnonymous();
        return endpoints;
    }
    private static async Task<IResult> Handle(Func<Task<MenuManagement>> action)
    {
        try { return Results.Ok(await action()); }
        catch (MenuValidationException ex) { return Results.ValidationProblem(ex.Errors.ToDictionary(x => x.Key, x => x.Value)); }
        catch (MenuConcurrencyException ex) { return Results.Conflict(new { message = ex.Message }); }
    }
}
