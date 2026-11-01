using System.Security.Claims;
using LongBeach.Application.Messaging;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Identity;

namespace LongBeach.Api.Endpoints;

public static class MessagingContextEndpoints
{
    public static IEndpointRouteBuilder MapMessagingContextEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/v1/messaging/capabilities", (IMessagingAi ai, IConfiguration config) => new
        {
            AiConfigured = ai.Configured,
            DispatchEnabled = config.GetValue("Messaging:Enabled", false) && config.GetValue("BackgroundJobs:Enabled", true)
        }).RequireAuthorization("messaging:read");
        var group = endpoints.MapGroup("/api/v1/messaging/conversations").RequireAuthorization("messaging:read").WithTags("WhatsApp · Contexto");
        group.MapGet("/{id:guid}/context", (Guid id, HttpContext http, IMessagingContext service, CancellationToken ct) =>
            service.GetAsync(id, http.User.HasClaim("permission", SystemPermissions.BarSalesRead), ct));
        group.MapPost("/{id:guid}/confirmations", (Guid id, SaveMessagingConfirmationInput input, IMessagingContext service, CancellationToken ct) => service.ConfirmAsync(id, input, ct))
            .RequireAuthorization("messaging:operate");
        group.MapPost("/{id:guid}/bar-statement", (Guid id, SendMessagingBarStatementInput input, HttpContext http, IMessagingContext service, CancellationToken ct) =>
            service.SendBarStatementAsync(id, input, Guid.Parse(http.User.FindFirstValue(ClaimTypes.NameIdentifier)!), ct))
            .RequireAuthorization("messaging:operate").RequireAuthorization(SystemPermissions.BarSalesRead);
        return endpoints;
    }
}
