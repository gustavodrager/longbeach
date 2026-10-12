using System.Security.Claims;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using LongBeach.Application.Portal;
using LongBeach.Contracts.Portal;
using LongBeach.Domain.Identity;
namespace LongBeach.Api.Endpoints;

public static class ClientPortalEndpoints
{
    public static IEndpointRouteBuilder MapClientPortalEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var me=endpoints.MapGroup("/api/v1/me/portal").RequireAuthorization().RequireRateLimiting("client-portal").WithTags("Área do cliente");
        me.MapPost("/bar/{id:guid}/access",async(Guid id,TabAccessInput i,HttpContext h,LongBeachDbContext db,IBarTabs tabs,CancellationToken ct)=>
        {
            var user=Actor(h);var account=await db.Set<BillingAccount>().AsNoTracking().SingleOrDefaultAsync(a=>a.Id==id&&a.UserId==user&&a.Kind=="Bar",ct);
            if(account is null)return Results.NotFound();
            return Results.Ok(await tabs.IssueAccess(account.SourceId,i,user,ct));
        });
        me.MapGet("/availability", (DateOnly date, Guid? courtId, IClientPortal s, CancellationToken ct) => s.Availability(date, courtId, ct));
        me.MapPost("/requests/{id:guid}/withdraw", (Guid id, AcceptAlternativeInput i, HttpContext h, IClientPortal s, CancellationToken ct) => s.Withdraw(Actor(h), id, i, ct));
        me.MapGet("/profile",(HttpContext h,IClientPortal s,CancellationToken ct)=>s.Profile(Actor(h),ct));
        me.MapPut("/profile",(ProfileInput i,HttpContext h,IClientPortal s,CancellationToken ct)=>s.SaveProfile(Actor(h),i,ct));
        me.MapGet("/agenda",(HttpContext h,IClientPortal s,CancellationToken ct)=>s.Agenda(Actor(h),ct));
        me.MapGet("/options",(IClientPortal s,CancellationToken ct)=>s.Options(ct));
        me.MapGet("/requests",(HttpContext h,IClientPortal s,CancellationToken ct)=>s.Requests(Actor(h),ct));
        me.MapPost("/requests",(RequestInput i,HttpContext h,IClientPortal s,CancellationToken ct)=>s.Request(Actor(h),i,ct));
        me.MapPost("/requests/{id:guid}/accept",(Guid id,AcceptAlternativeInput i,HttpContext h,IClientPortal s,CancellationToken ct)=>s.Accept(Actor(h),id,i,ct));
        me.MapPost("/ratings",async(RatingInput i,HttpContext h,IClientPortal s,CancellationToken ct)=> { await s.Rate(Actor(h),i,ct);return Results.NoContent(); });
        var admin=endpoints.MapGroup("/api/v1/portal").RequireAuthorization(policy=>policy.RequireAssertion(c=>c.User.IsInRole(SystemRoles.Owner)||c.User.HasClaim("permission",SystemPermissions.StudentsWrite)&&c.User.HasClaim("permission",SystemPermissions.ProjectsWrite))).WithTags("Solicitações de clientes");
        admin.MapGet("/options",(IClientPortal s,CancellationToken ct)=>s.Options(ct,staff:true));
        admin.MapGet("/requests",(IClientPortal s,CancellationToken ct)=>s.Requests(null,ct));
        admin.MapPost("/requests/{id:guid}/decision",(Guid id,RequestDecision i,IClientPortal s,CancellationToken ct)=>s.Decide(id,i,ct));
        admin.MapGet("/candidates",(IClientPortal s,CancellationToken ct)=>s.Candidates(ct)).RequireAuthorization(SystemPermissions.UsersManage);
        admin.MapPost("/links",async(LinkInput i,IClientPortal s,CancellationToken ct)=>{await s.Link(i,ct);return Results.NoContent();}).RequireAuthorization(SystemPermissions.UsersManage);
        return endpoints;
    }
    private static Guid Actor(HttpContext h)=>Guid.Parse(h.User.FindFirstValue(ClaimTypes.NameIdentifier)??h.User.FindFirstValue("sub")!);
}
