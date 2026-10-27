using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Identity;

namespace LongBeach.Api.Endpoints;

public static class ExpenseEndpoints
{
    public static IEndpointRouteBuilder MapExpenseEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/expenses").WithTags("Expenses").RequireAuthorization().RequireAuthorization(SystemPermissions.FinanceRead);
        group.MapGet("/", (string? filter, string? state, string? search, int? page, int? pageSize, IExpenses service, CancellationToken ct) =>
            service.List(filter, state, search, page ?? 1, pageSize ?? 20, ct)).RequireAuthorization(SystemPermissions.FinanceRead);
        group.MapGet("/options", (IExpenses service, CancellationToken ct) => service.Options(ct)).RequireAuthorization(SystemPermissions.FinanceRead);
        group.MapGet("/paid-summary", (DateOnly from, DateOnly to, IExpenses service, CancellationToken ct) => service.PaidSummary(from, to, ct));
        group.MapGet("/purchase-options/{id:guid}", (Guid id, IExpenses service, CancellationToken ct) => service.PurchaseOption(id, ct)).RequireAuthorization(SystemPermissions.FinanceRead);
        group.MapPost("/partners", (ExpensePartnerInput input, IExpenses service, CancellationToken ct) => service.CreatePartner(input, ct)).RequireAuthorization(SystemPermissions.FinanceWrite);
        group.MapGet("/{id:guid}", (Guid id, IExpenses service, CancellationToken ct) => service.Detail(id, ct)).RequireAuthorization(SystemPermissions.FinanceRead);
        group.MapPut("/{id:guid}", (Guid id, ExpenseInput input, IExpenses service, CancellationToken ct) => service.Create(id, input, ct)).RequireAuthorization(SystemPermissions.FinanceWrite);
        group.MapPost("/{id:guid}/payments", (Guid id, ExpensePaymentInput input, IExpenses service, CancellationToken ct) => service.Pay(id, input, ct)).RequireAuthorization(SystemPermissions.FinanceWrite);
        group.MapPost("/{id:guid}/cancel", (Guid id, ExpenseCancelInput input, IExpenses service, CancellationToken ct) => service.Cancel(id, input, ct)).RequireAuthorization(SystemPermissions.FinanceWrite);
        return endpoints;
    }
}
