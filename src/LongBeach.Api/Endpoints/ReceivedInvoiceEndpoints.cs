using System.Security.Claims;
using LongBeach.Application.Fiscal;
using LongBeach.Contracts.Fiscal;
using LongBeach.Domain.Identity;
using Microsoft.AspNetCore.Mvc;
namespace LongBeach.Api.Endpoints;
public static class ReceivedInvoiceEndpoints
{
    public static IEndpointRouteBuilder MapReceivedInvoiceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/received-invoices").WithTags("Received invoices")
            .RequireAuthorization(SystemPermissions.ReceivedInvoicesManage)
            .AddEndpointFilter(async (context, next) => context.HttpContext.User.HasClaim("requires_first_access", "true")
                ? Results.Forbid() : await next(context));
        group.MapPost("/preview", (InvoiceUpload input, IReceivedInvoices service) => service.Preview(input))
            .WithMetadata(new RequestSizeLimitAttribute(3_000_000));
        group.MapPost("/", (InvoiceUpload input, HttpContext context, IReceivedInvoices service, CancellationToken ct) => service.Import(input, Actor(context), ct))
            .WithMetadata(new RequestSizeLimitAttribute(3_000_000));
        group.MapGet("/choices", (IReceivedInvoices service, CancellationToken ct) => service.Choices(ct)).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        group.MapGet("/", (int? page, string? purpose, IReceivedInvoices service, CancellationToken ct) => service.List(page ?? 1, ct, purpose));
        group.MapGet("/{id:guid}", (Guid id, IReceivedInvoices service, CancellationToken ct) => service.Detail(id, ct));
        group.MapPost("/{id:guid}/classification", (Guid id, InvoiceClassificationInput input, IReceivedInvoices service, CancellationToken ct) => service.Classify(id, input, ct));
        group.MapGet("/{id:guid}/original", async (Guid id, IReceivedInvoices service, CancellationToken ct) =>
        { var original = await service.Original(id, ct); return Results.Ok(new { original.FileName, ContentBase64 = Convert.ToBase64String(original.Content) }); });
        group.MapPost("/{id:guid}/purchase", async (Guid id, InvoicePurchaseInput input, HttpContext context, IReceivedInvoices service, CancellationToken ct) =>
            Results.Ok(new { PurchaseId = await service.CreatePurchase(id, input, Actor(context), ct) })).RequireAuthorization(SystemPermissions.BarPurchasesManage);
        return endpoints;
    }
    private static Guid Actor(HttpContext context) => Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? context.User.FindFirstValue("sub")!);
}
