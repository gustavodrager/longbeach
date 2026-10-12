using System.Security.Claims;
using LongBeach.Application.Billing;
using LongBeach.Contracts.Billing;
using LongBeach.Domain.Identity;
namespace LongBeach.Api.Endpoints;

public static class BillingEndpoints
{
    public static IEndpointRouteBuilder MapBillingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var me = endpoints.MapGroup("/api/v1/me/billing").RequireAuthorization().WithTags("Minhas contas");
        me.MapGet("/config", (IBilling s, CancellationToken ct) => s.Config(ct));
        me.MapGet("/accounts", (HttpContext h, IBilling s, CancellationToken ct) => s.Accounts(Actor(h), ct));
        me.MapGet("/accounts/{id:guid}", (Guid id, HttpContext h, IBilling s, CancellationToken ct) => s.Account(id, Actor(h), ct));
        me.MapPost("/accounts/{id:guid}/payments", (Guid id, PayAccountInput i, HttpContext h, IBilling s, CancellationToken ct) => s.Pay(id, i, Actor(h), true, ct));
        me.MapPost("/accounts/{id:guid}/payments/{paymentId:guid}/refresh", (Guid id, Guid paymentId, HttpContext h, IBilling s, CancellationToken ct) => s.Refresh(id, paymentId, Actor(h), true, ct));
        me.MapGet("/subscriptions", (HttpContext h, IBilling s, CancellationToken ct) => s.Subscriptions(Actor(h), ct));
        me.MapPost("/accounts/{id:guid}/subscriptions", (Guid id, SubscribeInput i, HttpContext h, IBilling s, CancellationToken ct) => s.Subscribe(id, i, Actor(h), ct));
        me.MapPost("/subscriptions/{id:guid}/cancel", (Guid id, CancelSubscriptionInput i, HttpContext h, IBilling s, CancellationToken ct) => s.Cancel(id, i, Actor(h), ct));
        var admin = endpoints.MapGroup("/api/v1/billing").RequireAuthorization(SystemPermissions.FinanceRead).WithTags("Recebimentos");
        admin.MapGet("/accounts", (IBilling s, CancellationToken ct) => s.Accounts(null, ct));
        admin.MapGet("/candidates", (IBilling s, CancellationToken ct) => s.Candidates(ct));
        admin.MapPost("/accounts", (AssignAccountInput i, HttpContext h, IBilling s, CancellationToken ct) => s.Assign(i, Actor(h), ct)).RequireAuthorization(SystemPermissions.FinanceWrite);
        admin.MapPost("/accounts/{id:guid}/payments", (Guid id, PayAccountInput i, HttpContext h, IBilling s, CancellationToken ct) => s.Pay(id, i, Actor(h), false, ct)).RequireAuthorization(SystemPermissions.FinanceWrite);
        admin.MapPost("/accounts/{id:guid}/payments/{paymentId:guid}/refresh", (Guid id, Guid paymentId, HttpContext h, IBilling s, CancellationToken ct) => s.Refresh(id, paymentId, Actor(h), false, ct));
        admin.MapPost("/accounts/{id:guid}/payments/{paymentId:guid}/refund", (Guid id, Guid paymentId, RefundInput i, HttpContext h, IBilling s, CancellationToken ct) => s.Refund(id, paymentId, i, Actor(h), ct)).RequireAuthorization(SystemPermissions.FinanceWrite);
        admin.MapGet("/settlements", (IBilling s, CancellationToken ct) => s.SettlementCandidates(ct));
        admin.MapPost("/accounts/{id:guid}/settlements", (Guid id, SettlementInput i, HttpContext h, IBilling s, CancellationToken ct) => s.Settle(id, i, Actor(h), ct)).RequireAuthorization(SystemPermissions.FinanceWrite);
        endpoints.MapPost("/api/v1/integrations/pagbank/subscriptions/webhook", async (HttpContext h, IBilling s, CancellationToken ct) =>
        {
            if (h.Request.ContentLength > 65536) return Results.StatusCode(413);
            using var output = new MemoryStream(); var buffer = new byte[8192]; int read; while ((read = await h.Request.Body.ReadAsync(buffer, ct)) > 0) { if (output.Length + read > 65536) return Results.StatusCode(413); output.Write(buffer, 0, read); }
            await s.SubscriptionWebhook(output.ToArray(), ct); return Results.Accepted();
        }).AllowAnonymous().RequireRateLimiting("public-demo-write");
        return endpoints;
    }
    private static Guid Actor(HttpContext h) => Guid.Parse(h.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? h.User.FindFirstValue("sub")!);
}
