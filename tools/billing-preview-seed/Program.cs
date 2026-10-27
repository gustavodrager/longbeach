using LongBeach.Tools;
using System.Text.Json;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;
var cs = LocalPreview.RequireDatabase(args);
await using var db=new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(cs).Options,TimeProvider.System);
var user=await db.Users.SingleAsync(u=>u.GoogleSubject=="local-preview-client-subject");
if(await db.Set<BillingAccount>().AnyAsync(a=>a.UserId==user.Id)){Console.WriteLine("Contas da prévia já existentes; nada alterado.");return;}
var actor=(await db.Users.SingleAsync(u=>u.Email=="manager.preview@example.invalid")).Id;
var location=new StockLocation("Bar · demonstração local");var category=new BarProductCategory("Demonstração local");
var water=new BarProduct("PREVIEW-AGUA","Água mineral · demonstração","Água mineral",category.Id,"un","un",1,5,2,0,false,false,0);
var juice=new BarProduct("PREVIEW-SUCO","Suco · demonstração","Suco natural",category.Id,"un","un",1,12,4,0,false,false,1);
var tab=new BarTab(location.Id,actor,"Visita · demonstração","Tab");
var served=new BarTabItem(tab.Id,water,2,actor,false);served.Accept(DateTimeOffset.UtcNow);served.Fulfill(DateTimeOffset.UtcNow);
var preparing=new BarTabItem(tab.Id,juice,1,actor,false);preparing.Accept(DateTimeOffset.UtcNow);
var requested=new BarTabItem(tab.Id,water,1,null,true);
var paid=new BarTabPayment(tab.Id,Guid.NewGuid(),"local-fixture",5,"CardManual",actor,null,5,"DEMONSTRACAO-LOCAL");paid.ConfirmManual(DateTimeOffset.UtcNow);
var bar=new BillingAccount("Bar",tab.Id,user.Id,null,actor);
db.AddRange(location,category,water,juice,tab,served,preparing,requested,paid,bar);
foreach(var fixture in new[]{(Name:"Reserva · outubro · demonstração",Amount:180m,Status:"Pendente",Month:"",Pending:false),(Name:"Reserva · demonstração em confirmação",Amount:80m,Status:"Pendente",Month:"",Pending:true),(Name:"Reserva · setembro · demonstração",Amount:180m,Status:"Pago",Month:"",Pending:false)}){
 var source=Guid.NewGuid();var entry=Guid.NewGuid();
 db.Add(new OperationalRecord(source,"reservations",fixture.Name,JsonSerializer.Serialize(new{id=source,name=fixture.Name,status="Concluída",date="2026-09-01",startTime="06:00",endTime="07:00",amount=fixture.Amount})));
 db.Add(new OperationalRecord(entry,"financeEntries",fixture.Name,JsonSerializer.Serialize(new{id=entry,name=fixture.Name,amount=fixture.Amount,dueDate="2026-10-10",month=fixture.Month,direction="Receber",sourceKind="reservations",sourceId=source,status=fixture.Status,version=1})));
 var account=new BillingAccount("Quadra",entry,user.Id,null,actor);db.Add(account);
 if(fixture.Pending)db.Add(new BillingPayment(account.Id,Guid.NewGuid(),fixture.Amount,"Pix",user.Id,DateTimeOffset.UtcNow.AddMinutes(30)));
}
await db.SaveChangesAsync();Console.WriteLine("Contas e comanda fictícias preparadas apenas na prévia local. Nenhum provedor foi chamado.");
