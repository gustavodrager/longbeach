using System.Security.Claims;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Identity;

namespace LongBeach.Api.Endpoints;

public static class BarTabsEndpoints
{
    public static IEndpointRouteBuilder MapBarTabsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var recipes = endpoints.MapGroup("/api/v1/bar/recipes").WithTags("Bar · Fichas técnicas").RequireAuthorization(SystemPermissions.BarCatalogWrite);
        recipes.MapGet("", (Guid? productId, int? page, int? pageSize, IBarTabs s, CancellationToken ct) => s.Recipes(productId, page ?? 1, pageSize ?? 20, ct));
        recipes.MapGet("/{recipeId:guid}", (Guid recipeId, IBarTabs s, CancellationToken ct) => s.Recipe(recipeId, ct));
        recipes.MapPost("", (SaveRecipeInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.SaveRecipe(i, Actor(h), ct));
        var tabs = endpoints.MapGroup("/api/v1/bar/tabs").WithTags("Bar · Comandas").RequireAuthorization();
        tabs.MapGet("", (string? state, string? search, int? page, int? pageSize, HttpContext h, IBarTabs s, CancellationToken ct) => s.List(state, search, page ?? 1, pageSize ?? 30, Costs(h), ct, Has(h,SystemPermissions.BarSupervise))).RequireAuthorization(SystemPermissions.BarSalesRead);
        tabs.MapPost("", (OpenTabInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.Open(i, Actor(h), ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        tabs.MapGet("/locations", (IBarTabs s, CancellationToken ct) => s.Locations(ct)).RequireAuthorization(SystemPermissions.BarSalesRead);
        tabs.MapGet("/catalog", async (Guid? locationId, HttpContext h, IBarTabs s, IBarCash cash, CancellationToken ct) =>
        {
            var location = locationId ?? (await cash.Sessions(Actor(h), false, ct)).FirstOrDefault(x => x.State is "Open" or "Reopened")?.LocationId;
            if (location is null) throw new BarRuleException("Selecione um local ou abra seu caixa para ver o catálogo.");
            return await s.Catalog(location.Value, ct);
        }).RequireAuthorization(SystemPermissions.BarCatalogRead);
        tabs.MapGet("/config", (IBarTabs s) => new { pixEnabled = s.PixEnabled }).RequireAuthorization(SystemPermissions.BarSalesOperate);
        tabs.MapGet("/reports/{metric}", (string metric, DateTimeOffset? fromUtc, DateTimeOffset? toUtc, int? page, int? pageSize, IBarTabs s, CancellationToken ct) => s.Report(metric, fromUtc, toUtc, page ?? 1, pageSize ?? 20, ct)).RequireAuthorization(SystemPermissions.BarFinanceRead);
        tabs.MapGet("/payments/{paymentId:guid}", (Guid paymentId, IBarTabs s, CancellationToken ct) => s.PaymentTab(paymentId, ct)).RequireAuthorization(SystemPermissions.BarFinanceRead);
        tabs.MapGet("/resources/{kind}/{id:guid}", (string kind, Guid id, int? page, int? pageSize, IBarTabs s, CancellationToken ct) => s.Source(kind, id, page ?? 1, pageSize ?? 20, ct)).RequireAuthorization(SystemPermissions.BarFinanceRead);
        tabs.MapGet("/{id:guid}", (Guid id, HttpContext h, IBarTabs s, CancellationToken ct) => s.Get(id, Costs(h), ct, Has(h,SystemPermissions.BarSupervise))).RequireAuthorization(SystemPermissions.BarSalesRead);
        tabs.MapPost("/{id:guid}/items", (Guid id, AddTabItemsInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.Add(id, i, Actor(h), null, ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        foreach (var action in new[] { "accept", "reject", "fulfill", "reverse" })
        {
            var current = action;
            tabs.MapPost($"/{{id:guid}}/items/{{itemId:guid}}/{current}", (Guid id, Guid itemId, TabActionInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.ItemAction(id, itemId, current, i, Actor(h), Has(h, SystemPermissions.BarSupervise), ct))
                .RequireAuthorization(current == "reverse" ? SystemPermissions.BarSupervise : SystemPermissions.BarSalesOperate);
        }
        tabs.MapPost("/{id:guid}/payments", (Guid id, TabPaymentInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.Pay(id, i, Actor(h), null, ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        tabs.MapPost("/{id:guid}/payments/{paymentId:guid}/refresh", (Guid id, Guid paymentId, HttpContext h, IBarTabs s, CancellationToken ct) => s.Refresh(id, paymentId, Actor(h), null, ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        tabs.MapPost("/{id:guid}/payments/{paymentId:guid}/refund", (Guid id, Guid paymentId, TabRefundInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.Refund(id, paymentId, i, Actor(h), ct)).RequireAuthorization(SystemPermissions.BarRefundApprove);
        tabs.MapPost("/{id:guid}/adjustments", (Guid id, TabAdjustmentInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.Adjust(id, i, Actor(h), ct)).RequireAuthorization(SystemPermissions.BarSupervise);
        tabs.MapPost("/{id:guid}/payments/{paymentId:guid}/reconcile", (Guid id, Guid paymentId, TabReconcileInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.Reconcile(id, paymentId, i, Actor(h), ct)).RequireAuthorization(SystemPermissions.BarReconcile);
        tabs.MapPost("/{id:guid}/close", (Guid id, TabActionInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.Close(id, i, Actor(h), ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        tabs.MapPost("/{id:guid}/access", (Guid id, TabAccessInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.IssueAccess(id, i, Actor(h), ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        tabs.MapPost("/{id:guid}/access/revoke", (Guid id, TabActionInput i, HttpContext h, IBarTabs s, CancellationToken ct) => s.RevokeAccess(id, i, Actor(h), ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        endpoints.MapGet("/api/v1/bar/cash/locations", (IBarTabs s, CancellationToken ct) => s.Locations(ct)).RequireAuthorization(SystemPermissions.BarCashOperate);

        var client = endpoints.MapGroup("/api/v1/bar/client").WithTags("Bar · Cliente").AllowAnonymous().RequireRateLimiting("public-demo-write");
        client.MapGet("", (HttpContext h, IBarTabs s, CancellationToken ct) => s.Client(Token(h), ct));
        client.MapGet("/catalog", (HttpContext h, IBarTabs s, CancellationToken ct) => s.ClientCatalog(Token(h), ct));
        client.MapGet("/config", async (HttpContext h, IBarTabs s, CancellationToken ct) => { await s.Client(Token(h), ct); return new { pixEnabled = s.PixEnabled }; });
        client.MapPost("/items", async (HttpContext h, AddTabItemsInput i, IBarTabs s, CancellationToken ct) => { var tab = await s.Client(Token(h), ct); return await s.Add(tab.Id, i, null, Token(h), ct); });
        client.MapPost("/payments", async (HttpContext h, TabPaymentInput i, IBarTabs s, CancellationToken ct) => { var tab = await s.Client(Token(h), ct); return await s.Pay(tab.Id, i, null, Token(h), ct); });
        client.MapPost("/payments/{paymentId:guid}/refresh", async (HttpContext h, Guid paymentId, IBarTabs s, CancellationToken ct) => { var tab = await s.Client(Token(h), ct); return await s.Refresh(tab.Id, paymentId, null, Token(h), ct); });
        return endpoints;
    }
    private static string Token(HttpContext h) => h.Request.Headers["X-LongBeach-Tab"].ToString();
    private static Guid Actor(HttpContext h) => Guid.TryParse(h.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? h.User.FindFirstValue("sub"), out var id) && id != Guid.Empty ? id : throw new BarRuleException("Sessão sem operador válido.");
    private static bool Has(HttpContext h, string permission) => h.User.HasClaim("permission", permission);
    private static bool Costs(HttpContext h) => Has(h, SystemPermissions.BarFinanceRead) || Has(h, SystemPermissions.BarCatalogWrite);
}
