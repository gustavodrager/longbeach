using System.Data.Common;
using System.Text.Json;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Billing;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Billing;
using LongBeach.Infrastructure.Operations;
using LongBeach.Infrastructure.Payments;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace LongBeach.IntegrationTests;

public sealed class AdministrativePaymentOverviewPostgresTests
{
    [PostgresFact]
    public async Task Management_sees_linked_and_unassigned_sources_once_without_creating_receipts_or_assignments()
    {
        await using var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context;
        var user = User.Create("Responsável de teste", Guid.NewGuid() + "@example.invalid", "fixture-only");
        var other = User.Create("Outro responsável", Guid.NewGuid() + "@example.invalid", "fixture-only");
        var location = new StockLocation("Bar teste"); var category = new BarProductCategory("Bebidas teste");
        var product = new BarProduct("OVERVIEW", "Água teste", "Água", category.Id, "un", "un", 1, 10, 2, 0, false, false, 0);
        var immediate = Tab(location.Id, user.Id, "Immediate", "Venda balcão");
        var refunded = Tab(location.Id, user.Id, "Tab", "Comanda com estorno");
        var linked = Tab(location.Id, user.Id, "Tab", "Comanda vinculada");
        var empty = Tab(location.Id, user.Id, "Tab", "Comanda vazia");
        var counter = Payment(immediate.Id, user.Id, 20, "CardManual"); counter.ConfirmManual(DateTimeOffset.UtcNow);
        var pix = Payment(refunded.Id, user.Id, 30, "Pix"); pix.Confirm(DateTimeOffset.UtcNow); pix.Refund(10);
        var waiting = Payment(refunded.Id, user.Id, 5, "Pix");
        var card = Payment(linked.Id, user.Id, 10, "CardManual"); card.ConfirmManual(DateTimeOffset.UtcNow);
        immediate.Close(0, 0, false, DateTimeOffset.UtcNow);
        var barAccount = new BillingAccount("Bar", linked.Id, user.Id, null, user.Id);
        var paid = CourtEntry("Reserva recebida", 100, "Pago");
        var pending = CourtEntry("Mensalidade a receber", 80, "Pendente");
        var canceled = CourtEntry("Reserva cancelada", 10, "Cancelado");
        var barReceipt = CourtEntry("Venda externa do Bar", 40, "Pago", "PagVendas");
        var directPix = ManualReceipt("Pix direto da Quadra", "Pago", "CourtPix", "PagBank");
        var directC6Pix = ManualReceipt("Pix direto C6", "Pago", "CourtPix", "C6");
        var allocatedCourt = ManualReceipt("Quadra classificada", "Pendente", scope: "Unit", unit: BusinessUnits.Court);
        var generic = ManualReceipt("Recebimento genérico", "Pago");
        var shared = ManualReceipt("Recebimento compartilhado", "Pago", scope: "Shared");
        var directBar = ManualReceipt("Maquininha", "Pago", "PagBankTerminal", "PagBank", "Unit", BusinessUnits.Bar);
        var invalidAmount = ManualReceipt("Valor inválido", "Pago", "CourtPix", "PagBank", amount: 1.001m);
        var payable = ManualReceipt("Despesa", "Pago", scope: "Unit", unit: BusinessUnits.Court, direction: "Pagar");
        var linkedCourt = CourtEntry("Reserva vinculada", 40, "Pago");
        var courtAccount = new BillingAccount("Quadra", linkedCourt.Id, other.Id, null, user.Id);
        db.AddRange(user, other, location, category, product, immediate, refunded, linked, empty,
            Item(immediate.Id, product, user.Id, 2), Item(refunded.Id, product, user.Id, 5), Item(linked.Id, product, user.Id, 1),
            counter, pix, waiting, card, new BarTabRefund(refunded.Id, pix.Id, Guid.NewGuid(), "fixture-refund", 5, "Em confirmação", user.Id),
            paid, pending, canceled, barReceipt, linkedCourt, barAccount, courtAccount,
            directPix, directC6Pix, allocatedCourt, generic, shared, directBar, invalidAmount, payable);
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var entryPayloads = await db.OperationalRecords.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Payload);
        var service = Service(db);

        var overview = await service.Accounts(null, default);

