using System.Security.Claims;
using LongBeach.Application.Authorization;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
namespace LongBeach.Api.Endpoints;

public static class FinancialHistoryEndpoints
{
    public static IEndpointRouteBuilder MapFinancialHistoryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group=endpoints.MapGroup("/api/v1/financial-history").WithTags("Financial history").RequireAuthorization("Management");
        group.MapGet("/",(string? month,string? series,string? metric,int? page,IFinancialHistory service,CancellationToken ct)=>service.Report(month,series,metric,page??1,ct));
        group.MapGet("/dashboard-balances",(IFinancialHistory service,CancellationToken ct)=>service.DashboardBalances(ct));
        group.MapGet("/monthly-controls",(string? month,IFinancialHistory service,CancellationToken ct)=>service.MonthlyControl(month,ct));
        group.MapPut("/monthly-controls/{month}",async (string month,MonthlyControlInput input,IFinancialHistory service,CancellationToken ct)=> {
            try { return Results.Ok(await service.SaveMonthlyControl(month,input,ct)); }
            catch (MonthlyControlConflictException e) { return Results.Conflict(new { message=e.Message }); }
        });
        group.MapGet("/integrations",(IFinancialHistory service,CancellationToken ct)=>service.Integrations(ct));
        group.MapGet("/arena-summary",(string? month,IFinancialHistory service,CancellationToken ct)=>service.ArenaSummary(month,ct));
        group.MapGet("/pagbank-edi",(string? date,int? page,IFinancialHistory service,CancellationToken ct)=>service.ProviderRecords(date,page??1,ct));
        group.MapPost("/pagbank-edi/reprocess",async (EdiReprocessInput input,HttpContext context,IPagBankEdiCollection collection,CancellationToken ct)=>
        {
            var actor=Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier)??context.User.FindFirstValue("sub")!);
            await collection.Reprocess(input.From,input.Through,input.Reason,actor,ct);
            return Results.Ok(new { input.From, input.Through });
        });
        group.MapGet("/imports/{id:guid}",(Guid id,IFinancialHistory service,CancellationToken ct)=>service.Preview(id,ct));
        group.MapPost("/imports/{id:guid}/apply",(Guid id,ApplyInput input,IFinancialHistory service,CancellationToken ct)=>service.Apply(id,input.ConfirmationToken,ct));
        return endpoints;
    }
    public sealed record EdiReprocessInput(DateOnly From,DateOnly Through,string Reason);
    public sealed record ApplyInput(string ConfirmationToken);
}
