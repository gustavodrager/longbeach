using LongBeach.Application.Authorization;
using LongBeach.Application.Finance;
namespace LongBeach.Api.Endpoints;

public static class FinancialHistoryEndpoints
{
    public static IEndpointRouteBuilder MapFinancialHistoryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group=endpoints.MapGroup("/api/v1/financial-history").WithTags("Financial history").RequireAuthorization(AuthorizationPolicyCatalog.Owner);
        group.MapGet("/",(string? month,string? series,string? metric,int? page,IFinancialHistory service,CancellationToken ct)=>service.Report(month,series,metric,page??1,ct));
        group.MapGet("/integrations",(IFinancialHistory service,CancellationToken ct)=>service.Integrations(ct));
        group.MapGet("/pagbank-edi",(string? date,int? page,IFinancialHistory service,CancellationToken ct)=>service.ProviderRecords(date,page??1,ct));
        group.MapGet("/imports/{id:guid}",(Guid id,IFinancialHistory service,CancellationToken ct)=>service.Preview(id,ct));
        group.MapPost("/imports/{id:guid}/apply",(Guid id,ApplyInput input,IFinancialHistory service,CancellationToken ct)=>service.Apply(id,input.ConfirmationToken,ct));
        return endpoints;
    }
    public sealed record ApplyInput(string ConfirmationToken);
}