        Assert.Equal(10, overview.Count);
        Assert.Equal(overview.Count, overview.Select(x => (x.Kind, x.SourceId)).Distinct().Count());
        Assert.Equal(barAccount.Id, Assert.Single(overview, x => x.SourceId == linked.Id).Id);
        Assert.Equal(courtAccount.Id, Assert.Single(overview, x => x.SourceId == linkedCourt.Id).Id);
        Assert.All(overview.Where(x => !x.IsLinked), x => { Assert.Equal(x.SourceId, x.Id); Assert.Equal(Guid.Empty, x.UserId); Assert.False(x.RecurringEligible); });
        var immediateRow = Assert.Single(overview, x => x.SourceId == immediate.Id);
        Assert.False(immediateRow.IsLinked); Assert.StartsWith("Venda ", immediateRow.Title); Assert.Equal("Closed", immediateRow.State); Assert.Equal(20, immediateRow.Paid);
        var refundRow = Assert.Single(overview, x => x.SourceId == refunded.Id);
        Assert.Equal(50, refundRow.Total); Assert.Equal(20, refundRow.Paid); Assert.Equal(5, refundRow.Pending); Assert.Equal(25, refundRow.Payable);
        Assert.Equal(10, refundRow.Payments.Sum(x => x.Refunded)); Assert.Equal(5, refundRow.Payments.Sum(x => x.RefundPending));
        var paidRow = Assert.Single(overview, x => x.SourceId == paid.Id);
        Assert.Equal(100, paidRow.Paid); Assert.Equal(0, paidRow.Payable); Assert.Equal(0, paidRow.Pending); Assert.Empty(paidRow.Payments);
        var pendingRow = Assert.Single(overview, x => x.SourceId == pending.Id);
        Assert.Equal(0, pendingRow.Paid); Assert.Equal(80, pendingRow.Payable); Assert.Equal(0, pendingRow.Pending); Assert.Empty(pendingRow.Payments);
        Assert.DoesNotContain(overview, x => x.SourceId == canceled.Id || x.SourceId == barReceipt.Id);
        foreach(var id in new[]{directPix.Id,directC6Pix.Id,allocatedCourt.Id})Assert.Contains(overview,x=>x.SourceId==id&&!x.IsLinked&&x.Kind=="Quadra"&&x.Payments.Count==0);
        foreach(var id in new[]{generic.Id,shared.Id,directBar.Id,invalidAmount.Id,payable.Id})Assert.DoesNotContain(overview,x=>x.SourceId==id);
        Assert.Contains(overview, x => x.SourceId == empty.Id && x.Total == 0);
        var own = Assert.Single(await service.Accounts(user.Id, default)); Assert.Equal(barAccount.Id, own.Id); Assert.True(own.IsLinked);
        Assert.Equal(courtAccount.Id, Assert.Single(await service.Accounts(other.Id, default)).Id);
        Assert.Empty(await service.Accounts(Guid.NewGuid(), default));

