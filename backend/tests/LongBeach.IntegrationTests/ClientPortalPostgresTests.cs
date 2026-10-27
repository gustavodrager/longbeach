using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Contracts.Portal;
using LongBeach.Application.Abstractions;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Infrastructure.Portal;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
namespace LongBeach.IntegrationTests;

public sealed class ClientPortalPostgresTests
{
    private sealed class Clock : TimeProvider { public override DateTimeOffset GetUtcNow()=>new(2026,10,6,12,0,0,TimeSpan.Zero); }
    private static readonly Clock Time=new();
    private static LongBeachDbContext Database()=>new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).AddInterceptors(new AuditSaveChangesInterceptor(new NullAuditContext(),Time)).Options,Time);
    private static ClientPortalService Service(LongBeachDbContext db)=>new(db,Time,new ConfigurationBuilder().Build());
    private static OperationalRecord Row(Guid id,string kind,object payload)=>new(id,kind,"Teste "+id,JsonSerializer.Serialize(payload));
    private static async Task<(Guid User,Guid Other,Guid Court,Guid Student,Guid Class,Guid Teacher)> Seed(LongBeachDbContext db)
    {
        await db.Database.MigrateAsync();var user=User.Create("Cliente teste","portal-"+Guid.NewGuid()+"@example.invalid","hash");var other=User.Create("Outro cliente","portal-"+Guid.NewGuid()+"@example.invalid","hash");
        var court=Guid.NewGuid();var student=Guid.NewGuid();var cls=Guid.NewGuid();var teacher=Guid.NewGuid();var enrollment=Guid.NewGuid();
        db.AddRange(user,other,Row(court,"courts",new{id=court,name="Quadra teste",status="Disponível",openingTime="08:00",closingTime="23:00",operatingDays=new[]{0,1,2,3,4,5,6},scheduleConfirmed=true}),Row(student,"students",new{id=student,name="Aluno teste",monthlyAmount=100}),Row(teacher,"team",new{id=teacher,name="Professor teste"}),Row(cls,"classes",new{id=cls,name="Turma teste",courtId=court,teacherId=teacher,weekDay=3,startDate="2026-09-01",startTime="18:00",endTime="19:00",capacity=6,studentIds=Array.Empty<Guid>(),status="Ativa"}),Row(enrollment,"enrollments",new{id=enrollment,name="Matrícula teste",studentId=student,classId=cls,startDate="2026-09-01",status="Ativa",monthlyAmount=100}));
        await db.SaveChangesAsync();await Service(db).Link(new(user.Id,"students",student),default);return(user.Id,other.Id,court,student,cls,teacher);
    }
    private static RequestInput Input(Guid court,string date="2026-10-08",string start="18:00",string end="19:00")=>new(Guid.NewGuid(),"Reservation",null,date,start,end,court,"Gostaria deste horário");
    private static RequestDecision Confirm(PortalRequest r,decimal amount=0)=>new(r.Version,"Confirmed","Horário confirmado",null,null,null,r.CourtId,null,amount);
    [PostgresFact]
    public async Task Own_agenda_does_not_match_names_or_allow_forged_changes()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);var agenda=await service.Agenda(seed.User,default);
        Assert.NotEmpty(agenda);Assert.Empty(await service.Agenda(seed.Other,default));Assert.All(agenda,a=>Assert.Equal(seed.Class,a.SourceId));
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Request(seed.Other,new(Guid.NewGuid(),"Cancellation",agenda.First(a=>a.CanChange).Key,"","","",null,"Cancelar"),default));
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Link(new(seed.Other,"students",seed.Student),default));
        Assert.Empty(await service.Requests(seed.Other,default));
    }
    [PostgresFact]
    public async Task Request_and_confirmation_are_atomic_replay_safe_and_do_not_create_debt()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);var input=Input(seed.Court);var request=await service.Request(seed.User,input,default);
        Assert.Equal(request.Id,(await service.Request(seed.User,input,default)).Id);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Request(seed.User,input with {Date="2026-10-09"},default));
        Assert.DoesNotContain(await service.Agenda(seed.User,default),a=>a.Kind=="Reserva");
        var confirmed=await service.Decide(request.Id,Confirm(request,60),default);Assert.Equal("Confirmed",confirmed.Status);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Decide(request.Id,Confirm(request,60),default));
        Assert.Single(await service.Agenda(seed.User,default),a=>a.Kind=="Reserva");
        var audit=await db.AuditLogs.Where(a=>a.ResourceId==request.Id.ToString()).ToArrayAsync();
        Assert.Equal(2,audit.Length);Assert.All(audit,a=>Assert.DoesNotContain(input.Message,a.MetadataJson));
        Assert.False(await db.Set<LongBeach.Domain.Billing.BillingAccount>().AnyAsync(a=>a.UserId==seed.User));
        var competing=await service.Request(seed.Other,Input(seed.Court),default);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Decide(competing.Id,Confirm(competing,60),default));
        Assert.Single(await service.Requests(seed.Other,default),r=>r.Status=="Sent");
    }
    [PostgresFact]
    public async Task Alternative_requires_the_owner_acceptance_and_rechecks_availability()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);var request=await service.Request(seed.User,Input(seed.Court,"2026-10-07"),default);
        var alternative=await service.Decide(request.Id,new(1,"Alternative","Podemos às 20h","2026-10-07","20:00","21:00",seed.Court,null,50),default);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Decide(request.Id,Confirm(alternative,50),default));
        await Assert.ThrowsAsync<BarTabAccessException>(()=>service.Accept(seed.Other,request.Id,new(2),default));
        var accepted=await service.Accept(seed.User,request.Id,new(2),default);Assert.Equal("Confirmed",accepted.Status);
        Assert.Equal(accepted.ReservationId,(await service.Accept(seed.User,request.Id,new(2),default)).ReservationId);
        Assert.Single(await service.Agenda(seed.User,default),a=>a.Kind=="Reserva");
        var second=await service.Request(seed.Other,Input(seed.Court,"2026-10-09"),default);
        var stale=await service.Decide(second.Id,new(1,"Alternative","Outro horário","2026-10-07","20:00","21:00",seed.Court,null,50),default);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Accept(seed.Other,stale.Id,new(stale.Version),default));
        Assert.Equal("Alternative",(await service.Requests(seed.Other,default)).Single().Status);
    }
    [PostgresFact]
    public async Task Cancellation_waits_for_staff_and_only_changes_the_single_class_occurrence()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);var lesson=(await service.Agenda(seed.User,default)).First(a=>a.CanChange);
        var request=await service.Request(seed.User,new(Guid.NewGuid(),"Cancellation",lesson.Key,"","","",null,"Não vou conseguir ir"),default);
        Assert.True((await service.Agenda(seed.User,default)).Single(a=>a.Key==lesson.Key).CanChange);
        await service.Decide(request.Id,Confirm(request),default);
        var agenda=await service.Agenda(seed.User,default);Assert.Equal("Cancelada",agenda.Single(a=>a.Key==lesson.Key).Status);Assert.Contains(agenda,a=>a.Key!=lesson.Key&&a.CanChange);
        Assert.Equal("Ativa",JsonNode.Parse((await db.OperationalRecords.SingleAsync(r=>r.Id==seed.Class)).Payload)!["status"]!.ToString());
    }
    [PostgresFact]
    public async Task Changed_original_and_unverified_schedule_cannot_be_confirmed()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);var first=await service.Request(seed.User,Input(seed.Court),default);var accepted=await service.Decide(first.Id,Confirm(first,30),default);
        var reservation=(await service.Agenda(seed.User,default)).Single(a=>a.SourceId==accepted.ReservationId);
        var cancel=await service.Request(seed.User,new(Guid.NewGuid(),"Cancellation",reservation.Key,"","","",null,"Cancelar"),default);
        var row=await db.OperationalRecords.SingleAsync(r=>r.Id==reservation.SourceId);var payload=JsonNode.Parse(row.Payload)!.AsObject();payload["date"]="2026-10-09";row.Update(row.Name,payload.ToJsonString());await db.SaveChangesAsync();
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Decide(cancel.Id,Confirm(cancel),default));
        var court=await db.OperationalRecords.SingleAsync(r=>r.Id==seed.Court);payload=JsonNode.Parse(court.Payload)!.AsObject();payload["scheduleConfirmed"]=false;court.Update(court.Name,payload.ToJsonString());await db.SaveChangesAsync();
        var request=await service.Request(seed.Other,Input(seed.Court,"2026-10-10"),default);await Assert.ThrowsAsync<BarRuleException>(()=>service.Decide(request.Id,Confirm(request),default));
    }
    [PostgresFact]
    public async Task Profile_preferences_and_ratings_stay_with_their_owner()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);
        var profile=await service.SaveProfile(seed.User,new("Apelido","11999998888",false),default);Assert.Equal("Apelido",profile.Name);Assert.False(profile.Reminders);Assert.NotEqual(profile.Phone,(await service.Profile(seed.Other,default)).Phone);
        var past=(await service.Agenda(seed.User,default)).First(a=>a.CanRate);await service.Rate(seed.User,new(past.Key,5),default);await service.Rate(seed.User,new(past.Key,5),default);
        Assert.Equal(5,(await service.Agenda(seed.User,default)).Single(a=>a.Key==past.Key).Rating);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Rate(seed.Other,new(past.Key,5),default));
        await Assert.ThrowsAsync<BarRuleException>(async()=>await service.Rate(seed.User,new((await service.Agenda(seed.User,default)).First(a=>a.CanChange).Key,5),default));
    }
    [PostgresFact]
    public async Task Midnight_end_is_valid_for_confirmation_and_completed_visit_rating()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);
        var court=await db.OperationalRecords.SingleAsync(r=>r.Id==seed.Court);var payload=JsonNode.Parse(court.Payload)!.AsObject();payload["closingTime"]="24:00";court.Update(court.Name,payload.ToJsonString());
        var past=Guid.NewGuid();db.Add(Row(past,"reservations",new{id=past,name="Visita até meia-noite",courtId=seed.Court,date="2026-10-05",startTime="23:00",endTime="24:00",status="Confirmada",amount=0}));await db.SaveChangesAsync();await service.Link(new(seed.User,"reservations",past),default);
        Assert.True((await service.Agenda(seed.User,default)).Single(a=>a.SourceId==past).CanRate);
        var request=await service.Request(seed.User,Input(seed.Court,"2026-10-08","23:00","24:00"),default);
        var confirmed=await service.Decide(request.Id,Confirm(request),default);
        Assert.Equal("24:00",(await service.Agenda(seed.User,default)).Single(a=>a.SourceId==confirmed.ReservationId).EndTime);
    }
    [PostgresFact]
    public async Task Simultaneous_acceptance_commits_one_reservation()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);var r=await service.Request(seed.User,Input(seed.Court),default);await service.Decide(r.Id,new(1,"Alternative","Proposta","2026-10-10","20:00","21:00",seed.Court,null,0),default);
        async Task<PortalRequest> Accept(){await using var other=Database();return await Service(other).Accept(seed.User,r.Id,new(2),default);}
        var results=await Task.WhenAll(Accept(),Accept());Assert.Equal(results[0].ReservationId,results[1].ReservationId);
        Assert.Equal(1,await db.OperationalRecords.CountAsync(x=>x.Id==results[0].ReservationId));
    }

    [PostgresFact]
    public async Task Availability_exposes_only_free_intervals_and_fails_closed_for_pending_hours()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);
        var block=Guid.NewGuid();var canceled=Guid.NewGuid();
        db.AddRange(Row(block,"reservations",new{id=block,name="Private block",courtId=seed.Court,date="2026-10-07",startTime="10:00",endTime="10:30",status="Bloqueio"}),
            Row(canceled,"reservations",new{id=canceled,name="Private customer",courtId=seed.Court,date="2026-10-07",startTime="09:00",endTime="09:30",status="Cancelada"}));await db.SaveChangesAsync();
        var slots=await service.Availability(new(2026,10,7),seed.Court,default);
        Assert.Equal("Available",slots.Status);Assert.Equal(new[]{new PortalFreeInterval("08:00","10:00"),new("10:30","18:00"),new("19:00","23:00")},slots.FreeIntervals);
        var serialized=JsonSerializer.Serialize(slots);Assert.DoesNotContain("Private",serialized);Assert.DoesNotContain(block.ToString(),serialized);Assert.DoesNotContain(seed.Class.ToString(),serialized);
        var today=await service.Availability(new(2026,10,6),seed.Court,default);Assert.Equal("09:01",today.FreeIntervals[0].StartTime);
        var court=await db.OperationalRecords.SingleAsync(r=>r.Id==seed.Court);var p=JsonNode.Parse(court.Payload)!.AsObject();p["scheduleConfirmed"]=false;court.Update(court.Name,p.ToJsonString());await db.SaveChangesAsync();
        var pending=await service.Availability(new(2026,10,7),seed.Court,default);Assert.Equal("Pending",pending.Status);Assert.Empty(pending.FreeIntervals);
        p["scheduleConfirmed"]=true;p["operatingDays"]=new JsonArray(1);court.Update(court.Name,p.ToJsonString());await db.SaveChangesAsync();
        var closed=await service.Availability(new(2026,10,7),seed.Court,default);Assert.Equal("Closed",closed.Status);Assert.Empty(closed.FreeIntervals);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Availability(new(2026,10,5),seed.Court,default));
    }
    [PostgresFact]
    public async Task Withdrawing_is_private_replay_safe_and_does_not_cancel_a_confirmed_reservation()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);var r=await service.Request(seed.User,Input(seed.Court),default);
        await Assert.ThrowsAsync<BarTabAccessException>(()=>service.Withdraw(seed.Other,r.Id,new(1),default));
        var withdrawn=await service.Withdraw(seed.User,r.Id,new(1),default);Assert.Equal("Withdrawn",withdrawn.Status);Assert.Equal(2,withdrawn.History!.Count);
        Assert.Equal(2,(await service.Withdraw(seed.User,r.Id,new(1),default)).Version);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Decide(r.Id,Confirm(withdrawn),default));
        var another=await service.Request(seed.User,Input(seed.Court),default);var confirmed=await service.Decide(another.Id,Confirm(another),default);
        await Assert.ThrowsAsync<BarRuleException>(()=>service.Withdraw(seed.User,confirmed.Id,new(confirmed.Version),default));
        Assert.Equal("Confirmada",(await service.Agenda(seed.User,default)).Single(a=>a.SourceId==confirmed.ReservationId).Status);
    }
    [PostgresFact]
    public async Task Confirmed_trial_reaches_only_the_assigned_teacher_without_financial_details()
    {
        await using var db=Database();var seed=await Seed(db);var service=Service(db);
        db.Add(Row(Guid.NewGuid(),"teacherLinks",new{userId=seed.Other,teamId=seed.Teacher}));await db.SaveChangesAsync();
        var r=await service.Request(seed.User,Input(seed.Court) with {Kind="Trial"},default);
        var teaching=new LongBeach.Infrastructure.Teaching.TeachingService(db,Time);
        Assert.Empty((await teaching.Overview(seed.Other,default)).Appointments!);
        var confirmed=await service.Decide(r.Id,Confirm(r,40) with {TeacherId=seed.Teacher},default);
        var appointment=Assert.Single((await teaching.Overview(seed.Other,default)).Appointments!);Assert.Equal(confirmed.ReservationId,appointment.Id);
        Assert.DoesNotContain("amount",JsonSerializer.Serialize(appointment).ToLowerInvariant());Assert.DoesNotContain("phone",JsonSerializer.Serialize(appointment).ToLowerInvariant());
        Assert.Empty((await teaching.Overview(seed.User,default)).Appointments!);
        var row=await db.OperationalRecords.SingleAsync(x=>x.Id==appointment.Id);var payload=JsonNode.Parse(row.Payload)!.AsObject();
        Assert.Equal("Trial",payload["activityKind"]!.ToString());
        payload["status"]="Chegou";row.Update(row.Name,payload.ToJsonString());await db.SaveChangesAsync();
        Assert.Equal("Chegou",Assert.Single((await teaching.Overview(seed.Other,default)).Appointments!).Status);
        payload["status"]="Cancelada";row.Update(row.Name,payload.ToJsonString());await db.SaveChangesAsync();
        Assert.Empty((await teaching.Overview(seed.Other,default)).Appointments!);
    }
}
