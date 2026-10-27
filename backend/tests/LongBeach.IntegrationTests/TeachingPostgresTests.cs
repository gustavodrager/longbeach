using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Teaching;
using LongBeach.Contracts.Teaching;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Infrastructure.Teaching;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
namespace LongBeach.IntegrationTests;
public sealed class TeachingPostgresTests
{
    private sealed class Clock:TimeProvider {public override DateTimeOffset GetUtcNow()=>new(2026,10,10,15,0,0,TimeSpan.Zero);}
    private static LongBeachDbContext Database()=>new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).AddInterceptors(new AuditSaveChangesInterceptor(new NullAuditContext(),new Clock())).Options,new Clock());
    private static OperationalRecord Row(Guid id,string kind,object value) { var payload=System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(value))!.AsObject();payload["id"]=id.ToString();if(payload["name"] is null)payload["name"]="Teaching test";return new(id,kind,"Teaching test",payload.ToJsonString()); }
    private static async Task<(Guid User,Guid Other,Guid Team,Guid Class,Guid Foreign,Guid Student,Guid Stranger)> Seed(LongBeachDbContext db)
    {
        await db.Database.MigrateAsync();var role=await db.Roles.SingleOrDefaultAsync(r=>r.Name=="Teacher");if(role is null){role=new Role("Teacher");db.Add(role);}
        var user=User.Create("Professor teste","teacher-"+Guid.NewGuid()+"@example.invalid","hash");user.AssignRole(role);var other=User.Create("Outro professor","teacher-"+Guid.NewGuid()+"@example.invalid","hash");other.AssignRole(role);
        var team=Guid.NewGuid();var cls=Guid.NewGuid();var foreign=Guid.NewGuid();var student=Guid.NewGuid();var stranger=Guid.NewGuid();
        db.AddRange(user,other,Row(team,"team",new{id=team,name="Professor cadastrado",status="Ativo"}),Row(cls,"classes",new{id=cls,name="Aula teste",teacherId=team,weekDay=6,startDate="2026-10-01",startTime="08:00",endTime="09:00",status="Ativa",capacity=6}),Row(foreign,"classes",new{id=foreign,name="Turma privada",teacherId=Guid.NewGuid(),weekDay=6,startTime="10:00",endTime="11:00",status="Ativa",capacity=6}),Row(student,"students",new{id=student,name="Aluno autorizado",monthlyAmount=123,phone="private",notes="confidencial"}),Row(stranger,"students",new{id=stranger,name="Outro aluno",monthlyAmount=999}),Row(Guid.NewGuid(),"enrollments",new{classId=cls,studentId=student,startDate="2026-10-01",status="Ativa"}));
        await db.SaveChangesAsync();await new TeachingService(db,new Clock()).Link(new(user.Id,team),default);return(user.Id,other.Id,team,cls,foreign,student,stranger);
    }
    [PostgresFact]
    public async Task Roster_uses_verified_link_and_rejects_foreign_students_dates_and_stale_changes()
    {
        await using var db=Database();var seed=await Seed(db);var s=new TeachingService(db,new Clock());var date=new DateOnly(2026,10,10);
        Assert.False((await s.Overview(seed.Other,default)).Linked);Assert.Equal(seed.Class,Assert.Single((await s.Overview(seed.User,default)).Classes).Id);
        var roster=await s.Roster(seed.User,seed.Class,date,default);Assert.Equal(seed.Student,Assert.Single(roster.Students).Id);Assert.DoesNotContain("monthlyAmount",JsonSerializer.Serialize(roster));Assert.DoesNotContain("confidencial",JsonSerializer.Serialize(roster));
        await Assert.ThrowsAsync<TeachingNotFoundException>(()=>s.Roster(seed.User,seed.Foreign,date,default));
        await Assert.ThrowsAsync<TeachingNotFoundException>(()=>s.SavePresence(seed.Other,seed.Class,date,new(seed.Student,"Presente",0),default));
        await Assert.ThrowsAsync<TeachingNotFoundException>(()=>s.SavePresence(seed.User,seed.Class,date,new(seed.Stranger,"Presente",0),default));
        await Assert.ThrowsAsync<BarRuleException>(()=>s.SavePresence(seed.User,seed.Class,date.AddDays(7),new(seed.Student,"Presente",0),default));
        await Assert.ThrowsAsync<BarRuleException>(()=>s.Roster(seed.User,seed.Class,date.AddDays(1),default));
        await Assert.ThrowsAsync<BarRuleException>(()=>s.Roster(seed.User,seed.Class,new(2026,9,26),default));
        roster=await s.SavePresence(seed.User,seed.Class,date,new(seed.Student,"Presente",0),default);Assert.Equal("Presente",roster.Students[0].Presence);Assert.Equal(1,roster.Students[0].Version);
        await Assert.ThrowsAsync<TeachingConflictException>(()=>s.SavePresence(seed.User,seed.Class,date,new(seed.Student,"Ausente",0),default));
        await Assert.ThrowsAsync<BarRuleException>(()=>s.Link(new(seed.Other,seed.Team),default));
        await s.Link(new(seed.User,null),default);Assert.False((await s.Overview(seed.User,default)).Linked);await Assert.ThrowsAsync<TeachingNotFoundException>(()=>s.Roster(seed.User,seed.Class,date,default));
    }
    [PostgresFact]
    public async Task Api_enforces_class_scope_and_management_access()
    {
        await using var db=Database();var seed=await Seed(db);
        await using var factory=OperationalPostgresTests.Factory();
        using var client=factory.CreateClient();client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",ProfileAuthorizationTests.Token(seed.User,["Teacher"]));
        var overview=await client.GetFromJsonAsync<TeachingOverview>("/api/v1/me/teaching");Assert.Equal(seed.Class,Assert.Single(overview!.Classes).Id);
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync($"/api/v1/me/teaching/classes/{seed.Foreign}?date=2026-10-10")).StatusCode);
        var result=await client.PutAsJsonAsync($"/api/v1/me/teaching/classes/{seed.Class}/presences?date=2026-10-10",new PresenceInput(seed.Student,"Presente",0));Assert.Equal(HttpStatusCode.OK,result.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PutAsJsonAsync("/api/v1/teaching/access",new TeacherLink(seed.Other,seed.Team))).StatusCode);
        foreach(var role in new[]{"Manager","Administrator"}) {client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",ProfileAuthorizationTests.Token(Guid.NewGuid(),[role],[]));Assert.Equal(HttpStatusCode.OK,(await client.GetAsync("/api/v1/teaching/access")).StatusCode);Assert.Equal(HttpStatusCode.OK,(await client.GetAsync("/api/v1/financial-history?month=2026-10")).StatusCode);}
    }
}
