using System.Security.Claims;
using LongBeach.Application.Customers;
using LongBeach.Contracts.Customers;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;

namespace LongBeach.Api.Endpoints;

public static class CustomerEndpoints
{
    private static Guid Actor(HttpContext http) => Guid.TryParse(http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub"), out var actor)
        ? actor : throw new CustomerRuleException("Entre novamente com sua conta individual.", 401);
    private static bool Has(HttpContext http, string permission) => http.User.HasClaim("permission", permission);
    private static bool IsManagementRole(HttpContext http) => ProfileAccess.IsManagement(http.User.FindAll(ClaimTypes.Role).Select(x => x.Value));
    private static bool Management(HttpContext http) => IsManagementRole(http) && Has(http, SystemPermissions.CustomersMerge);
    private static bool Scoped(HttpContext http, string? scope, bool write) => scope switch
    {
        "students" => Has(http, write ? SystemPermissions.StudentsWrite : SystemPermissions.StudentsRead),
        "projects" or "reservations" => Has(http, write ? SystemPermissions.ProjectsWrite : SystemPermissions.ProjectsRead),
        "bar" => Has(http, SystemPermissions.BarSalesOperate),
        _ => false
    };
    public static IEndpointRouteBuilder MapCustomerEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/customers").WithTags("Customers").RequireAuthorization();
        group.MapGet("/", (string? search, string? profile, bool? incomplete, string? status, int? page, int? pageSize, ICustomers customers, CancellationToken ct) =>
            customers.List(search, profile, incomplete, status, page ?? 1, pageSize ?? 20, ct)).RequireAuthorization(SystemPermissions.CustomersRead);
        group.MapGet("/{id:guid}", (Guid id, ICustomers customers, CancellationToken ct) => customers.Get(id, ct)).RequireAuthorization(SystemPermissions.CustomersRead);
        group.MapGet("/{id:guid}/links", async (Guid id, HttpContext http, ICustomers customers, CancellationToken ct) =>
            (await customers.Links(id, ct)).Where(link => link.Kind switch
            {
                "students" => Has(http, SystemPermissions.StudentsRead),
                "rentalMembers" or "reservations" => Has(http, SystemPermissions.ProjectsRead),
                "barTabs" or "barSales" => Has(http, SystemPermissions.BarSalesRead),
                "users" => Has(http, SystemPermissions.UsersManage),
                _ => false
            })).RequireAuthorization(SystemPermissions.CustomersRead);
        group.MapGet("/lookup", async (string? scope, string? search, HttpContext http, ICustomers customers, CancellationToken ct) =>
            Has(http, SystemPermissions.CustomersRead) || Scoped(http, scope, false) ? Results.Ok(await customers.Lookup(search, ct)) : Results.Forbid());
        group.MapPost("/", async (CreateCustomerInput input, string? scope, HttpContext http, ICustomers customers, CancellationToken ct) =>
        {
            if (!Has(http, SystemPermissions.CustomersWrite) && !Scoped(http, scope, true)) return Results.Forbid();
            var customer = await customers.Create(input, Actor(http), scope ?? "directory", ct);
            // Replays can resolve an alias or a contact edited by management since creation.
            // Operation-scoped access must retain the same minimal disclosure as lookup.
            return Has(http, SystemPermissions.CustomersRead) ? Results.Ok((object)customer)
                : Results.Ok(new CustomerLookup(customer.Id, customer.Name, customer.Phone.Length >= 4 ? "•••• " + customer.Phone[^4..] : "Não informado", customer.Incomplete));
        });
        group.MapPut("/{id:guid}", (Guid id, UpdateCustomerInput input, ICustomers customers, CancellationToken ct) => customers.Update(id, input, ct)).RequireAuthorization(SystemPermissions.CustomersWrite);
        group.MapGet("/{id:guid}/user-candidates", async (Guid id, string? search, HttpContext http, ICustomers customers, CancellationToken ct) =>
            IsManagementRole(http) && Has(http, SystemPermissions.UsersManage) && Has(http, SystemPermissions.CustomersWrite) ? Results.Ok(await customers.UserCandidates(id, search, ct)) : Results.Forbid());
        group.MapPost("/{id:guid}/user", async (Guid id, CustomerUserInput input, HttpContext http, ICustomers customers, CancellationToken ct) =>
            IsManagementRole(http) && Has(http, SystemPermissions.UsersManage) && Has(http, SystemPermissions.CustomersWrite) ? Results.Ok(await customers.AssignUser(id, input, ct)) : Results.Forbid());
        group.MapGet("/duplicates", async (HttpContext http, ICustomers customers, CancellationToken ct) =>
            Management(http) ? Results.Ok(await customers.Duplicates(ct)) : Results.Forbid());
        group.MapGet("/{id:guid}/merges", async (Guid id, HttpContext http, ICustomers customers, CancellationToken ct) =>
            Management(http) ? Results.Ok(await customers.Merges(id, ct)) : Results.Forbid());
        group.MapPost("/merge/preview", async (CustomerMergePreviewInput input, HttpContext http, ICustomers customers, CancellationToken ct) =>
            Management(http) ? Results.Ok(await customers.PreviewMerge(input, ct)) : Results.Forbid());
        group.MapPost("/merge", async (CustomerMergeInput input, HttpContext http, ICustomers customers, CancellationToken ct) =>
            Management(http) ? Results.Ok(await customers.Merge(input, Actor(http), ct)) : Results.Forbid());
        group.MapPost("/merges/{id:guid}/undo", async (Guid id, CustomerUndoInput input, HttpContext http, ICustomers customers, CancellationToken ct) =>
            Management(http) ? Results.Ok(await customers.Undo(id, input, Actor(http), ct)) : Results.Forbid());
        group.MapGet("/backfill/preview", async (HttpContext http, ICustomers customers, CancellationToken ct) =>
            Management(http) ? Results.Ok(await customers.PreviewBackfill(ct)) : Results.Forbid());
        group.MapPost("/backfill", async (CustomerBackfillInput input, HttpContext http, ICustomers customers, CancellationToken ct) =>
            Management(http) ? Results.Ok(await customers.ApplyBackfill(input, Actor(http), ct)) : Results.Forbid());
        endpoints.MapGet("/api/v1/me/customer", (HttpContext http, ICustomers customers, CancellationToken ct) => customers.Self(Actor(http), ct)).RequireAuthorization();
        endpoints.MapPut("/api/v1/me/customer", (SelfCustomerInput input, HttpContext http, ICustomers customers, CancellationToken ct) => customers.SaveSelf(Actor(http), input, ct)).RequireAuthorization();
        return endpoints;
    }
}
