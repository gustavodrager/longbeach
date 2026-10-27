using System.Security.Claims;
using LongBeach.Application.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Identity;
namespace LongBeach.Api.Endpoints;
public static class BarEndpoints
{
    public static IEndpointRouteBuilder MapBarEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var bar = endpoints.MapGroup("/api/v1/bar").WithTags("Bar").RequireAuthorization();
        bar.MapGet("/catalog", (IBarCatalog service, CancellationToken ct) => service.Catalog(ct)).RequireAuthorization(SystemPermissions.BarCatalogRead);
        bar.MapGet("/categories", (IBarCatalog service, CancellationToken ct) => service.Categories(ct)).RequireAuthorization(SystemPermissions.BarCatalogRead);
        bar.MapPost("/categories", (CategoryInput input, IBarCatalog service, CancellationToken ct) => service.CreateCategory(input, ct)).RequireAuthorization(SystemPermissions.BarCatalogWrite);
        bar.MapGet("/products", (IBarCatalog service, CancellationToken ct) => service.Products(ct)).RequireAuthorization(SystemPermissions.BarCatalogWrite);
        bar.MapPost("/products", (ProductInput input, IBarCatalog service, CancellationToken ct) => service.SaveProduct(null, input, ct)).RequireAuthorization(SystemPermissions.BarCatalogWrite);
        bar.MapPut("/products/{id:guid}", (Guid id, ProductInput input, IBarCatalog service, CancellationToken ct) => service.SaveProduct(id, input, ct)).RequireAuthorization(SystemPermissions.BarCatalogWrite);
        bar.MapPut("/products/{id:guid}/stock", (Guid id, ProductStockInput input, HttpContext h, IBarCatalog service, CancellationToken ct) => service.SaveProductStock(id,input,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarCatalogWrite, SystemPermissions.BarSupervise);
        bar.MapGet("/stock/locations", (IBarStock s, CancellationToken ct) => s.Locations(ct)).RequireAuthorization(SystemPermissions.BarStockRead);
        bar.MapPost("/stock/locations", (LocationInput i, IBarStock s, CancellationToken ct) => s.CreateLocation(i,ct)).RequireAuthorization(SystemPermissions.BarStockManage);
        bar.MapGet("/stock/balances", (HttpContext h, IBarStock s, CancellationToken ct) => s.Balances(Costs(h),ct)).RequireAuthorization(SystemPermissions.BarStockRead);
        bar.MapPut("/stock/available", async (AvailableStockInput i, HttpContext h, IBarStock s, CancellationToken ct) => { await s.SetAvailable(i,Actor(h),ct); return Results.NoContent(); }).RequireAuthorization(SystemPermissions.BarSupervise);
        bar.MapGet("/stock/movements", (HttpContext h, IBarStock s, CancellationToken ct) => s.Movements(Costs(h),ct)).RequireAuthorization(SystemPermissions.BarStockRead);
        bar.MapGet("/stock/movement-history", (Guid? locationId, string? search, string? kind, DateOnly? from, DateOnly? to, int? page, IBarStock s, CancellationToken ct) => s.MovementHistory(locationId,search,kind,from,to,page ?? 1,ct)).RequireAuthorization(SystemPermissions.BarStockRead);
        bar.MapGet("/stock/valuation", (IBarStock s, CancellationToken ct) => s.Valuation(ct)).RequireAuthorization(SystemPermissions.BarFinanceRead);
        bar.MapPost("/stock/transfers", async (TransferInput i, HttpContext h, IBarStock s, CancellationToken ct) => { await s.Transfer(i,Actor(h),ct); return Results.NoContent(); }).RequireAuthorization(SystemPermissions.BarStockManage);
        bar.MapPost("/stock/losses", async (StockOutputInput i, HttpContext h, IBarStock s, CancellationToken ct) => { await s.Output(i,"Loss",Actor(h),Has(h,SystemPermissions.BarSupervise),ct); return Results.NoContent(); }).RequireAuthorization(SystemPermissions.BarStockOutput);
        bar.MapPost("/stock/internal-consumption", async (StockOutputInput i, HttpContext h, IBarStock s, CancellationToken ct) => { await s.Output(i,"InternalConsumption",Actor(h),Has(h,SystemPermissions.BarSupervise),ct); return Results.NoContent(); }).RequireAuthorization(SystemPermissions.BarStockOutput);
        bar.MapGet("/counts", (IBarStock s, CancellationToken ct) => s.Counts(ct)).RequireAuthorization(SystemPermissions.BarStockManage);
        bar.MapPost("/counts", (CountInput i, HttpContext h, IBarStock s, CancellationToken ct) => s.CreateCount(i,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarStockManage);
        bar.MapPut("/counts/{id:guid}/items", (Guid id, CountItemInput i, IBarStock s, CancellationToken ct) => s.Count(id,i,ct)).RequireAuthorization(SystemPermissions.BarStockManage);
        bar.MapPost("/counts/{id:guid}/cancel",(Guid id,ApprovalInput i,IBarStock s,CancellationToken ct)=>s.CancelCount(id,i.Reason,ct)).RequireAuthorization(SystemPermissions.BarStockManage);
        bar.MapPost("/counts/{id:guid}/approve", (Guid id, InventoryApprovalInput i, HttpContext h, IBarStock s, CancellationToken ct) => s.Approve(id,i.Reason,Actor(h),ct,i.ZeroUncounted)).RequireAuthorization(SystemPermissions.BarSupervise);
        bar.MapGet("/cash/history", (string? search, string? state, int? page, IBarCash s, CancellationToken ct) => s.History(search,state,page ?? 1,ct)).RequireAuthorization(SystemPermissions.BarSupervise);
        bar.MapGet("/cash/sessions/{id:guid}/details", (Guid id, IBarCash s, CancellationToken ct) => s.Details(id,ct)).RequireAuthorization(SystemPermissions.BarSupervise);
        bar.MapGet("/cash/current", async (IBarCash s, CancellationToken ct) =>
        {
            var current = await s.Current(ct);
            return current is null
                ? (IResult)Results.Text("null", "application/json", statusCode: StatusCodes.Status200OK)
                : Results.Json(current);
        }).RequireAuthorization(SystemPermissions.BarCashOperate);
        bar.MapGet("/cash/registers", (IBarCash s, CancellationToken ct) => s.Registers(ct)).RequireAuthorization(SystemPermissions.BarCashOperate);
        bar.MapPost("/cash/registers", (LocationInput i, IBarCash s, CancellationToken ct) => s.CreateRegister(i.Name,ct)).RequireAuthorization(SystemPermissions.BarSupervise);
        bar.MapGet("/cash/sessions", (HttpContext h, IBarCash s, CancellationToken ct) => s.Sessions(Actor(h),Has(h,SystemPermissions.BarSupervise)||Has(h,SystemPermissions.BarFinanceRead),ct)).RequireAuthorization(SystemPermissions.BarCashOperate);
        bar.MapPost("/cash/sessions", (OpenCashInput i, HttpContext h, IBarCash s, CancellationToken ct) => s.Open(i,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarCashOperate);
        foreach (var action in new[] { ("supply", "Supply"), ("withdraw", "Withdraw"), ("expense", "Expense") })
        {
            var kind = action.Item2;
            bar.MapPost($"/cash/sessions/{{id:guid}}/{action.Item1}", (Guid id, CashMovementInput i, HttpContext h, IBarCash s, CancellationToken ct) => s.Move(id,i,kind,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarCashOperate);
        }
        bar.MapPost("/cash/sessions/{id:guid}/close", (Guid id, CloseCashInput i, HttpContext h, IBarCash s, CancellationToken ct) => s.Close(id,i,Actor(h),Has(h,SystemPermissions.BarSupervise),ct)).RequireAuthorization(SystemPermissions.BarCashOperate);
        bar.MapPost("/cash/sessions/{id:guid}/reopen", (Guid id, ApprovalInput i, HttpContext h, IBarCash s, CancellationToken ct) => s.Reopen(id,i.Reason,Actor(h),i.OperationId,ct)).RequireAuthorization(SystemPermissions.BarSupervise);
        bar.MapGet("/sales", (HttpContext h, IBarSales s, CancellationToken ct) => s.List(Actor(h),Has(h,SystemPermissions.BarSupervise)||Has(h,SystemPermissions.BarFinanceRead),Costs(h),ct)).RequireAuthorization(SystemPermissions.BarSalesRead);
        bar.MapPost("/sales", (SaleInput i, HttpContext h, IBarSales s, CancellationToken ct) => s.Create(i,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        foreach (var action in new[] { ("cash", "Cash"), ("card-manual", "CardManual") })
        {
            var method = action.Item2;
            bar.MapPost($"/sales/{{id:guid}}/payments/{action.Item1}", (Guid id, ManualPaymentInput i, HttpContext h, IBarSales s, CancellationToken ct) => s.Pay(id,i,method,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        }
        bar.MapPost("/sales/{id:guid}/discount",(Guid id,DiscountInput i,HttpContext h,IBarSales s,CancellationToken ct)=>s.Discount(id,i,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarSupervise);
        bar.MapPost("/sales/{id:guid}/courtesy", (Guid id, ApprovalInput i, HttpContext h, IBarSales s, CancellationToken ct) => s.Courtesy(id,i.Reason,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarSupervise);
        bar.MapPost("/sales/{id:guid}/cancel", async (Guid id, ApprovalInput i, HttpContext h, IBarSales s, CancellationToken ct) => { await s.Cancel(id,i.Reason,Actor(h),ct); return Results.Ok(new {canceled=true}); }).RequireAuthorization(SystemPermissions.BarSalesOperate);
        bar.MapPost("/sales/{id:guid}/refund", async (Guid id, RefundInput i, HttpContext h, IBarSales s, CancellationToken ct) => { await s.Refund(id,i,Actor(h),ct); return Results.NoContent(); }).RequireAuthorization(SystemPermissions.BarRefundApprove);
        bar.MapGet("/suppliers", (IBarPurchases s, CancellationToken ct) => s.Suppliers(ct)).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        bar.MapPost("/suppliers", (LocationInput i,IBarPurchases s,CancellationToken ct)=>s.CreateSupplier(i.Name,ct)).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        bar.MapGet("/purchases/products", (IBarPurchases s,CancellationToken ct)=>s.Products(ct)).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        bar.MapGet("/purchases/history", (string? search,string? state,string? document,int? page,IBarPurchases s,CancellationToken ct)=>s.History(search,state,document,page??1,ct)).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        bar.MapGet("/purchases", (string? document,IBarPurchases s,CancellationToken ct)=>s.Purchases(ct,document)).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        bar.MapGet("/purchases/{id:guid}", async (Guid id,IBarPurchases s,CancellationToken ct)=>await s.Find(id,ct) is { } purchase ? Results.Ok(purchase) : Results.NotFound()).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        bar.MapPost("/purchases", (PurchaseInput i,HttpContext h,IBarPurchases s,CancellationToken ct)=>s.Create(i,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        bar.MapPost("/purchases/{id:guid}/payment-reference", (Guid id,PurchasePaymentReferenceInput i,IBarPurchases s,CancellationToken ct)=>s.CorrectPaymentReference(id,i,ct)).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        bar.MapPost("/purchases/{id:guid}/cancel",(Guid id,ApprovalInput i,HttpContext h,IBarPurchases s,CancellationToken ct)=>s.Cancel(id,i.Reason,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        bar.MapPost("/purchases/{id:guid}/receive", (Guid id,ReceiptInput i,HttpContext h,IBarPurchases s,CancellationToken ct)=>s.Receive(id,i,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        bar.MapGet("/payments/config", async (IPaymentGateway s,CancellationToken ct)=> new {pixEnabled=s.Enabled,cardEnabled=s.CardEnabled,cardPublicKey=await s.CardPublicKey(ct)}).RequireAuthorization(SystemPermissions.BarSalesOperate);
        bar.MapPost("/sales/{id:guid}/payments/pix", (Guid id,PixInput i,HttpContext h,IBarPayments s,CancellationToken ct)=>s.Pix(id,i,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        bar.MapGet("/sales/{id:guid}/payments",(Guid id,HttpContext h,IBarPayments s,CancellationToken ct)=>s.OwnPayment(id,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarSalesRead);
        bar.MapPost("/sales/{id:guid}/payments/pix/refresh",(Guid id,HttpContext h,IBarPayments s,CancellationToken ct)=>s.OperatorRefresh(id,Actor(h),ct)).RequireAuthorization(SystemPermissions.BarSalesOperate);
        bar.MapGet("/payments", (IBarPayments s,CancellationToken ct)=>s.Payments(ct)).RequireAuthorization(SystemPermissions.BarFinanceRead);
        bar.MapPost("/payments/{id:guid}/refresh", (Guid id,IBarPayments s,CancellationToken ct)=>s.Refresh(id,ct)).RequireAuthorization(SystemPermissions.BarFinanceRead);
        bar.MapGet("/dashboard", (DateTimeOffset? fromUtc,DateTimeOffset? toUtc,IBarPayments s,CancellationToken ct)=>s.Dashboard(fromUtc,toUtc,ct)).RequireAuthorization(SystemPermissions.BarFinanceRead);
        endpoints.MapPost("/api/v1/integrations/pagbank/webhook", async (HttpContext h,IBarPayments s,LongBeach.Application.Billing.IBilling billing,CancellationToken ct)=>
        {
            if(h.Request.ContentLength > 65536) return Results.StatusCode(413);
            using var body = new MemoryStream(); var buffer = new byte[4096]; int read;
            while((read=await h.Request.Body.ReadAsync(buffer,ct))>0) { if(body.Length+read>65536) return Results.StatusCode(413); await body.WriteAsync(buffer.AsMemory(0,read),ct); }
            var signatures = h.Request.Headers["x-payload-signature"].Select(x => x ?? "").ToArray();
            var accepted = await billing.Webhook(body.ToArray(), signatures, ct) || await s.Webhook(body.ToArray(), signatures, ct);
            var refreshedFromHint = false;
            if (!accepted && signatures.All(string.IsNullOrWhiteSpace) && !h.Request.Headers.ContainsKey("x-authenticity-token") &&
                LongBeach.Infrastructure.Bootstrap.PagBankHomologation.AllowsNotificationHints(
                    h.RequestServices.GetRequiredService<IConfiguration>(), h.RequestServices.GetRequiredService<IHostEnvironment>()))
            {
                try
                {
                    using var notification = System.Text.Json.JsonDocument.Parse(body.ToArray());
                    if (notification.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object &&
                        notification.RootElement.TryGetProperty("id", out var id) && id.ValueKind == System.Text.Json.JsonValueKind.String &&
                        id.GetString() is { } order && System.Text.RegularExpressions.Regex.IsMatch(order, "^ORDE_[A-Za-z0-9-]{1,80}$"))
                        refreshedFromHint = await billing.RefreshNotificationHint(order, ct) || await s.RefreshNotificationHint(order, ct);
                }
                catch (System.Text.Json.JsonException) { /* Untrusted malformed hints remain unauthorized. */ }
            }
            // Diagnostic metadata only: never log payloads, signatures or credentials.
            h.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("PagBankWebhook")
                .LogInformation("PagBank webhook accepted={Accepted} refreshedFromHint={RefreshedFromHint} payloadSignaturePresent={PayloadSignaturePresent} legacySignaturePresent={LegacySignaturePresent} bodyBytes={BodyBytes}",
                    accepted, refreshedFromHint, signatures.Any(x => !string.IsNullOrWhiteSpace(x)), h.Request.Headers.ContainsKey("x-authenticity-token"), body.Length);
            return accepted ? Results.Ok() : refreshedFromHint ? Results.Accepted() : Results.Unauthorized();
        }).AllowAnonymous().RequireRateLimiting("public-demo-write");
        return endpoints;
    }
    private static Guid Actor(HttpContext h) => Guid.TryParse(h.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? h.User.FindFirstValue("sub"), out var id) ? id : throw new BarRuleException("Sessão sem operador válido.");
    private static bool Has(HttpContext h, string p) => h.User.HasClaim("permission",p);
    private static bool Costs(HttpContext h) => Has(h,SystemPermissions.BarFinanceRead) || Has(h,SystemPermissions.BarCatalogWrite);
}
