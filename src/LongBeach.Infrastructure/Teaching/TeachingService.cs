using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Teaching;
using LongBeach.Application.Operations;
using LongBeach.Contracts.Teaching;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Teaching;

public sealed class TeachingService(LongBeachDbContext db, TimeProvider clock) : ITeaching
{
    private static JsonObject Data(OperationalRecord row) => JsonNode.Parse(row.Payload)!.AsObject();
    private static string Text(JsonObject row, string key) => row[key]?.ToString() ?? "";
    private static Guid Id(JsonObject row, string key) => Guid.TryParse(Text(row, key), out var id) ? id : Guid.Empty;
    private static int Number(JsonObject row, string key) => int.TryParse(Text(row,key), out var n) ? n : 0;
    private DateOnly Today => DateOnly.FromDateTime(clock.GetUtcNow().ToOffset(TimeSpan.FromHours(-3)).DateTime);
    private Task Lock(CancellationToken ct) => db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)",ct);
    private Task<List<OperationalRecord>> Records(CancellationToken ct) => db.OperationalRecords.Where(r => r.Kind == "reservations" || r.Kind == "teacherLinks" || r.Kind == "team" || r.Kind == "classes" || r.Kind == "students" || r.Kind == "enrollments" || r.Kind == "presences").ToListAsync(ct);
    private static Guid Teacher(List<OperationalRecord> rows, Guid user)
    {
        var links=rows.Where(r=>r.Kind=="teacherLinks").Select(Data).Where(r=>Id(r,"userId")==user).ToArray();
        if(links.Length != 1) return Guid.Empty;
        var team=Id(links[0],"teamId");
        return rows.Any(r=>r.Kind=="team" && r.Id==team && Text(Data(r),"status")!="Inativo") ? team : Guid.Empty;
    }
    private static bool Enrolled(JsonObject row, Guid cls, DateOnly date) => Id(row,"classId")==cls && DateOnly.TryParse(Text(row,"startDate"),out var start) && start<=date && (Text(row,"status")=="Ativa" || Text(row,"status")=="Encerrada" && DateOnly.TryParse(Text(row,"endDate"),out var end) && end>=date);
    private TeachingClass Summary(OperationalRecord row,List<OperationalRecord> rows)
    {
        var data=Data(row);
        return new(row.Id,Text(data,"name"),Number(data,"weekDay"),Text(data,"startTime"),Text(data,"endTime"),Text(data,"startDate"),Text(data,"status"),Number(data,"capacity"),rows.Count(r=>r.Kind=="enrollments" && Id(Data(r),"classId")==row.Id && Text(Data(r),"status")=="Ativa"));
    }
    public async Task<TeachingOverview> Overview(Guid user,CancellationToken ct)
    {
        var rows=await Records(ct);var teacher=Teacher(rows,user);
        var appointments = teacher == Guid.Empty ? [] : rows.Where(r => r.Kind == "reservations").Select(Data)
            .Where(p => Id(p,"teacherId") == teacher && Text(p,"status") is ("Confirmada" or "Chegou" or "Concluída") && DateOnly.TryParse(Text(p,"date"),out var date) && date >= Today && date <= Today.AddDays(60))
            .Select(p => new TeachingAppointment(Id(p,"id"), Text(p,"name"), Text(p,"customerName"), Text(p,"date"), Text(p,"startTime"), Text(p,"endTime"), Text(p,"status")))
            .OrderBy(a=>a.Date).ThenBy(a=>a.StartTime).ToArray();
        return new(teacher!=Guid.Empty, teacher==Guid.Empty ? [] : rows.Where(r=>r.Kind=="classes"&&Id(Data(r),"teacherId")==teacher).Select(r=>Summary(r,rows)).OrderBy(r=>r.WeekDay==0?7:r.WeekDay).ThenBy(r=>r.StartTime).ToArray(), appointments);
    }
    private TeachingRoster BuildRoster(List<OperationalRecord> rows,Guid user,Guid classId,DateOnly date)
    {
        var teacher=Teacher(rows,user);
        var cls=rows.SingleOrDefault(r=>r.Id==classId&&r.Kind=="classes"&&teacher!=Guid.Empty&&Id(Data(r),"teacherId")==teacher) ?? throw new TeachingNotFoundException();
        var summary=Summary(cls,rows);
        if ((int)date.DayOfWeek!=summary.WeekDay || DateOnly.TryParse(summary.StartDate,out var start)&&date<start) throw new BarRuleException("Escolha uma data da grade desta turma, a partir do seu início.");
        var ids=rows.Where(r=>r.Kind=="enrollments"&&Enrolled(Data(r),classId,date)).Select(r=>Id(Data(r),"studentId")).ToHashSet();
        var students=rows.Where(r=>r.Kind=="students"&&ids.Contains(r.Id)).OrderBy(r=>r.Name).Select(r=>{
            var presence=rows.Where(p=>p.Kind=="presences").Select(Data).SingleOrDefault(p=>Id(p,"classId")==classId&&Id(p,"studentId")==r.Id&&Text(p,"date")==date.ToString("yyyy-MM-dd"));
            return new TeachingStudent(r.Id,Text(Data(r),"name"),presence is null?null:Text(presence,"status"),presence is null?0:Number(presence,"version"));
        }).ToArray();
        return new(summary,date.ToString("yyyy-MM-dd"),students);
    }
    public async Task<TeachingRoster> Roster(Guid user,Guid classId,DateOnly date,CancellationToken ct)=>BuildRoster(await Records(ct),user,classId,date);
    public async Task<TeachingRoster> SavePresence(Guid user,Guid classId,DateOnly date,PresenceInput input,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);
        var rows=await Records(ct);var roster=BuildRoster(rows,user,classId,date);
        if(date>Today || roster.Class.Status!="Ativa") throw new BarRuleException("Registre a presença até hoje, em uma turma ativa.");
        var student=roster.Students.SingleOrDefault(s=>s.Id==input.StudentId) ?? throw new TeachingNotFoundException();
        if(input.Status is not ("Presente" or "Ausente")) throw new BarRuleException("Escolha presente ou ausente.");
        if(student.Version!=input.Version) throw new TeachingConflictException();
        var row=rows.SingleOrDefault(r=>r.Kind=="presences"&&Id(Data(r),"classId")==classId&&Id(Data(r),"studentId")==input.StudentId&&Text(Data(r),"date")==roster.Date);
        var id=row?.Id??Guid.NewGuid();var name=$"{student.Name} · {roster.Date}";
        var payload=JsonSerializer.Serialize(new {id,name,classId,studentId=input.StudentId,date=roster.Date,status=input.Status,version=input.Version+1});
        if(row is null) db.Add(new OperationalRecord(id,"presences",name,payload));else row.Update(name,payload);
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
        return await Roster(user,classId,date,ct);
    }
    public async Task<TeachingAccess> Access(CancellationToken ct)
    {
        var users=await db.Users.Include(u=>u.UserRoles).ThenInclude(r=>r.Role).Where(u=>u.IsActive).ToListAsync(ct);
        var rows=await Records(ct);
        return new(users.Where(u=>u.GetRoleNames().Contains(SystemRoles.Teacher)).Select(u=>new TeachingPerson(u.Id,u.Name)).ToArray(),rows.Where(r=>r.Kind=="team"&&Text(Data(r),"status")!="Inativo").Select(r=>new TeachingPerson(r.Id,r.Name)).ToArray(),rows.Where(r=>r.Kind=="teacherLinks").Select(r=>new TeacherLink(Id(Data(r),"userId"),Id(Data(r),"teamId") is var id&&id!=Guid.Empty?id:null)).ToArray());
    }
    public async Task Link(TeacherLink input,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);
        var access=await Access(ct);
        if(!access.Users.Any(u=>u.Id==input.UserId) || input.TeamId.HasValue&&!access.Team.Any(t=>t.Id==input.TeamId)) throw new BarRuleException("Escolha uma conta de professor ativa e um cadastro da equipe.");
        if(input.TeamId.HasValue&&access.Links.Any(l=>l.UserId!=input.UserId&&l.TeamId==input.TeamId)) throw new BarRuleException("Este professor já está vinculado a outra conta.");
        var rows=await db.OperationalRecords.Where(r=>r.Kind=="teacherLinks").ToListAsync(ct);
        var row=rows.SingleOrDefault(r=>Id(Data(r),"userId")==input.UserId);var id=row?.Id??Guid.NewGuid();var name="Vínculo de professor";
        var payload=JsonSerializer.Serialize(new{id,userId=input.UserId,teamId=input.TeamId});
        if(row is null)db.Add(new OperationalRecord(id,"teacherLinks",name,payload));else row.Update(name,payload);
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
    }
}