        foreach (var projected in overview.Where(x => !x.IsLinked))
        {
            await Assert.ThrowsAsync<BarTabAccessException>(() => service.Account(projected.Id, null, default));
            await Assert.ThrowsAsync<BarTabAccessException>(() => service.Pay(projected.Id, new(Guid.NewGuid(), "Pix", "Teste", "test@example.invalid", "12345678909"), user.Id, false, default));
            await Assert.ThrowsAsync<BarTabAccessException>(() => service.Refresh(projected.Id, Guid.NewGuid(), user.Id, false, default));
            await Assert.ThrowsAsync<BarTabAccessException>(() => service.Refund(projected.Id, Guid.NewGuid(), new(Guid.NewGuid(), 1, "Teste"), user.Id, default));
        }
        Assert.Equal(2, await db.Set<BillingAccount>().CountAsync()); Assert.Empty(await db.Set<BillingPayment>().ToListAsync());
        Assert.Empty(await db.Set<BillingRefund>().ToListAsync()); Assert.Empty(await db.Set<BillingSubscription>().ToListAsync());
        Assert.Empty(await db.AuditLogs.ToListAsync()); Assert.False(db.ChangeTracker.HasChanges());
        Assert.Equal(entryPayloads.OrderBy(x => x.Key), (await db.OperationalRecords.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Payload)).OrderBy(x => x.Key));
    }

    [PostgresFact]
    public async Task Concurrent_assignment_does_not_duplicate_or_mix_overview_identity()
    {
        var barrier = new AccountReadBarrier();
        await using var isolated = await IsolatedBarDatabase.Create(barrier); var db = isolated.Context;
        var user = User.Create("Responsável", Guid.NewGuid() + "@example.invalid", "fixture-only");
        var location = new StockLocation("Bar teste"); var tab = Tab(location.Id, user.Id, "Tab", "A vincular");
        db.AddRange(user, location, tab); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        barrier.Armed = true;
        var reading = Service(db).Accounts(null, default);
        await barrier.Reached.Task.WaitAsync(TimeSpan.FromSeconds(15));
        try
        {
            await using var writer = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(db.Database.GetConnectionString()).Options, TimeProvider.System);
            var assigned = await Service(writer).Assign(new("Bar", tab.Id, user.Id), user.Id, default);
            Assert.NotEqual(tab.Id, assigned.Id);
        }
        finally { barrier.Resume.TrySetResult(); }
        var before = Assert.Single(await reading); Assert.False(before.IsLinked); Assert.Equal(tab.Id, before.Id);
        var after = Assert.Single(await Service(db).Accounts(null, default)); Assert.True(after.IsLinked); Assert.NotEqual(tab.Id, after.Id); Assert.Equal(tab.Id, after.SourceId);
        Assert.Equal(1, await db.Set<BillingAccount>().CountAsync());
    }

    [PostgresFact]
    public async Task Bar_overview_reads_a_fixed_number_of_queries_and_returns_newest_payments_first()
    {
        foreach(var count in new[]{1,32})await AssertBoundedBarOverview(count);
    }
    private static async Task AssertBoundedBarOverview(int count)
    {
        var counter=new ReadCounter();
        await using var isolated=await IsolatedBarDatabase.Create(counter); var db=isolated.Context;
        var user=User.Create("Responsável",Guid.NewGuid()+"@example.invalid","fixture-only");
        var location=new StockLocation("Bar teste");var category=new BarProductCategory("Bebidas teste");
        var product=new BarProduct("BATCH","Água teste","Água",category.Id,"un","un",1,10,2,0,false,false,0);
        db.AddRange(user,location,category,product);
        var newest=new Dictionary<Guid,Guid>();var linkedIds=new Dictionary<Guid,Guid>();
        var now=DateTimeOffset.UtcNow;
        for(var index=0;index<count;index++)
        {
            var tab=Tab(location.Id,user.Id,"Tab","Comanda "+index);tab.Adjust(5);
            db.AddRange(tab,Item(tab.Id,product,user.Id,10));
            for(var paymentIndex=0;paymentIndex<8;paymentIndex++)
            {
                var payment=Payment(tab.Id,user.Id,10,paymentIndex==7?"Pix":"CardManual");
                payment.MarkCreated(now.AddMinutes(paymentIndex-8));
                if(paymentIndex<7)payment.ConfirmManual(now);
                if(paymentIndex==0)
                {
                    payment.Refund(2);
                    db.Add(new BarTabRefund(tab.Id,payment.Id,Guid.NewGuid(),"fixture-pending-refund",3,"Em confirmação",user.Id));
                }
                db.Add(payment);if(paymentIndex==7)newest.Add(tab.Id,payment.Id);
            }
            if(index%2==0)
            {
                var account=new BillingAccount("Bar",tab.Id,user.Id,null,user.Id);db.Add(account);linkedIds.Add(tab.Id,account.Id);
            }
        }
        await db.SaveChangesAsync();db.ChangeTracker.Clear();counter.Commands.Clear();

        var overview=await Service(db).Accounts(null,default);

        Assert.Equal(count,overview.Count);Assert.Equal(6,counter.Commands.Count);
        Assert.Single(counter.Commands,x=>x.Contains("FROM bar_tabs",StringComparison.Ordinal));
        Assert.Single(counter.Commands,x=>x.Contains("FROM bar_tab_items",StringComparison.Ordinal));
        Assert.Single(counter.Commands,x=>x.Contains("FROM bar_tab_payments",StringComparison.Ordinal));
        Assert.Single(counter.Commands,x=>x.Contains("FROM bar_tab_refunds",StringComparison.Ordinal));
        Assert.DoesNotContain(counter.Commands,x=>x.Contains("bar_tab_history",StringComparison.Ordinal)||x.Contains("JOIN users",StringComparison.Ordinal));
        foreach(var row in overview)
        {
            Assert.Equal(95,row.Total);Assert.Equal(68,row.Paid);Assert.Equal(10,row.Pending);Assert.Equal(17,row.Payable);Assert.Equal(5,row.Discount);
            Assert.Equal(3,row.Payments.Sum(x=>x.RefundPending));Assert.Equal(2,row.Payments.Sum(x=>x.Refunded));
            Assert.Equal(newest[row.SourceId],row.Payments[0].Id);Assert.Equal("Pending",row.Payments[0].State);Assert.True(row.Payments[0].CanResume);
            Assert.Equal(linkedIds.ContainsKey(row.SourceId),row.IsLinked);
            Assert.Equal(linkedIds.GetValueOrDefault(row.SourceId,row.SourceId),row.Id);
        }
        // The individual/customer view follows the same newest-first payment ordering.
        var linked=overview.First(x=>x.IsLinked);
        Assert.Equal(newest[linked.SourceId],(await Service(db).Account(linked.Id,user.Id,default)).Payments[0].Id);
    }

    private static BarTab Tab(Guid location, Guid actor, string mode, string name) => new(location, actor, name, mode);
    private static BarTabItem Item(Guid tab, BarProduct product, Guid actor, decimal quantity)
    {
        var item = new BarTabItem(tab, product, quantity, actor, false); item.Accept(DateTimeOffset.UtcNow); item.Fulfill(DateTimeOffset.UtcNow); return item;
    }
    private static BarTabPayment Payment(Guid tab, Guid actor, decimal amount, string method) => new(tab, Guid.NewGuid(), "fixture", amount, method, actor, null, amount, "TEST");
    private static OperationalRecord CourtEntry(string name, decimal amount, string status, string? receiptSource = null)
    {
        var id = Guid.NewGuid();
        return new(id, "financeEntries", name, JsonSerializer.Serialize(new { id, name, amount, direction = "Receber", sourceKind = "reservations", sourceId = Guid.NewGuid(), origin = "Arena", status, dueDate = "2026-10-25", paidDate = status=="Pago"?DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-dd"):"", month = "2026-10", receiptSource }));
    }
    private static OperationalRecord ManualReceipt(string name,string status,string? receiptSource=null,string? receivingAccount=null,string? scope=null,string? unit=null,decimal amount=25,string direction="Receber")
    {
        var id=Guid.NewGuid();
        return new(id,"financeEntries",name,JsonSerializer.Serialize(new{id,name,amount,direction,sourceKind="",sourceId="",origin="Arena",status,dueDate="2026-10-25",paidDate=status=="Pago"?DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-dd"):"",month="2026-10",receiptSource,receivingAccount,allocationScope=scope??(receiptSource=="CourtPix"?"Unit":null),businessUnitId=unit??(receiptSource=="CourtPix"?BusinessUnits.Court:null)}));
    }
    private static BillingService Service(LongBeachDbContext db)
    {
        var config = new ConfigurationBuilder().Build(); var gateway = new NoPaymentCalls();
        return new(db, gateway, new BarTabsService(db, gateway, TimeProvider.System, config), new PagBankRecurringGateway(new HttpClient(new NoNetworkCalls()), config), new RentalGroupsService(db, TimeProvider.System), TimeProvider.System, NullLogger<BillingService>.Instance, config);
    }
    private sealed class NoPaymentCalls : IPaymentGateway
    {
        public bool Enabled => false;
        public Task<GatewayPayment> CreatePix(Guid id, Guid operation, decimal amount, DateTimeOffset expires, PixCustomer customer, CancellationToken ct) => throw new InvalidOperationException("Read-only overview must not call a payment provider.");
        public Task<GatewayPayment> Get(string id, CancellationToken ct) => throw new InvalidOperationException("Read-only overview must not call a payment provider.");
        public Task<GatewayPayment> Refund(string id, Guid operation, decimal amount, CancellationToken ct) => throw new InvalidOperationException("Read-only overview must not call a payment provider.");
        public bool VerifyWebhook(byte[] body, IEnumerable<string> signatures) => false;
    }
    private sealed class NoNetworkCalls : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => throw new InvalidOperationException("Network access is forbidden in this test.");
    }
    private sealed class ReadCounter : DbCommandInterceptor
    {
        public List<string> Commands { get; }=[];
        public override ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command,CommandExecutedEventData eventData,DbDataReader result,CancellationToken cancellationToken=default)
        {
            Commands.Add(command.CommandText);return ValueTask.FromResult(result);
        }
    }
    private sealed class AccountReadBarrier : DbCommandInterceptor
    {
        public bool Armed; private int intercepted;
        public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Resume { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData, DbDataReader result, CancellationToken cancellationToken = default)
        {
            if (Armed && command.CommandText.Contains("FROM billing_accounts", StringComparison.Ordinal) && Interlocked.Exchange(ref intercepted, 1) == 0)
            {
                Reached.TrySetResult(); await Resume.Task.WaitAsync(TimeSpan.FromSeconds(15), cancellationToken);
            }
            return result;
        }
    }
}
