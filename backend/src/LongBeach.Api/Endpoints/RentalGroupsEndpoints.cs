using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using LongBeach.Application.Operations;
using LongBeach.Contracts.Operations;
using LongBeach.Domain.Identity;
namespace LongBeach.Api.Endpoints;

public static class RentalGroupsEndpoints
{
    public static IEndpointRouteBuilder MapRentalGroupsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var groups = endpoints.MapGroup("/api/v1/rentals/groups/{groupId:guid}").WithTags("Mensalistas").RequireAuthorization(Access(SystemPermissions.ProjectsRead));
        groups.MapGet("/months/{month}/preview", async (Guid groupId, string month, IRentalGroups service, HttpContext http, CancellationToken ct) => await Guard(async () =>
        {
            var preview = await service.Preview(groupId, month, ct);
            return Results.Ok(Finance(http, false) ? preview : preview with { Amount = null });
        }));
        groups.MapPost("/months", async (Guid groupId, RentalMonthInput input, IRentalGroups service, HttpContext http, CancellationToken ct) => await Guard(async () =>
        {
            if (input.CreateCharge && !Finance(http, true)) return Results.Forbid();
            var saved = await service.Generate(groupId, input, ct);
            return Results.Content(OperationalRecordAccess.VisiblePayload(saved.GetRawText(), "rentalMonths", Finance(http, false)), "application/json");
        })).RequireAuthorization(Access(SystemPermissions.ProjectsWrite));
        groups.MapGet("/bar", async (Guid groupId, string month, IRentalGroups service, CancellationToken ct) => await Guard(async () => Results.Ok(await service.Bar(groupId, month, ct)))).RequireAuthorization(Access(SystemPermissions.BarFinanceRead));
        groups.MapPut("/bar/{tabId:guid}", async (Guid groupId, Guid tabId, RentalBarLinkInput input, IRentalGroups service, CancellationToken ct) => await Guard(async () => { await service.LinkBar(groupId, tabId, input, ct); return Results.NoContent(); })).RequireAuthorization(Access(SystemPermissions.ProjectsWrite, SystemPermissions.BarSalesOperate));
        groups.MapDelete("/bar/{tabId:guid}", async (Guid groupId, Guid tabId, int version, IRentalGroups service, CancellationToken ct) => await Guard(async () => { await service.UnlinkBar(groupId, tabId, version, ct); return Results.NoContent(); })).RequireAuthorization(Access(SystemPermissions.ProjectsWrite, SystemPermissions.BarSalesOperate));
        return endpoints;
    }
    private static AuthorizationPolicy Access(params string[] permissions) => new AuthorizationPolicyBuilder().RequireAuthenticatedUser().RequireAssertion(context =>
        !(context.User.IsInRole(SystemRoles.Student) && !context.User.FindAll(ClaimTypes.Role).Any(c => c.Value != SystemRoles.Student)) &&
        (context.User.IsInRole(SystemRoles.Owner) || permissions.All(p => context.User.HasClaim("permission", p)))).Build();
    private static bool Finance(HttpContext http, bool write) => http.User.IsInRole(SystemRoles.Owner) || http.User.HasClaim("permission", SystemPermissions.FinanceRead) && (!write || http.User.HasClaim("permission", SystemPermissions.FinanceWrite));
    private static async Task<IResult> Guard(Func<Task<IResult>> action)
    { try { return await action(); } catch (RentalRuleException error) { return Results.Json(new { message = error.Message }, statusCode: error.Conflict ? 409 : 400); } }
}
