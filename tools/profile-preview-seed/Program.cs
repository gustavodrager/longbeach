using LongBeach.Tools;
using System.Text.Json;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Infrastructure.Security;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Teaching;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
var cs = LocalPreview.RequireDatabase(args);
var previewPassword = LocalPreview.RequirePassword();
await using var db=new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(cs).Options,TimeProvider.System);await db.Database.MigrateAsync();
var permissions=new Dictionary<string,Permission>();foreach(var name in SystemPermissions.All){var p=await db.Permissions.SingleOrDefaultAsync(x=>x.Name==name);if(p is null){p=new Permission(name);db.Add(p);}permissions[name]=p;}
var roles=new Dictionary<string,Role>();foreach(var name in SystemRoles.All){var role=await db.Roles.Include(r=>r.RolePermissions).SingleOrDefaultAsync(r=>r.Name==name);if(role is null){role=new Role(name);db.Add(role);}foreach(var p in ProfileAccess.Grants[name])role.Grant(permissions[p]);roles[name]=role;}
var hash=new AspNetIdentityPasswordHasher(Options.Create(new PasswordHasherOptions()));
User Person(string name,string email,string role){var u=User.Create(name,email,hash.Hash(previewPassword));u.AssignRole(roles[role]);db.Add(u);return u;}
Person("Gestão · demonstração","manager.preview@example.invalid",SystemRoles.Manager);var teacher=Person("Marina · professora","teacher.preview@example.invalid",SystemRoles.Teacher);Person("Lucas · atendimento","operator.preview@example.invalid",SystemRoles.Operations);var student=Person("Ana · cliente","student.preview@example.invalid",SystemRoles.Student);
void Row(Guid id,string kind,string name,object data)=>db.Add(new OperationalRecord(id,kind,name,JsonSerializer.Serialize(data)));
var team=Guid.NewGuid();var court=Guid.NewGuid();var aluno=Guid.NewGuid();var aluno2=Guid.NewGuid();
Row(team,"team","Marina · professora",new{id=team,name="Marina · professora",status="Ativo",role="Professora",paymentFrequency="Mensal",payAmount=(decimal?)null,payBasis="A combinar",notes="Demonstração",phone=""});
Row(court,"courts","Arena",new{id=court,name="Arena",sport="Futevôlei",status="Disponível",openingTime="06:00",closingTime="24:00",operatingDays=new[]{0,1,2,3,4,5,6},scheduleConfirmed=true});
foreach(var (id,name) in new[]{(aluno,"Ana · demonstração"),(aluno2,"Bruno · demonstração")})Row(id,"students",name,new{id,name,status="Ativo",monthlyAmount=200,phone="",weeklyLessons=2,weekdays="Terça e sábado",time1="08:00",time2="",notes="Dados fictícios"});
var today=DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(-3)).DateTime);
foreach(var (weekday,start,end,name) in new[]{((int)today.DayOfWeek,"08:00","09:00","Futevôlei · Iniciantes"),((int)today.DayOfWeek,"17:00","18:00","Futevôlei · Intermediário"),(((int)today.DayOfWeek+2)%7,"19:00","20:00","Futevôlei · Turma da noite")}){var cls=Guid.NewGuid();Row(cls,"classes",name,new{id=cls,name,courtId=court,teacherId=team,weekDay=weekday,startTime=start,endTime=end,startDate="2026-10-01",status="Ativa",capacity=6,studentIds=Array.Empty<Guid>(),notes="Turma demonstrativa"});foreach(var id in new[]{aluno,aluno2}){var enrollment=Guid.NewGuid();Row(enrollment,"enrollments","Matrícula de demonstração",new{id=enrollment,name="Matrícula de demonstração",studentId=id,classId=cls,startDate="2026-10-01",status="Ativa",monthlyAmount=200});}}
var link=Guid.NewGuid();Row(link,"portalLinks","Cadastro pessoal",new{id=link,userId=student.Id,kind="students",sourceId=aluno});
await db.SaveChangesAsync();await new TeachingService(db,TimeProvider.System).Link(new(teacher.Id,team),default);Console.WriteLine("Prévia isolada preparada com quatro perfis fictícios.");
