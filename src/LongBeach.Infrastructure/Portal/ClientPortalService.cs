using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using LongBeach.Application.Portal;
using LongBeach.Application.Operations;
using LongBeach.Contracts.Portal;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace LongBeach.Infrastructure.Portal;

// Typed portal records share the existing operational persistence and audit boundary.
// They are not exposed through the administrative generic operations endpoints.
public sealed class ClientPortalService(LongBeachDbContext db, TimeProvider time, IConfiguration config) : IClientPortal
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private DateOnly Today => DateOnly.FromDateTime(time.GetUtcNow().ToOffset(TimeSpan.FromHours(-3)).DateTime);
    private static JsonObject Data(OperationalRecord r) => JsonNode.Parse(r.Payload)!.AsObject();
    private static string Text(JsonObject p, string k) => p[k]?.ToString() ?? "";
    private static Guid Id(JsonObject p, string k) => Guid.TryParse(Text(p,k),out var id) ? id : Guid.Empty;
    private static void Require(bool ok, string message) { if (!ok) throw new BarRuleException(message); }
    private Task Lock(CancellationToken ct) => db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)",ct);
    private static string Fingerprint<T>(T value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Serialize(value))));
    private static string AppointmentFingerprint(PortalAppointment a) => Fingerprint(new { a.Key, a.Date, a.StartTime, a.EndTime, a.Court, a.Status });
    private static string Serialize<T>(T value) => JsonSerializer.Serialize(value,Json);
    private PortalRequest WithHistory(PortalRequest before, PortalRequest after) => after with { History = (before.History ?? []).Append(new PortalUpdate(after.Status,after.Reply,after.Date,after.StartTime,after.EndTime,time.GetUtcNow())).ToArray() };
    private static PortalRequest ReadRequest(OperationalRecord r) => JsonSerializer.Deserialize<PortalRequest>(r.Payload,Json)!;
    private void Save<T>(List<OperationalRecord> records, Guid id, string kind, string name, T value)
    {
        var existing=records.SingleOrDefault(r=>r.Id==id);
        Require(existing is null || existing.Kind==kind,"Identificação já utilizada. Atualize a página.");
        if(existing is null) { var row=new OperationalRecord(id,kind,name,Serialize(value)); db.Add(row); records.Add(row); }
        else existing.Update(name,Serialize(value));
    }
    private async Task<HashSet<(string Kind, Guid Id)>> Links(Guid user, List<OperationalRecord> records, CancellationToken ct)
    {
        var result=records.Where(r=>r.Kind=="portalLinks" && Id(Data(r),"userId")==user)
            .Select(r=>(Text(Data(r),"kind"),Id(Data(r),"sourceId"))).ToHashSet();
        foreach(var account in await db.Set<BillingAccount>().AsNoTracking().Where(a=>a.UserId==user).ToListAsync(ct))
        {
            if(account.StudentId is Guid student)result.Add(("students",student));
            if(account.Kind!="Quadra")continue;
            var entry=records.SingleOrDefault(r=>r.Id==account.SourceId&&r.Kind=="financeEntries"); if(entry is null)continue;
            var p=Data(entry);var kind=Text(p,"sourceKind");var id=Id(p,"sourceId");
            if(kind=="rentalMonths") { var month=records.SingleOrDefault(r=>r.Id==id&&r.Kind==kind);if(month is not null)result.Add(("rentalGroups",Id(Data(month),"rentalGroupId"))); }
            if(kind=="reservations")result.Add((kind,id));
        }
        return result;
    }
    public async Task<PortalProfile> Profile(Guid user,CancellationToken ct)
    {
        var person=await db.Users.SingleAsync(x=>x.Id==user&&x.IsActive,ct);
        var records=await db.OperationalRecords.AsNoTracking().ToListAsync(ct);var links=await Links(user,records,ct);
        var profile=records.FirstOrDefault(r=>r.Kind=="portalProfiles"&&Id(Data(r),"userId")==user);
        var p=profile is null?new JsonObject():Data(profile);
        return new(Text(p,"name") is { Length: >0 } name?name:person.Name,person.Email.EndsWith(".invalid")?"":person.Email,Text(p,"phone"),p["reminders"]?.GetValue<bool>()??true,
            records.Where(r=>links.Contains((r.Kind,r.Id))).Select(r=>new PortalLink(r.Kind,r.Id,r.Name)).ToArray());
    }
    public async Task<PortalProfile> SaveProfile(Guid user,ProfileInput input,CancellationToken ct)
    {
        var name=BarRules.Text(input.Name,160,"Nome");var phone=input.Phone.Trim();Require(phone==""||System.Text.RegularExpressions.Regex.IsMatch(phone,"^[0-9]{10,11}$"),"Informe o telefone com DDD.");
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);
        var records=await db.OperationalRecords.Where(r=>r.Kind=="portalProfiles").ToListAsync(ct);
        var old=records.FirstOrDefault(r=>Id(Data(r),"userId")==user);
        Save(records,old?.Id??Guid.NewGuid(),"portalProfiles","Perfil do cliente",new {userId=user,name,phone,input.Reminders});
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return await Profile(user,ct);
    }
    public async Task<PortalAvailability> Availability(DateOnly date, Guid? courtId, CancellationToken ct)
    {
        Require(date >= Today && date <= Today.AddDays(365), "Escolha uma data nos próximos 12 meses.");
        var rows = await LongBeach.Infrastructure.Operations.CourtScheduleRecords.Load(db, date, ct);
        var courts = rows.Where(r => r.Kind == "courts").ToArray();
        var selected = courtId.HasValue ? courts.SingleOrDefault(r => r.Id == courtId) : courts.Length == 1 ? courts[0] : null;
        var now = time.GetUtcNow();
        if (selected is null) return new(date.ToString("yyyy-MM-dd"), null, "Pending", [], now);
        var snapshot = rows.GroupBy(r => r.Kind).ToDictionary(g => g.Key, g => g.Select(r => JsonSerializer.Deserialize<JsonElement>(r.Payload)).ToArray());
        var row = CourtScheduleQuery.Build(date, now, snapshot, false).Courts.SingleOrDefault(r => r.CourtId == selected.Id);
        if (row is null || row.SchedulePending) return new(date.ToString("yyyy-MM-dd"), selected.Id, "Pending", [], now);
        if (row.ClosedForDay || row.ClosedForMaintenance || Text(Data(selected), "status") != "Disponível")
            return new(date.ToString("yyyy-MM-dd"), selected.Id, "Closed", [], now);
        // Expose only free intervals, never identities, activity types or reservation IDs.
        var minute = date == Today ? (int)Math.Floor(now.ToOffset(TimeSpan.FromHours(-3)).TimeOfDay.TotalMinutes) + 1 : 0;
        var free = (row.FreeIntervals ?? []).Select(interval =>
        {
            CourtHours.TryMinute(interval.StartTime, false, out var start);
            CourtHours.TryMinute(interval.EndTime, true, out var end);
            return (Start: Math.Max(start, minute), End: end);
        }).Where(i => i.Start < i.End).Select(i => new PortalFreeInterval($"{i.Start / 60:00}:{i.Start % 60:00}", $"{i.End / 60:00}:{i.End % 60:00}")).ToArray();
        return new(date.ToString("yyyy-MM-dd"), selected.Id, "Available", free, now);
    }
    public async Task<PortalRequest> Withdraw(Guid user, Guid id, AcceptAlternativeInput input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(ct);
        var rows = await db.OperationalRecords.Where(r => r.Kind == "portalRequests").ToListAsync(ct);
        var row = rows.SingleOrDefault(r => r.Id == id); var request = row is null ? null : ReadRequest(row);
        if (request is null || request.UserId != user) throw new BarTabAccessException(BarTabAccessFailure.Forbidden, "Solicitação não disponível.");
        if (request.Status == "Withdrawn" && request.Version == input.Version + 1) return request;
        Require(request.Version == input.Version && request.Status is "Sent" or "Reviewing" or "Alternative", "Este pedido mudou ou já foi concluído. Atualize sua agenda.");
        var next = WithHistory(request, request with { Status = "Withdrawn", Reply = "Solicitação retirada pelo cliente.", Version = request.Version + 1, UpdatedAtUtc = time.GetUtcNow() });
        Save(rows, id, "portalRequests", row!.Name, next);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return next;
    }
    public async Task<PortalOptions> Options(CancellationToken ct, bool staff = false)
    {
        var records=await db.OperationalRecords.AsNoTracking().Where(r=>r.Kind=="courts"||r.Kind=="team").ToListAsync(ct);
        var url=config["ClientPortal:HelpUrl"];
        if(!Uri.TryCreate(url,UriKind.Absolute,out var uri)||uri.Scheme!="https")url=null;
        return new(records.Where(r=>r.Kind=="courts"&&Text(Data(r),"status")=="Disponível").Select(r=>new PortalChoice(r.Id,r.Name)).ToArray(),records.Where(r=>staff&&r.Kind=="team"&&Text(Data(r),"status")!="Inativo").Select(r=>new PortalChoice(r.Id,r.Name)).ToArray(),url);
    }
    public async Task<IReadOnlyList<PortalAppointment>> Agenda(Guid user,CancellationToken ct)
    {
        var records=await db.OperationalRecords.AsNoTracking().ToListAsync(ct);return await BuildAgenda(user,records,ct);
    }
    private async Task<List<PortalAppointment>> BuildAgenda(Guid user,List<OperationalRecord> rows,CancellationToken ct)
    {
        var links=await Links(user,rows,ct);var result=new List<PortalAppointment>();
        var requests=rows.Where(r=>r.Kind=="portalRequests").Select(ReadRequest).Where(r=>r.UserId==user&&r.Status=="Confirmed").ToArray();
        var linkedReservations=requests.Where(r=>r.ReservationId.HasValue).Select(r=>r.ReservationId!.Value).ToHashSet();
        var exceptions=rows.Where(r=>r.Kind=="portalExceptions"&&Id(Data(r),"userId")==user).Select(Data).ToDictionary(p=>Text(p,"key"));
        var ratings=rows.Where(r=>r.Kind=="portalRatings"&&Id(Data(r),"userId")==user).Select(Data).ToDictionary(p=>Text(p,"key"),p=>p["score"]!.GetValue<int>());
        string Name(string kind,Guid id)=>rows.FirstOrDefault(r=>r.Kind==kind&&r.Id==id)?.Name??"A confirmar";
        void Add(string key,OperationalRecord source,JsonObject p,string kind,string date,string title,string status)
        {
            if(!DateOnly.TryParseExact(date,"yyyy-MM-dd",out var day)||day<Today.AddDays(-30)||day>Today.AddDays(60))return;
            if(exceptions.ContainsKey(key))status="Cancelada";
            var midnight=new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue),TimeSpan.FromHours(-3));
            var started=CourtHours.TryMinute(Text(p,"startTime"),false,out var begins)&&midnight.AddMinutes(begins)<=time.GetUtcNow();
            var past=CourtHours.TryMinute(Text(p,"endTime"),true,out var end)&&midnight.AddMinutes(end)<time.GetUtcNow();
            result.Add(new(key,source.Id,kind,title,date,Text(p,"startTime"),Text(p,"endTime"),Name("courts",Id(p,"courtId")),Id(p,"teacherId")==Guid.Empty?"":Name("team",Id(p,"teacherId")),status,
                "Chegue alguns minutos antes. Para ajustes, envie uma solicitação à equipe.",!started&&status is not ("Cancelada" or "Concluída"),past&&status!="Cancelada"&&!ratings.ContainsKey(key),ratings.GetValueOrDefault(key,0) is var score&&score>0?score:null,Text(p,"activityKind")));
        }
        foreach(var r in rows.Where(r=>r.Kind=="reservations"))
        {
            var p=Data(r);if(!links.Contains(("reservations",r.Id))&&!links.Contains(("rentalGroups",Id(p,"rentalGroupId")))&&!linkedReservations.Contains(r.Id))continue;
            Add($"reservation:{r.Id}",r,p,"Reserva",Text(p,"date"),r.Name,Text(p,"status"));
        }
        foreach(var enrollment in rows.Where(r=>r.Kind=="enrollments"))
        {
            var e=Data(enrollment);if(!links.Contains(("students",Id(e,"studentId"))))continue;
            var cls=rows.FirstOrDefault(r=>r.Kind=="classes"&&r.Id==Id(e,"classId"));if(cls is null)continue;
            var p=Data(cls);if(Text(p,"status")!="Ativa")continue;
            for(var day=Today.AddDays(-30);day<=Today.AddDays(60);day=day.AddDays(1))
            {
                var date=day.ToString("yyyy-MM-dd");
                if((int)day.DayOfWeek!=p["weekDay"]?.GetValue<int>()||string.CompareOrdinal(date,Text(e,"startDate"))<0||string.CompareOrdinal(date,Text(p,"startDate"))<0)continue;
                if(Text(e,"status")!="Ativa"&&(Text(e,"endDate")==""||string.CompareOrdinal(date,Text(e,"endDate"))>0))continue;
                Add($"class:{enrollment.Id}:{date}",cls,p,"Aula",date,cls.Name,"Confirmada");
            }
        }
        return result.OrderBy(a=>a.Date).ThenBy(a=>a.StartTime).ToList();
    }
    public async Task<IReadOnlyList<PortalRequest>> Requests(Guid? user,CancellationToken ct) => (await db.OperationalRecords.AsNoTracking().Where(r=>r.Kind=="portalRequests").ToListAsync(ct)).Select(ReadRequest).Where(r=>user is null||r.UserId==user).OrderByDescending(r=>r.UpdatedAtUtc).ToArray();
    private void ValidateSlot(string date,string start,string end)
    {
        Require(DateOnly.TryParseExact(date,"yyyy-MM-dd",out var day)&&day>=Today&&day<=Today.AddDays(365),"Escolha uma data futura, nos próximos 12 meses.");
        Require(CourtHours.TryMinute(start,false,out var a)&&CourtHours.TryMinute(end,true,out var b)&&b>a,"Confira o horário de início e término.");
        Require(DateTimeOffset.Parse($"{date}T{start}:00-03:00")>time.GetUtcNow(),"Escolha um horário que ainda não começou.");
    }
    public async Task<PortalRequest> Request(Guid user,RequestInput input,CancellationToken ct)
    {
        Require(input.OperationId!=Guid.Empty&&new[]{"Trial","Reservation","Reschedule","Cancellation","Help"}.Contains(input.Kind),"Escolha o tipo da solicitação.");
        Require(input.Message is { Length: <=1000 },"Use até 1.000 caracteres na mensagem.");
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);
        var records=await db.OperationalRecords.ToListAsync(ct);
        var existing=records.FirstOrDefault(r=>r.Id==input.OperationId);
        if(existing is not null)
        {
            Require(existing.Kind=="portalRequests","Identificação já utilizada.");var saved=ReadRequest(existing);
            var intent=records.FirstOrDefault(r=>r.Kind=="portalIntents"&&Id(Data(r),"operationId")==input.OperationId);
            Require(saved.UserId==user&&intent is not null&&Text(Data(intent),"fingerprint")==Fingerprint(input),"Solicitação já utilizada. Confira seu histórico.");return saved;
        }
        string? originalFingerprint=null;
        if(input.Kind is "Reschedule" or "Cancellation")
        {
            var appointment=(await BuildAgenda(user,records,ct)).SingleOrDefault(a=>a.Key==input.AppointmentKey);
            Require(appointment?.CanChange==true,"Este compromisso não está disponível para alteração.");
            originalFingerprint=AppointmentFingerprint(appointment!);
            Require(!records.Where(r=>r.Kind=="portalRequests").Select(ReadRequest).Any(r=>r.UserId==user&&r.AppointmentKey==input.AppointmentKey&&r.Status is "Sent" or "Reviewing" or "Alternative"),"Já existe uma solicitação para este compromisso.");
        }
        else Require(string.IsNullOrEmpty(input.AppointmentKey),"Escolha uma solicitação sem compromisso vinculado.");
        if(input.Kind is "Trial" or "Reservation" or "Reschedule")ValidateSlot(input.Date,input.StartTime,input.EndTime);
        var courtId = input.CourtId;
        if (input.Kind is "Trial" or "Reservation" or "Reschedule")
        {
            var courts = records.Where(r => r.Kind == "courts" && Text(Data(r), "status") == "Disponível").ToArray();
            if (!courtId.HasValue && courts.Length == 1) courtId = courts[0].Id;
            Require(!courtId.HasValue || courts.Any(r => r.Id == courtId), "A quadra indicada não está disponível para pedidos. Atualize a página.");
        }
        var name=(await Profile(user,ct)).Name;
        var request=new PortalRequest(input.OperationId,user,name,input.Kind,input.AppointmentKey,input.Date,input.StartTime,input.EndTime,courtId,input.Message,"Sent","",1,time.GetUtcNow(),time.GetUtcNow());
        request=WithHistory(request,request);
        Save(records,Guid.NewGuid(),"portalIntents","Identidade da solicitação",new {operationId=input.OperationId,userId=user,fingerprint=Fingerprint(input),originalFingerprint});
        Save(records,request.Id,"portalRequests","Solicitação do cliente",request);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return request;
    }
    public async Task<PortalRequest> Decide(Guid id,RequestDecision input,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);var rows=await db.OperationalRecords.ToListAsync(ct);
        var row=rows.SingleOrDefault(r=>r.Kind=="portalRequests"&&r.Id==id);Require(row is not null,"Solicitação não encontrada.");var request=ReadRequest(row!);
        Require(request.Version==input.Version,"Esta solicitação mudou. Atualize antes de responder.");
        Require((request.History?.Count??0)<50,"Esta solicitação já possui muitas alterações. Conclua o atendimento com a equipe.");
        Require(request.Status is "Sent" or "Reviewing" or "Alternative","Solicitação já concluída.");
        Require(request.Status!="Alternative"||input.Action is "Alternative" or "Declined","A alternativa precisa ser aceita pelo cliente.");
        Require(new[]{"Reviewing","Declined","Alternative","Confirmed"}.Contains(input.Action),"Escolha uma resposta válida.");
        var reply=BarRules.Text(input.Reply,1000,"Resposta ao cliente");
        if(input.Action=="Alternative")Require(request.Kind is "Trial" or "Reservation" or "Reschedule","Este pedido não aceita alternativa de horário.");
        var next=request with { Status=input.Action,Reply=reply,Date=input.Date??request.Date,StartTime=input.StartTime??request.StartTime,EndTime=input.EndTime??request.EndTime,CourtId=input.CourtId??request.CourtId,TeacherId=input.TeacherId??request.TeacherId,Amount=input.Amount??request.Amount,Version=request.Version+1,UpdatedAtUtc=time.GetUtcNow() };
        if(input.Action is "Reviewing" or "Declined")next=request with {Status=input.Action,Reply=reply,Version=request.Version+1,UpdatedAtUtc=time.GetUtcNow()};
        if(input.Action=="Alternative") { ValidateSlot(next.Date,next.StartTime,next.EndTime);Require(next.CourtId.HasValue&&next.Amount>=0,"Defina a quadra e o valor da alternativa."); }
        if(input.Action=="Confirmed")
        {
            if(request.Kind is "Trial" or "Reservation" or "Reschedule")Require(next.Date==request.Date&&next.StartTime==request.StartTime&&next.EndTime==request.EndTime,"Envie uma alternativa para o cliente aceitar a mudança de horário.");
            next=await Apply(rows,next,ct);
        }
        next=WithHistory(request,next);
        Save(rows,id,"portalRequests",row!.Name,next);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return next;
    }
    public async Task<PortalRequest> Accept(Guid user,Guid id,AcceptAlternativeInput input,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);var rows=await db.OperationalRecords.ToListAsync(ct);
        var row=rows.FirstOrDefault(r=>r.Kind=="portalRequests"&&r.Id==id);var request=row is null?null:ReadRequest(row);
        if(request is null||request.UserId!=user)throw new BarTabAccessException(BarTabAccessFailure.Forbidden,"Solicitação não disponível.");
        if(request.Status=="Confirmed"&&request.Version==input.Version+1)return request;
        Require(request.Status=="Alternative"&&request.Version==input.Version,"Esta proposta mudou. Confira a resposta mais recente.");
        var next=await Apply(rows,request with {Status="Confirmed",Version=request.Version+1,UpdatedAtUtc=time.GetUtcNow()},ct);
        next=WithHistory(request,next);
        Save(rows,id,"portalRequests",row!.Name,next);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return next;
    }
    private async Task<PortalRequest> Apply(List<OperationalRecord> rows,PortalRequest request,CancellationToken ct)
    {
        if(request.Kind=="Help")return request;
        PortalAppointment? original=null;
        if(request.Kind is "Reschedule" or "Cancellation")
        {
            original=(await BuildAgenda(request.UserId,rows,ct)).SingleOrDefault(a=>a.Key==request.AppointmentKey);
            Require(original?.CanChange==true,"O compromisso original mudou. Confira a agenda.");
            var intent=rows.FirstOrDefault(r=>r.Kind=="portalIntents"&&Id(Data(r),"operationId")==request.Id);
            Require(intent is not null&&Text(Data(intent),"originalFingerprint")==AppointmentFingerprint(original!),"O compromisso mudou desde a solicitação. Recuse este pedido e peça ao cliente uma nova solicitação.");
        }
        if(request.Kind=="Cancellation")
        {
            if(original!.Kind=="Reserva") { var r=rows.Single(r=>r.Id==original.SourceId);var canceled=Data(r);canceled["status"]="Cancelada";canceled["version"]=(canceled["version"]?.GetValue<int>()??0)+1;r.Update(r.Name,canceled.ToJsonString()); }
            else Save(rows,Guid.NewGuid(),"portalExceptions","Ausência confirmada",new {userId=request.UserId,key=original.Key,requestId=request.Id});
            return request;
        }
        if(original?.Kind=="Aula"&&request.TeacherId is null)
            request=request with {TeacherId=Id(Data(rows.Single(r=>r.Id==original.SourceId)),"teacherId")};
        ValidateSlot(request.Date,request.StartTime,request.EndTime);
        if (!request.CourtId.HasValue)
        {
            var courts = rows.Where(r => r.Kind == "courts" && Text(Data(r), "status") == "Disponível").ToArray();
            if (courts.Length == 1) request = request with { CourtId = courts[0].Id };
        }
        Require(request.CourtId.HasValue&&request.Amount>=0,"Defina a quadra e o valor combinado, inclusive zero quando gratuito.");
        var court=rows.FirstOrDefault(r=>r.Id==request.CourtId&&r.Kind=="courts");Require(court is not null&&Data(court)["scheduleConfirmed"]?.GetValue<bool>()!=false,"Confira a agenda da quadra antes de confirmar.");
        if(request.Kind=="Trial")Require(request.TeacherId.HasValue&&rows.Any(r=>r.Id==request.TeacherId&&r.Kind=="team"&&Text(Data(r),"status")!="Inativo"),"Escolha o professor da aula experimental.");
        var id=original?.Kind=="Reserva"?original.SourceId:Guid.NewGuid();
        var old=rows.SingleOrDefault(r=>r.Id==id);var p=old is null?new JsonObject():Data(old);
        if(old is not null)
        {
            Require(p["amount"]?.GetValue<decimal>()==request.Amount,"A remarcação preserva o valor original. Trate ajustes pelo financeiro.");
            Require(Id(p,"rentalGroupId")==Guid.Empty||Text(p,"date")[..7]==request.Date[..7],"A remarcação do mensalista deve permanecer no mesmo mês.");
        }
        if(request.TeacherId.HasValue)Require(rows.Any(r=>r.Kind=="team"&&r.Id==request.TeacherId&&Text(Data(r),"status")!="Inativo"),"Professor não encontrado.");
        if (request.Kind == "Trial") p["activityKind"] = "Trial";
        p["id"]=id.ToString();p["name"]=request.Kind=="Trial"?$"Aula experimental · {request.CustomerName}":old?.Name??$"Reserva · {request.CustomerName}";
        p["courtId"]=request.CourtId.ToString();p["date"]=request.Date;p["startTime"]=request.StartTime;p["endTime"]=request.EndTime;
        p["customerName"]=request.CustomerName;p["phone"]=(await Profile(request.UserId,ct)).Phone;p["amount"]=request.Amount;p["status"]="Confirmada";p["notes"]=request.Reply;
        if(request.TeacherId.HasValue)p["teacherId"]=request.TeacherId.ToString();
        p["version"]=(p["version"]?.GetValue<int>()??0)+1;
        var snapshot=rows.GroupBy(r=>r.Kind).ToDictionary(g=>g.Key,g=>g.Select(r=>JsonSerializer.Deserialize<JsonElement>(r.Payload)).ToArray());
        if(request.TeacherId.HasValue)
        {
            var day=DateOnly.ParseExact(request.Date,"yyyy-MM-dd");
            bool Overlaps(JsonObject other)=>string.CompareOrdinal(Text(other,"startTime"),request.EndTime)<0&&string.CompareOrdinal(Text(other,"endTime"),request.StartTime)>0;
            Require(!rows.Where(r=>r.Kind is "classes" or "reservations" && r.Id!=id).Select(Data).Any(other=>Id(other,"teacherId")==request.TeacherId&&Overlaps(other)&&
                (Text(other,"date")==request.Date&&Text(other,"status")!="Cancelada"||other["weekDay"] is not null&&other["weekDay"]!.GetValue<int>()==(int)day.DayOfWeek&&Text(other,"status")=="Ativa"&&string.CompareOrdinal(Text(other,"startDate"),request.Date)<=0)),"O professor já tem uma atividade neste horário.");
        }
        var error=OperationalValidation.Validate("reservations",id,JsonSerializer.SerializeToElement(p),snapshot,Today);Require(error is null,error??"");
        Save(rows,id,"reservations",Text(p,"name"),p);
        if(original?.Kind=="Aula")Save(rows,Guid.NewGuid(),"portalExceptions","Aula remarcada",new {userId=request.UserId,key=original.Key,requestId=request.Id});
        return request with {ReservationId=id};
    }
    public async Task Link(LinkInput input,CancellationToken ct)
    {
        Require(new[]{"students","reservations","rentalGroups"}.Contains(input.Kind),"Escolha aluno, reserva ou grupo.");
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);var rows=await db.OperationalRecords.ToListAsync(ct);
        Require(await db.Users.AnyAsync(u=>u.Id==input.UserId&&u.IsActive,ct)&&rows.Any(r=>r.Kind==input.Kind&&r.Id==input.SourceId),"Confira o usuário e o cadastro.");
        var links=rows.Where(r=>r.Kind=="portalLinks").Select(Data).Where(p=>Text(p,"kind")==input.Kind&&Id(p,"sourceId")==input.SourceId).ToArray();
        Require(!links.Any(p=>Id(p,"userId")!=input.UserId),"Este cadastro já está vinculado a outro cliente.");
        foreach(var other in await db.Set<BillingAccount>().Where(a=>a.UserId!=input.UserId).Select(a=>a.UserId).Distinct().ToListAsync(ct))
            Require(!(await Links(other,rows,ct)).Contains((input.Kind,input.SourceId)),"Este cadastro já está vinculado a outro responsável financeiro.");
        var billed=await db.Set<BillingAccount>().AsNoTracking().ToListAsync(ct);
        if(input.Kind=="students")Require(!billed.Any(a=>a.StudentId==input.SourceId&&a.UserId!=input.UserId),"Este aluno já está vinculado a outro responsável.");
        if(links.Length==0)Save(rows,Guid.NewGuid(),"portalLinks","Vínculo do cliente",input);
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
    }
    public async Task<PortalCandidates> Candidates(CancellationToken ct) => new(await db.Users.Where(u=>u.IsActive).OrderBy(u=>u.Name).Select(u=>new PortalChoice(u.Id,u.Name)).ToArrayAsync(ct),await db.OperationalRecords.Where(r=>r.Kind=="students"||r.Kind=="reservations"||r.Kind=="rentalGroups").OrderBy(r=>r.Name).Select(r=>new PortalLink(r.Kind,r.Id,r.Name)).ToArrayAsync(ct));
    public async Task Rate(Guid user,RatingInput input,CancellationToken ct)
    {
        Require(input.Score is >=1 and <=5,"Escolha uma nota entre 1 e 5.");
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);var rows=await db.OperationalRecords.ToListAsync(ct);
        var prior=rows.FirstOrDefault(r=>r.Kind=="portalRatings"&&Id(Data(r),"userId")==user&&Text(Data(r),"key")==input.AppointmentKey);
        if(prior is not null) { Require(Data(prior)["score"]!.GetValue<int>()==input.Score,"Avaliação já enviada.");return; }
        Require((await BuildAgenda(user,rows,ct)).Any(a=>a.Key==input.AppointmentKey&&a.CanRate),"A avaliação fica disponível depois da atividade.");
        Save(rows,Guid.NewGuid(),"portalRatings","Avaliação de visita",new {userId=user,key=input.AppointmentKey,input.Score});await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
    }
}
