using System.Security.Claims;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Finance;
using LongBeach.Domain.Identity;
using Microsoft.AspNetCore.Mvc;

namespace LongBeach.Api.Endpoints;

public static class ExpenseAttachmentEndpoints
{
    public static IEndpointRouteBuilder MapExpenseAttachmentEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/expenses/{expenseId:guid}/attachments").WithTags("Expense attachments")
            .RequireAuthorization(SystemPermissions.FinanceRead)
            .AddEndpointFilter(async (context, next) =>
            {
                if (context.HttpContext.User.HasClaim("requires_first_access", "true")) return Results.Forbid();
                try { return await next(context); }
                catch (ExpenseAttachmentRuleException ex) { return Results.BadRequest(new { message = ex.Message }); }
                catch (KeyNotFoundException ex) { return Results.NotFound(new { message = ex.Message }); }
            });
        group.MapGet("/", (Guid expenseId, IExpenseAttachments service, CancellationToken ct) => service.List(expenseId, ct));
        group.MapPost("/", (Guid expenseId, ExpenseAttachmentInput input, HttpContext context, IExpenseAttachments service, CancellationToken ct) =>
                service.Add(expenseId, input, Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? context.User.FindFirstValue("sub")!), ct))
            .RequireAuthorization(SystemPermissions.FinanceWrite)
            .WithMetadata(new RequestSizeLimitAttribute(2_800_000));
        group.MapGet("/{attachmentId:guid}", (Guid expenseId, Guid attachmentId, IExpenseAttachments service, CancellationToken ct) => service.Download(expenseId, attachmentId, ct));
        return endpoints;
    }
}
