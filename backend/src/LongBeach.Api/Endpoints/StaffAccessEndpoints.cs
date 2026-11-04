using System.Security.Claims;
using LongBeach.Application.Staff;
using LongBeach.Contracts.Staff;

namespace LongBeach.Api.Endpoints;

public static class StaffAccessEndpoints
{
    public const string OwnerPolicy = "StaffOwner";

    public static IEndpointRouteBuilder MapStaffAccessEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/staff-access").WithTags("Equipe · Acessos").RequireAuthorization(OwnerPolicy)
            .AddEndpointFilter(async (context, next) =>
            {
                context.HttpContext.Response.Headers.CacheControl = "no-store";
                context.HttpContext.Response.Headers.Pragma = "no-cache";
                try { return await next(context); }
                catch (ArgumentException)
                {
                    return Results.BadRequest(new { message = "Confira os dados da pessoa, o telefone de acesso e o usuário informado." });
                }
            });
        group.MapGet("/context", (HttpContext h, IStaffAccess service, CancellationToken ct) => service.ContextAsync(Actor(h), ct));
        group.MapGet("/types", (HttpContext h, IStaffAccess service, CancellationToken ct) => service.TypesAsync(Actor(h), ct));
        group.MapPut("/types/{typeId}", (string typeId, StaffAccessTypeInput input, HttpContext h, IStaffAccess service, CancellationToken ct) => service.SaveTypeAsync(Actor(h), typeId, input, ct)).RequireRateLimiting("public-demo-write");
        group.MapGet("/members/{teamId:guid}", (Guid teamId, HttpContext h, IStaffAccess service, CancellationToken ct) => service.MemberAsync(Actor(h), teamId, ct));
        group.MapPut("/members/{teamId:guid}", (Guid teamId, StaffMemberInput input, HttpContext h, IStaffAccess service, CancellationToken ct) => service.SaveMemberAsync(Actor(h), teamId, input, ct)).RequireRateLimiting("public-demo-write");
        group.MapPost("/members/{teamId:guid}/reset", (Guid teamId, StaffMemberCommand input, HttpContext h, IStaffAccess service, CancellationToken ct) => service.ResetAsync(Actor(h), teamId, input, ct)).RequireRateLimiting("public-demo-write");
        group.MapPost("/members/{teamId:guid}/block", (Guid teamId, StaffMemberCommand input, HttpContext h, IStaffAccess service, CancellationToken ct) => service.BlockAsync(Actor(h), teamId, input, ct)).RequireRateLimiting("public-demo-write");
        group.MapPost("/members/{teamId:guid}/reactivate", (Guid teamId, StaffMemberCommand input, HttpContext h, IStaffAccess service, CancellationToken ct) => service.ReactivateAsync(Actor(h), teamId, input, ct)).RequireRateLimiting("public-demo-write");
        return endpoints;
    }

    private static Guid Actor(HttpContext context) => Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
