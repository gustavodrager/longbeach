using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
namespace LongBeach.IntegrationTests;
public sealed class BarTabsPostgresTests
{
    private const string ConnectionVariable="LONG_BEACH_TEST_DATABASE_URL";
    [PostgresFact]
    public async Task Delivery_and_mixed_partial_receipts_are_separate_and_replay_once()
    {
        await using var f=await Fixture.Create();
        var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id,"Visitante"),f.Actor,default);
        var add=new AddTabItemsInput(Guid.NewGuid(),[new(f.Product.Id,2)],true);
        tab=await f.Tabs.Add(tab.Id,add,f.Actor,null,default); var item=Assert.Single(tab.Items);
        Assert.Equal("Fulfilled",item.State); Assert.Equal(20,tab.Total);
        Assert.Equal(item.Id,Assert.Single((await f.Tabs.Add(tab.Id,add,f.Actor,null,default)).Items).Id);
        var cash=new TabPaymentInput(Guid.NewGuid(),"Cash",7,f.Session.Id,20);
        var received=await f.Tabs.Pay(tab.Id,cash,f.Actor,null,default);
        Assert.Equal(received.Id,(await f.Tabs.Pay(tab.Id,cash,f.Actor,null,default)).Id);
        await Assert.ThrowsAsync<BarRuleException>(()=>f.Tabs.Pay(tab.Id,cash with { Amount=8 },f.Actor,null,default));
        var secondActor=Guid.NewGuid(); var secondRegister=new CashRegister("Segundo "+Guid.NewGuid()); var secondCash=new CashSession(secondRegister.Id,f.Location.Id,secondActor,"Segundo tablet",100);
        f.Db.AddRange(secondRegister,secondCash,CashMovement.Opening(secondCash,secondActor)); await f.Db.SaveChangesAsync();
        await f.Tabs.Pay(tab.Id,new(Guid.NewGuid(),"Cash",5,secondCash.Id),secondActor,null,default);
        await f.Tabs.Pay(tab.Id,new(Guid.NewGuid(),"CardManual",8,CardApproved:true),f.Actor,null,default);
        Assert.Equal(105,(await f.Db.Set<CashSession>().SingleAsync(x=>x.Id==secondCash.Id)).Expected);
        tab=await f.Tabs.Get(tab.Id,false,default); Assert.Equal(0,tab.Due); Assert.Equal(20,tab.Paid);
        Assert.Equal(18,(await f.Db.Set<StockBalance>().SingleAsync(x=>x.ProductId==f.Product.Id&&x.LocationId==f.Location.Id)).Quantity);
        Assert.Equal(1,await f.Db.Set<StockMovement>().CountAsync(x=>x.OriginId==item.Id&&x.Kind=="TabDelivery"));
        Assert.Equal(107,(await f.Db.Set<CashSession>().SingleAsync(x=>x.Id==f.Session.Id)).Expected);
        var close=new TabActionInput(Guid.NewGuid()); await f.Tabs.Close(tab.Id,close,f.Actor,default); Assert.Equal("Closed",(await f.Tabs.Close(tab.Id,close,f.Actor,default)).State);
    }
    [PostgresFact]
    public async Task Qr_request_does_not_charge_or_reserve_and_token_cannot_operate_another_tab()
    {
        await using var f=await Fixture.Create(); var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default);
        var access=await f.Tabs.IssueAccess(tab.Id,new(Guid.NewGuid()),f.Actor,default);
        tab=await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,2)],true),null,access.Token,default);
        var item=Assert.Single(tab.Items); Assert.Equal("Requested",item.State); Assert.Equal(0,tab.Total);
        var balance=await f.Db.Set<StockBalance>().SingleAsync(x=>x.ProductId==f.Product.Id&&x.LocationId==f.Location.Id); Assert.Equal(0,balance.Reserved); Assert.Equal(20,balance.Quantity);
        var other=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default);
        var forbidden=await Assert.ThrowsAsync<BarTabAccessException>(()=>f.Tabs.Add(other.Id,new(Guid.NewGuid(),[new(f.Product.Id,1)]),null,access.Token,default)); Assert.Equal(BarTabAccessFailure.Forbidden,forbidden.Failure);
        await f.Tabs.ItemAction(tab.Id,item.Id,"accept",new(Guid.NewGuid()),f.Actor,false,default);
        Assert.Equal(2,(await f.Db.Set<StockBalance>().SingleAsync(x=>x.Id==balance.Id)).Reserved);
        await f.Tabs.ItemAction(tab.Id,item.Id,"fulfill",new(Guid.NewGuid()),f.Actor,false,default);
        var client=await f.Tabs.Client(access.Token,default); Assert.Null(Assert.Single(client.Items).ActorId); Assert.Null(Assert.Single(client.Items).UnitCost); Assert.Equal(Guid.Empty,client.ActorId);
        await f.Tabs.RevokeAccess(tab.Id,new(Guid.NewGuid()),f.Actor,default);
        var denied=await Assert.ThrowsAsync<BarTabAccessException>(()=>f.Tabs.Client(access.Token,default)); Assert.Equal(BarTabAccessFailure.ExpiredOrRevoked,denied.Failure);
    }
    [PostgresFact]
    public async Task Prepared_products_wait_for_delivery_and_atomic_cart_failure_does_not_reserve()
    {
        await using var f=await Fixture.Create(); f.Product.SetPreparation(true); await f.Db.SaveChangesAsync();
        var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default);
        tab=await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,2)],true),f.Actor,null,default); Assert.Equal("Accepted",Assert.Single(tab.Items).State);
        var invalid=new AddTabItemsInput(Guid.NewGuid(),[new(f.Product.Id,1),new(Guid.NewGuid(),1)],true);
        await Assert.ThrowsAsync<BarRuleException>(()=>f.Tabs.Add(tab.Id,invalid,f.Actor,null,default));
        Assert.Single((await f.Tabs.Get(tab.Id,false,default)).Items);
        Assert.Equal(2,(await f.Db.Set<StockBalance>().SingleAsync(x=>x.ProductId==f.Product.Id&&x.LocationId==f.Location.Id)).Reserved);
        await Assert.ThrowsAsync<BarRuleException>(()=>f.Tabs.Close(tab.Id,new(Guid.NewGuid()),f.Actor,default));
    }
    [PostgresFact]
    public async Task Cash_is_owned_by_actor_and_open_close_operations_replay_after_connection_uncertainty()
    {
        await using var f=await Fixture.Create(); var another=Guid.NewGuid(); var register=new CashRegister(Guid.NewGuid().ToString()); f.Db.Add(register); await f.Db.SaveChangesAsync();
        var input=new OpenCashInput(register.Id,f.Location.Id,"outro",100,Guid.NewGuid()); var cash=new BarCashService(f.Db);
        var session=await cash.Open(input,another,default); Assert.Equal(session.Id,(await cash.Open(input,another,default)).Id);
        await Assert.ThrowsAsync<BarRuleException>(()=>cash.Move(session.Id,new(5,"Suprimento",Guid.NewGuid()),"Supply",f.Actor,default));
        var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default); await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,1)],true),f.Actor,null,default);
        await Assert.ThrowsAsync<BarRuleException>(()=>f.Tabs.Pay(tab.Id,new(Guid.NewGuid(),"Cash",10,session.Id),f.Actor,null,default));
        var close=new CloseCashInput(99,"Falta física",Guid.NewGuid());
        await Assert.ThrowsAsync<BarRuleException>(()=>cash.Close(session.Id,close,another,false,default));
        var closing=await cash.Close(session.Id,close,f.Actor,true,default); Assert.Equal(closing.Id,(await cash.Close(session.Id,close,f.Actor,true,default)).Id);
        Assert.Equal("Falta física",closing.Reason); Assert.Equal(1,await f.Db.Set<CashClosing>().CountAsync(x=>x.SessionId==session.Id));
    }
    [PostgresFact]
    public async Task Pix_intent_survives_timeout_reserves_amount_and_requires_authoritative_provider_approval()
    {
        await using var f=await Fixture.Create(); var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default); await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,2)],true),f.Actor,null,default);
        var input=new TabPaymentInput(Guid.NewGuid(),"Pix",12,Name:"Pagador de teste",Email:"teste@example.invalid",TaxId:"12345678901"); f.Gateway.TimeoutAfterCreate=true;
        await Assert.ThrowsAsync<BarPaymentConfirmationPendingException>(()=>f.Tabs.Pay(tab.Id,input,f.Actor,null,default));
        var current=await f.Tabs.Get(tab.Id,false,default); Assert.Equal(12,current.Pending); Assert.Equal(8,current.Payable); Assert.Equal(0,current.Paid);
        await Assert.ThrowsAsync<BarRuleException>(()=>f.Tabs.Pay(tab.Id,new(Guid.NewGuid(),"Cash",20,f.Session.Id),f.Actor,null,default));
        f.Gateway.TimeoutAfterCreate=false; var payment=await f.Tabs.Pay(tab.Id,input with { Name="Outro dado para retomar" },f.Actor,null,default); Assert.Equal("Pending",payment.State); Assert.Equal(1,f.Gateway.Created);
        f.Gateway.State="PAID"; f.Gateway.MismatchedAmount=true; await Assert.ThrowsAsync<BarPaymentConfirmationPendingException>(()=>f.Tabs.Refresh(tab.Id,payment.Id,f.Actor,null,default)); Assert.Equal(0,(await f.Tabs.Get(tab.Id,false,default)).Paid);
        f.Gateway.MismatchedAmount=false; payment=await f.Tabs.Refresh(tab.Id,payment.Id,f.Actor,null,default); Assert.Equal("Approved",payment.State);
        Assert.Equal(100,(await f.Db.Set<CashSession>().SingleAsync(x=>x.Id==f.Session.Id)).Expected);
        Assert.Equal(1,await f.Db.Set<BarTabPayment>().CountAsync(x=>x.OperationId==input.OperationId));
        Assert.Equal(0,await f.Db.Set<CashMovement>().CountAsync(x=>x.OriginId==payment.Id));
    }
    [PostgresFact]
    public async Task Supervisor_adjustment_and_refund_preserve_original_consumption_and_closed_cash_rejects_atomically()
    {
        await using var f=await Fixture.Create(); var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default); await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,2)],true),f.Actor,null,default);
        var discount=new TabAdjustmentInput(Guid.NewGuid(),"Discount",5,"Desconto autorizado"); tab=await f.Tabs.Adjust(tab.Id,discount,f.Actor,default); Assert.Equal(20,tab.Gross); Assert.Equal(5,tab.Discount); Assert.Equal(15,tab.Total);
        Assert.Equal(5,(await f.Tabs.Adjust(tab.Id,discount,f.Actor,default)).Discount);
        var payment=await f.Tabs.Pay(tab.Id,new(Guid.NewGuid(),"Cash",15,f.Session.Id),f.Actor,null,default); await f.Tabs.Close(tab.Id,new(Guid.NewGuid()),f.Actor,default);
        var cash=new BarCashService(f.Db); await cash.Close(f.Session.Id,new(115,null,Guid.NewGuid()),f.Actor,false,default);
        var refund=new TabRefundInput(Guid.NewGuid(),3,"Estorno aprovado");
        await Assert.ThrowsAsync<BarRuleException>(()=>f.Tabs.Refund(tab.Id,payment.Id,refund,f.Actor,default)); Assert.False(await f.Db.Set<BarTabRefund>().AnyAsync(x=>x.OperationId==refund.OperationId));
        await cash.Reopen(f.Session.Id,"Reabertura para estorno",f.Actor,default);
        await f.Tabs.Refund(tab.Id,payment.Id,refund,f.Actor,default); await f.Tabs.Refund(tab.Id,payment.Id,refund,f.Actor,default);
        tab=await f.Tabs.Get(tab.Id,false,default); Assert.Equal("Open",tab.State); Assert.Equal(3,tab.Due); Assert.Equal(20,tab.Gross); Assert.Equal(1,await f.Db.Set<CashMovement>().CountAsync(x=>x.Kind=="TabRefund"&&x.OriginId!=Guid.Empty&&x.SessionId==f.Session.Id));
        tab=await f.Tabs.Adjust(tab.Id,new(Guid.NewGuid(),"Courtesy",0,"Cortesia da diferença"),f.Actor,default); Assert.Equal(0,tab.Due); Assert.Equal(8,tab.Discount);
    }
    [PostgresFact]
    public async Task Report_totals_pages_and_original_resources_use_the_same_persisted_facts()
    {
        await using var f=await Fixture.Create(); var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default); await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,2)],true),f.Actor,null,default);
        var payment=await f.Tabs.Pay(tab.Id,new(Guid.NewGuid(),"Cash",20,f.Session.Id),f.Actor,null,default); await f.Tabs.Reconcile(tab.Id,payment.Id,new(Guid.NewGuid(),0,"Extrato de teste"),f.Actor,default);
        var from=DateTimeOffset.UtcNow.AddDays(-1); var to=DateTimeOffset.UtcNow.AddDays(1);
        foreach(var metric in new[]{"open-tabs","orders","pending-payments","consumption","received","refunds","fees","low-stock","cash-differences","receivable","cash"})
        {
            var report=await f.Tabs.Report(metric,from,to,1,2,default); Assert.Equal(metric,report.Metric); Assert.True(report.Rows.Items.Count<=2);
            if(metric=="received") foreach(var row in report.Rows.Items) Assert.Contains(row.Detail,new[]{"Dinheiro","Cartão aprovado na maquininha","Pix confirmado"});
            if(metric=="orders") foreach(var row in report.Rows.Items) {Assert.DoesNotContain("Requested",row.Detail); Assert.DoesNotContain("Accepted",row.Detail);}
            if(report.Unit=="count")Assert.Equal(report.Rows.Total,report.Value);
            decimal sum=0; for(var page=1; page<=Math.Max(1,(report.Rows.Total+99)/100);page++)sum+=(await f.Tabs.Report(metric,from,to,page,100,default)).Rows.Items.Sum(x=>x.Amount??0);
            if(report.Unit=="money")Assert.Equal(report.Value,sum);
        }
        Assert.Equal(tab.Id,(await f.Tabs.PaymentTab(payment.Id,default)).Id);
        var source=await f.Tabs.Source("cash",f.Session.Id,1,100,default); Assert.Equal(120,source.Expected); Assert.Contains(source.Rows.Items,x=>x.OriginId==payment.Id);
        var stock=await f.Tabs.Source("stock",f.Product.Id,1,100,default); Assert.Equal(18,stock.Available); Assert.Contains(stock.Rows.Items,x=>x.Label=="Entrega da comanda");
    }
    [PostgresFact]
    public async Task Local_pix_expiry_is_not_confirmation_or_cancellation_and_decline_releases_due()
    {
        await using var f=await Fixture.Create(); var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default); await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,1)],true),f.Actor,null,default);
        var payment=await f.Tabs.Pay(tab.Id,new(Guid.NewGuid(),"Pix",10,Name:"Teste",Email:"teste@example.invalid",TaxId:"12345678901"),f.Actor,null,default);
        var model=await f.Db.Set<BarTabPayment>().SingleAsync(x=>x.Id==payment.Id); model.SetExpiry(DateTimeOffset.UtcNow.AddMinutes(-1)); await f.Db.SaveChangesAsync();
        Assert.Equal("Pending",(await f.Tabs.Refresh(tab.Id,payment.Id,f.Actor,null,default)).State); Assert.Equal(0,(await f.Tabs.Get(tab.Id,false,default)).Payable);
        f.Gateway.State="DECLINED"; Assert.Equal("Declined",(await f.Tabs.Refresh(tab.Id,payment.Id,f.Actor,null,default)).State);
        tab=await f.Tabs.Get(tab.Id,false,default); Assert.Equal(10,tab.Payable); Assert.Equal(0,tab.Paid);
    }
    [PostgresFact]
    public async Task Pix_refund_intent_recovers_after_uncertain_provider_response_without_double_refund()
    {
        await using var f=await Fixture.Create(); f.Gateway.State="PAID"; var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default); await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,1)],true),f.Actor,null,default);
        var payment=await f.Tabs.Pay(tab.Id,new(Guid.NewGuid(),"Pix",10,Name:"Teste",Email:"teste@example.invalid",TaxId:"12345678901"),f.Actor,null,default);
        var refund=new TabRefundInput(Guid.NewGuid(),3,"Estorno de teste"); f.Gateway.ConfirmRefund=false;
        await Assert.ThrowsAsync<BarPaymentConfirmationPendingException>(()=>f.Tabs.Refund(tab.Id,payment.Id,refund,f.Actor,default));
        Assert.Equal("Pending",(await f.Db.Set<BarTabRefund>().SingleAsync(x=>x.OperationId==refund.OperationId)).State); Assert.Equal(0,(await f.Tabs.Get(tab.Id,false,default)).Due);
        f.Gateway.ConfirmRefund=true; await f.Tabs.Refund(tab.Id,payment.Id,refund,f.Actor,default); await f.Tabs.Refund(tab.Id,payment.Id,refund,f.Actor,default);
        Assert.Equal(3,(await f.Tabs.Get(tab.Id,false,default)).Due); Assert.Equal(1,await f.Db.Set<BarTabHistory>().CountAsync(x=>x.TabId==tab.Id&&x.Kind=="PaymentRefunded"));
        await f.Tabs.Refund(tab.Id,payment.Id,new(Guid.NewGuid(),2,"Outro estorno parcial"),f.Actor,default); Assert.Equal(5,(await f.Tabs.Get(tab.Id,false,default)).Due);
    }
    [PostgresFact]
    public async Task Concurrent_retries_allocate_and_move_cash_only_once()
    {
        await using var f=await Fixture.Create(); var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default); await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,1)],true),f.Actor,null,default);
        var input=new TabPaymentInput(Guid.NewGuid(),"Cash",10,f.Session.Id);
        async Task<TabPaymentResponse?> PayOnce()
        {
            await using var db=new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable(ConnectionVariable)).Options,TimeProvider.System);
            var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"Authentication:Jwt:SigningKey","test-only-signing-key-more-than-thirty-two-chars"}}).Build();
            try{return await new BarTabsService(db,f.Gateway,TimeProvider.System,config).Pay(tab.Id,input,f.Actor,null,default);}
            catch(Exception ex) when(ex is DbUpdateConcurrencyException || ex is Npgsql.PostgresException {SqlState:"40001" or "40P01"} || ex.InnerException is Npgsql.PostgresException {SqlState:"40001" or "40P01" or "23505"}){return null;}
        }
        var attempts=await Task.WhenAll(PayOnce(),PayOnce()); Assert.Contains(attempts,x=>x is not null);
        var replay=await PayOnce(); Assert.NotNull(replay); Assert.Equal(attempts.First(x=>x is not null)!.Id,replay.Id);
        Assert.Equal(1,await f.Db.Set<BarTabPayment>().CountAsync(x=>x.OperationId==input.OperationId));
        Assert.Equal(1,await f.Db.Set<CashMovement>().CountAsync(x=>x.OriginId==replay.Id));
        f.Db.ChangeTracker.Clear(); Assert.Equal(110,(await f.Db.Set<CashSession>().SingleAsync(x=>x.Id==f.Session.Id)).Expected);
    }
    [PostgresFact]
    public async Task Expired_access_is_denied_and_database_rejects_consumption_snapshot_edits()
    {
        await using var f=await Fixture.Create(); var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default); tab=await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,1)],true),f.Actor,null,default);
        var access=await f.Tabs.IssueAccess(tab.Id,new(Guid.NewGuid()),f.Actor,default); var stored=await f.Db.Set<BarTabAccess>().SingleAsync(x=>x.TokenHash!=null&&x.TabId==tab.Id);
        f.Db.Entry(stored).Property(x=>x.ExpiresAtUtc).CurrentValue=DateTimeOffset.UtcNow.AddSeconds(-1); await f.Db.SaveChangesAsync();
        var denied=await Assert.ThrowsAsync<BarTabAccessException>(()=>f.Tabs.Client(access.Token,default)); Assert.Equal(BarTabAccessFailure.ExpiredOrRevoked,denied.Failure);
        var item=Assert.Single(tab.Items);
        await Assert.ThrowsAsync<Npgsql.PostgresException>(()=>f.Db.Database.ExecuteSqlInterpolatedAsync($"UPDATE bar_tab_items SET \"UnitPrice\" = 1 WHERE \"Id\" = {item.Id}"));
        Assert.Equal(10,(await f.Tabs.Get(tab.Id,false,default)).Total);
    }
    [PostgresFact]
    public async Task Invalid_payer_is_400_without_allocation_but_provider_mismatch_is_502_with_durable_retry()
    {
        await using var f=await Fixture.Create(); var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id),f.Actor,default); await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,1)],true),f.Actor,null,default);
        var access=await f.Tabs.IssueAccess(tab.Id,new(Guid.NewGuid()),f.Actor,default);
        await using var factory=new LongBeachWebApplicationFactory().WithWebHostBuilder(builder=>builder
            .ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{{"ConnectionStrings:LongBeach",Environment.GetEnvironmentVariable(ConnectionVariable)}}))
            .ConfigureServices(services=>{services.AddDbContext<LongBeachDbContext>(o=>o.UseNpgsql(Environment.GetEnvironmentVariable(ConnectionVariable)));services.AddSingleton<IPaymentGateway>(f.Gateway);}));
        using var client=factory.CreateClient(); client.DefaultRequestHeaders.Add("X-LongBeach-Tab",access.Token);
        var input=new TabPaymentInput(Guid.NewGuid(),"Pix",10,Name:"Pagador de teste",Email:"teste@example.invalid",TaxId:"12345678901");
        using(var invalid=await client.PostAsJsonAsync("/api/v1/bar/client/payments",input with {TaxId="12"}))Assert.Equal(HttpStatusCode.BadRequest,invalid.StatusCode);
        Assert.Equal(0,await f.Db.Set<BarTabPayment>().CountAsync(x=>x.TabId==tab.Id));
        f.Gateway.MismatchedAmount=true;
        using(var pending=await client.PostAsJsonAsync("/api/v1/bar/client/payments",input))
        {
            Assert.Equal(HttpStatusCode.BadGateway,pending.StatusCode);
            var problem=await pending.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(); Assert.Equal(input.OperationId,problem.GetProperty("operationId").GetGuid());
        }
        var publicTab=await client.GetFromJsonAsync<TabResponse>("/api/v1/bar/client"); Assert.NotNull(publicTab); var intent=Assert.Single(publicTab.Payments); Assert.True(intent.CanResume); Assert.Null(intent.ProviderId); Assert.Equal(10,publicTab.Pending); Assert.Equal(0,publicTab.Paid);
        f.Gateway.MismatchedAmount=false;
        using(var retry=await client.PostAsJsonAsync("/api/v1/bar/client/payments",input))Assert.Equal(HttpStatusCode.OK,retry.StatusCode);
        publicTab=await client.GetFromJsonAsync<TabResponse>("/api/v1/bar/client"); Assert.NotNull(publicTab); var linked=Assert.Single(publicTab.Payments); Assert.Equal(intent.Id,linked.Id); Assert.False(linked.CanResume); Assert.Null(linked.ProviderId); Assert.Equal(1,f.Gateway.Created);
    }
    [PostgresFact]
    public async Task Student_portal_and_counter_share_one_bar_balance_and_delivery_ledger()
    {
        await using var f=await Fixture.Create();var tab=await f.Tabs.Open(new(Guid.NewGuid(),f.Location.Id,"Aluno"),f.Actor,default);tab=await f.Tabs.Add(tab.Id,new(Guid.NewGuid(),[new(f.Product.Id,2)],true),f.Actor,null,default);
        var user=LongBeach.Domain.Identity.User.Create("Aluno",Guid.NewGuid()+"@example.invalid","test");f.Db.Add(user);await f.Db.SaveChangesAsync();
        var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{["Payments:Billing:Enabled"]="true"}).Build();
        LongBeach.Infrastructure.Billing.BillingService Service(LongBeachDbContext db)=>new(db,f.Gateway,new BarTabsService(db,f.Gateway,TimeProvider.System,config),new LongBeach.Infrastructure.Payments.PagBankRecurringGateway(new HttpClient(),config),new LongBeach.Infrastructure.Operations.RentalGroupsService(db,TimeProvider.System),TimeProvider.System,Microsoft.Extensions.Logging.Abstractions.NullLogger<LongBeach.Infrastructure.Billing.BillingService>.Instance,config);
        var account=await Service(f.Db).Assign(new("Bar",tab.Id,user.Id),f.Actor,default);
        async Task<bool> Attempt(bool student)
        {
            await using var db=new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable(ConnectionVariable)).Options,TimeProvider.System);
            try
            {
                if(student)await Service(db).Pay(account.Id,new(Guid.NewGuid(),"Pix","Aluno","aluno@example.invalid","12345678909"),user.Id,true,default);
                else await new BarTabsService(db,f.Gateway,TimeProvider.System,config).Pay(tab.Id,new(Guid.NewGuid(),"CardManual",20,CardApproved:true),f.Actor,null,default);
                return true;
            }
            catch(BarRuleException){return false;}catch(DbUpdateException){return false;}catch(Npgsql.PostgresException e)when(e.SqlState=="40001"){return false;}catch(InvalidOperationException e)when(e.InnerException is Npgsql.PostgresException{SqlState:"40001"}){return false;}
        }
        Assert.Single(await Task.WhenAll(Attempt(true),Attempt(false)),x=>x);f.Db.ChangeTracker.Clear();var result=await Service(f.Db).Account(account.Id,user.Id,default);Assert.Equal(20,result.Paid+result.Pending);Assert.Equal(0,result.Payable);
        Assert.Equal(18,(await f.Db.Set<StockBalance>().SingleAsync(x=>x.ProductId==f.Product.Id&&x.LocationId==f.Location.Id)).Quantity);Assert.Equal(1,await f.Db.Set<StockMovement>().CountAsync(x=>x.OriginId==tab.Items.Single().Id&&x.Kind=="TabDelivery"));
    }
    private sealed class Fixture : IAsyncDisposable
    {
        public LongBeachDbContext Db {get;} public Guid Actor {get;}=Guid.NewGuid(); public StockLocation Location {get;}=new("Teste "+Guid.NewGuid()); public BarProduct Product {get;} public CashSession Session {get;} public Gateway Gateway {get;}=new(); public BarTabsService Tabs {get;}
        private Fixture()
        {
            Db=new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable(ConnectionVariable)).Options,TimeProvider.System);
            var suffix=Guid.NewGuid().ToString("N"); var category=new BarProductCategory("Teste "+suffix);
            Product=new(suffix,"Água teste","Água",category.Id,"un","cx",1,10,2,1,true,false,0);
            var register=new CashRegister("Teste "+suffix); Session=new(register.Id,Location.Id,Actor,"Tablet teste",100);
            var balance=new StockBalance(Product.Id,Location.Id); var movement=new StockMovement(balance,20,2,"Initial","Fixture",Guid.NewGuid(),Actor);
            Db.AddRange(category,Product,Location,register,Session,balance,movement,CashMovement.Opening(Session,Actor));
            var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"Authentication:Jwt:SigningKey","test-only-signing-key-more-than-thirty-two-chars"}}).Build(); Tabs=new(Db,Gateway,TimeProvider.System,config);
        }
        public static async Task<Fixture> Create() { var f=new Fixture(); await f.Db.Database.MigrateAsync(); await f.Db.SaveChangesAsync(); return f; }
        public ValueTask DisposeAsync()=>Db.DisposeAsync();
    }
    private sealed class Gateway : IPaymentGateway
    {
        public bool Enabled=>true; public bool ConfirmRefund {get;set;}=true; public bool TimeoutAfterCreate {get;set;} public bool MismatchedAmount {get;set;} public string State {get;set;}="WAITING"; public int Created {get;private set;}
        private readonly Dictionary<Guid,GatewayPayment> payments=[];
        public Task<GatewayPayment> CreatePix(Guid paymentId,Guid operationId,decimal amount,DateTimeOffset expires,PixCustomer customer,CancellationToken ct)
        {
            if(!payments.TryGetValue(operationId,out var p)) {p=new("ORDER-"+paymentId,"CHARGE-"+paymentId,paymentId.ToString(),"WAITING",(long)(amount*100),"BRL","pix-text",null);payments[operationId]=p;Created++;}
            if(TimeoutAfterCreate)throw new TimeoutException("Simulação exclusiva de teste"); return Task.FromResult(p with {Amount=p.Amount+(MismatchedAmount?1:0)});
        }
        public Task<GatewayPayment> Get(string orderId,CancellationToken ct) {var p=payments.Values.Single(x=>x.OrderId==orderId);return Task.FromResult(p with {State=State,Amount=p.Amount+(MismatchedAmount?1:0)});}
        public Task<GatewayPayment> Refund(string orderId,Guid operationId,decimal amount,CancellationToken ct)=>RefundPartial(orderId,operationId,amount,0,ct);
        public Task<GatewayPayment> RefundPartial(string orderId,Guid operationId,decimal amount,decimal previous,CancellationToken ct) {var p=payments.Values.Single(x=>x.OrderId==orderId);return Task.FromResult(p with {State="PAID",Refunded=ConfirmRefund?(long)((amount+previous)*100):0});}
        public bool VerifyWebhook(byte[] body,IEnumerable<string> signatures)=>signatures.Contains("test-only-valid");
    }
}
