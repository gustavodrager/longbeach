using System.Security.Claims;
using System.Text.Json;
using LongBeach.Application.Inventory;
using LongBeach.Application.Operations;
using LongBeach.Contracts.Inventory;
using LongBeach.Domain.Identity;

namespace LongBeach.Api.Endpoints;

public static class MaterialEndpoints
{
    public static IEndpointRouteBuilder MapMaterialEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/materials").WithTags("Materials").RequireAuthorization(SystemPermissions.InventoryRead);
        group.MapGet("/{id:guid}/movements", (Guid id, int? page, IMaterialStock stock, CancellationToken ct) => stock.History(id, page ?? 1, ct));
        group.MapPost("/{id:guid}/movements", async (Guid id, MaterialMovementInput input, HttpContext http, IMaterialStock stock, CancellationToken ct) =>
        {
            if (input.Kind == "Count" && !http.User.HasClaim("permission", SystemPermissions.InventoryAdjust)) return Results.Forbid();
            if (!Guid.TryParse(http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub"), out var actor)) return Results.Unauthorized();
            var result = await stock.Move(id, input, actor, ct);
            var visible = OperationalRecordAccess.VisiblePayload(result.Payload, "inventory", http.User.HasClaim("permission", SystemPermissions.FinanceRead));
            return Results.Ok(new { material = JsonSerializer.Deserialize<JsonElement>(visible), movement = result.Movement });
        }).RequireAuthorization(SystemPermissions.InventoryWrite);
        return endpoints;
    }
}
