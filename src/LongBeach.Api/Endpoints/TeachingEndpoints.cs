using System.Globalization;
using System.Security.Claims;
using LongBeach.Application.Teaching;
using LongBeach.Contracts.Teaching;
namespace LongBeach.Api.Endpoints;
public static class TeachingEndpoints
{
    public static IEndpointRouteBuilder MapTeachingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var mine=endpoints.MapGroup("/api/v1/me/teaching").RequireAuthorization(p=>p.RequireAuthenticatedUser().RequireAssertion(c=>!c.User.HasClaim("requires_first_access","true")).RequireRole("Teacher","Owner","Administrator","Manager")).WithTags("Minhas aulas");
        mine.MapGet("",(HttpContext h,ITeaching s,CancellationToken ct)=>s.Overview(Actor(h),ct));
        mine.MapGet("/classes/{classId:guid}",(Guid classId,string date,HttpContext h,ITeaching s,CancellationToken ct)=>Run(date,d=>s.Roster(Actor(h),classId,d,ct)));
        mine.MapPut("/classes/{classId:guid}/presences",(Guid classId,string date,PresenceInput i,HttpContext h,ITeaching s,CancellationToken ct)=>Run(date,d=>s.SavePresence(Actor(h),classId,d,i,ct)));
        var access=endpoints.MapGroup("/api/v1/teaching/access").RequireAuthorization("Management");
        access.MapGet("",(ITeaching s,CancellationToken ct)=>s.Access(ct));
        access.MapPut("",async(TeacherLink i,ITeaching s,CancellationToken ct)=>{await s.Link(i,ct);return Results.NoContent();});
        return endpoints;
    }
    private static Guid Actor(HttpContext h)=>Guid.Parse(h.User.FindFirstValue(ClaimTypes.NameIdentifier)??h.User.FindFirstValue("sub")!);
    private static async Task<IResult> Run(string date,Func<DateOnly,Task<TeachingRoster>> action)
    {
        if(!DateOnly.TryParseExact(date,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var day))return Results.BadRequest(new{message="Informe uma data válida."});
        try{return Results.Ok(await action(day));}
        catch(TeachingNotFoundException){return Results.NotFound();}
        catch(TeachingConflictException){return Results.Conflict(new{message="A chamada mudou. Atualize os dados antes de salvar novamente."});}
    }
}
