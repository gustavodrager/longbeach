using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Customers;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace LongBeach.IntegrationTests;

public sealed partial class BarTabsPostgresTests
{
    [PostgresTheory]
    [InlineData("")]
    [InlineData("Visitante")]
    public async Task Tab_name_is_persisted_searchable_and_idempotent_after_anonymous_opening(string initialName)
    {
        await using var f = await Fixture.Create();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id, initialName), f.Actor, default);
        var name = "Mesa de teste " + Guid.NewGuid().ToString("N");
        var input = new TabNameInput(Guid.NewGuid(), "  " + name + "  ", tab.Version);
        var renamed = await f.Tabs.Rename(tab.Id, input, f.Actor, default);
        Assert.Equal(name, renamed.Name);
        Assert.Equal(tab.Version + 1, renamed.Version);
        Assert.Null(renamed.Customer);
        Assert.Null(renamed.Responsible);
        var history = Assert.Single(renamed.History, row => row.Kind == "NameChanged");
        Assert.Equal(f.Actor, history.ActorId);
        Assert.Null(history.Reason);

        await using var fresh = NamingContext(f);
        var service = NamingService(fresh, f.Gateway);
        Assert.Equal(name, (await service.Get(tab.Id, false, default)).Name);
        Assert.Equal(tab.Id, Assert.Single((await service.List("Open", name, 1, 10, false, default)).Items).Id);
        var replay = await service.Rename(tab.Id, input, f.Actor, default);
        Assert.Equal(renamed.Version, replay.Version);
        Assert.Equal(history.Id, Assert.Single(replay.History, row => row.Kind == "NameChanged").Id);
        Assert.Single(await fresh.Set<BarTabOperation>().Where(row => row.Id == input.OperationId).ToListAsync());
        Assert.Single(await fresh.Set<BarTabHistory>().Where(row => row.TabId == tab.Id && row.Kind == "NameChanged").ToListAsync());
    }

    [PostgresFact]
    public async Task Tab_name_rejects_stale_or_reused_intents_and_can_be_cleared_without_duplicate_changes()
    {
        await using var f = await Fixture.Create();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var input = new TabNameInput(Guid.NewGuid(), "Primeiro nome", tab.Version);
        var renamed = await f.Tabs.Rename(tab.Id, input, f.Actor, default);
        var collision = await Assert.ThrowsAsync<BarRuleException>(() =>
            f.Tabs.Rename(tab.Id, input with { Name = "Outro conteúdo" }, f.Actor, default));
        Assert.Equal(400, collision.StatusCode);
        var staleInput = new TabNameInput(Guid.NewGuid(), "Versão antiga", tab.Version);
        var stale = await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Rename(tab.Id, staleInput, f.Actor, default));
        Assert.Equal(409, stale.StatusCode);
        Assert.Equal("Primeiro nome", (await f.Tabs.Get(tab.Id, false, default)).Name);
        Assert.False(await f.Db.Set<BarTabOperation>().AnyAsync(row => row.Id == staleInput.OperationId));

        var unchanged = await f.Tabs.Rename(tab.Id, new(Guid.NewGuid(), " Primeiro nome ", renamed.Version), f.Actor, default);
        Assert.Equal(renamed.Version, unchanged.Version);
        Assert.Single(unchanged.History, row => row.Kind == "NameChanged");
        var cleared = await f.Tabs.Rename(tab.Id, new(Guid.NewGuid(), " ", unchanged.Version), f.Actor, default);
        Assert.Equal("", cleared.Name);
        Assert.Equal(renamed.Version + 1, cleared.Version);
        Assert.Equal(2, cleared.History.Count(row => row.Kind == "NameChanged"));
        await using var fresh = NamingContext(f);
        Assert.Equal("", (await NamingService(fresh, f.Gateway).Get(tab.Id, false, default)).Name);
    }

    [PostgresFact]
    public async Task Tab_name_preserves_customer_payer_items_finances_and_access_even_with_pending_pix()
    {
        await using var f = await Fixture.Create();
        var responsible = User.Create("Responsável sintético", Guid.NewGuid().ToString("N") + "@example.invalid", "synthetic-only-hash");
        f.Db.Add(responsible);
        await f.Db.SaveChangesAsync();
        var customer = await new CustomerService(f.Db, TimeProvider.System).Create(
            new(Guid.NewGuid(), "Cliente sintético", "11987654321"), f.Actor, "bar", default);
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id, "Visitante", ResponsibleUserId: responsible.Id, CustomerId: customer.Id), f.Actor, default);
        await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1)], true), f.Actor, null, default);
        await f.Tabs.Pay(tab.Id, new(Guid.NewGuid(), "Cash", 3, f.Session.Id), f.Actor, null, default);
        await f.Tabs.Pay(tab.Id, new(Guid.NewGuid(), "Pix", 2, Name: "Pagador sintético", Email: "synthetic@example.invalid", TaxId: "12345678909"), f.Actor, null, default);
        var access = await f.Tabs.IssueAccess(tab.Id, new(Guid.NewGuid()), f.Actor, default);
        var before = await f.Tabs.Get(tab.Id, false, default);
        var clientBefore = await f.Tabs.Client(access.Token, default);
        var billingAccount = await f.Db.Set<BillingAccount>().AsNoTracking().SingleAsync(row => row.SourceId == tab.Id);
        var cashCount = await f.Db.Set<CashMovement>().CountAsync();
        var stockCount = await f.Db.Set<StockMovement>().CountAsync();
        var accessCount = await f.Db.Set<BarTabAccess>().CountAsync();
        var cashBalance = (await f.Db.Set<CashSession>().AsNoTracking().SingleAsync(row => row.Id == f.Session.Id)).Expected;
        var stockBalance = await f.Db.Set<StockBalance>().AsNoTracking().SingleAsync(row => row.ProductId == f.Product.Id && row.LocationId == f.Location.Id);

        var after = await f.Tabs.Rename(tab.Id, new(Guid.NewGuid(), "Nome livre de teste", before.Version), f.Actor, default);
        Assert.Equal(before.Customer, after.Customer);
        Assert.Equal(before.Responsible, after.Responsible);
        Assert.Equal((before.Number, before.CreatedAtUtc, before.Notes, before.Mode, before.State), (after.Number, after.CreatedAtUtc, after.Notes, after.Mode, after.State));
        Assert.Equal(before.Items.Select(row => (row.Id, row.Quantity, row.UnitPrice, row.Total, row.State)), after.Items.Select(row => (row.Id, row.Quantity, row.UnitPrice, row.Total, row.State)));
        Assert.Equal(before.Payments, after.Payments);
        Assert.Equal((before.Total, before.Gross, before.Discount, before.Paid, before.Pending, before.Due, before.Payable),
            (after.Total, after.Gross, after.Discount, after.Paid, after.Pending, after.Due, after.Payable));
        Assert.Equal(2, after.Pending);
        Assert.Equal(cashCount, await f.Db.Set<CashMovement>().CountAsync());
        Assert.Equal(stockCount, await f.Db.Set<StockMovement>().CountAsync());
        Assert.Equal(accessCount, await f.Db.Set<BarTabAccess>().CountAsync());
        Assert.Equal(cashBalance, (await f.Db.Set<CashSession>().AsNoTracking().SingleAsync(row => row.Id == f.Session.Id)).Expected);
        var stockAfter = await f.Db.Set<StockBalance>().AsNoTracking().SingleAsync(row => row.ProductId == f.Product.Id && row.LocationId == f.Location.Id);
        Assert.Equal((stockBalance.Quantity, stockBalance.Reserved), (stockAfter.Quantity, stockAfter.Reserved));
        Assert.Equal(billingAccount.Id, (await f.Db.Set<BillingAccount>().AsNoTracking().SingleAsync(row => row.SourceId == tab.Id)).Id);
        Assert.Equal(customer.Id, (await f.Db.Set<BarTab>().AsNoTracking().SingleAsync(row => row.Id == tab.Id)).CustomerId);
        var client = await f.Tabs.Client(access.Token, default);
        Assert.Equal(tab.Id, client.Id);
        Assert.Equal(after.Name, client.Name);
        Assert.Null(client.Customer);
        Assert.Null(client.Responsible);
        Assert.Equal(clientBefore.AllowedActions, client.AllowedActions);
    }

    [PostgresFact]
    public async Task Invalid_or_terminal_tab_name_changes_leave_no_operation_or_history()
    {
        await using var f = await Fixture.Create();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id, "Original"), f.Actor, default);
        var invalid = new TabNameInput(Guid.NewGuid(), new string('a', 81), tab.Version);
        Assert.Equal(400, (await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Rename(tab.Id, invalid, f.Actor, default))).StatusCode);
        Assert.False(await f.Db.Set<BarTabOperation>().AnyAsync(row => row.Id == invalid.OperationId));
        Assert.Equal("Original", (await f.Tabs.Get(tab.Id, false, default)).Name);
        Assert.Empty(await f.Db.Set<BarTabHistory>().Where(row => row.TabId == tab.Id && row.Kind == "NameChanged").ToListAsync());

        var closed = await f.Tabs.Close(tab.Id, new(Guid.NewGuid()), f.Actor, default);
        var cancelledTab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id, "Cancelada"), f.Actor, default);
        var cancelled = await f.Tabs.Cancel(cancelledTab.Id, new(Guid.NewGuid(), cancelledTab.Version, "Cancelamento sintético"), f.Actor, default);
        foreach (var terminal in new[] { closed, cancelled })
        {
            var input = new TabNameInput(Guid.NewGuid(), "Não deve alterar", terminal.Version);
            Assert.Equal(400, (await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Rename(terminal.Id, input, f.Actor, default))).StatusCode);
            Assert.Equal(terminal.Name, (await f.Tabs.Get(terminal.Id, false, default)).Name);
            Assert.False(await f.Db.Set<BarTabOperation>().AnyAsync(row => row.Id == input.OperationId));
        }
    }

    [PostgresFact]
    public async Task Tab_name_changes_use_the_existing_audit_with_actor_and_history_once()
    {
        var audit = new NamingAudit();
        await using var isolated = await IsolatedBarDatabase.Create(new AuditSaveChangesInterceptor(audit, TimeProvider.System));
        var db = isolated.Context;
        var service = NamingService(db, new Gateway());
        var tab = await service.Open(new(Guid.NewGuid(), StockModel.Bar), audit.UserId!.Value, default);
        var input = new TabNameInput(Guid.NewGuid(), "Comanda sintética", tab.Version);
        await service.Rename(tab.Id, input, audit.UserId.Value, default);
        await service.Rename(tab.Id, input, audit.UserId.Value, default);
        var change = Assert.Single(await db.AuditLogs.Where(row => row.Resource == nameof(BarTab) && row.ResourceId == tab.Id.ToString() && row.Action == "Modified").ToListAsync());
        Assert.Equal(audit.UserId, change.ActorUserId);
        Assert.Equal(audit.CorrelationId, change.CorrelationId);
        using var metadata = JsonDocument.Parse(change.MetadataJson);
        Assert.Equal("", metadata.RootElement.GetProperty("Name").GetProperty("Before").GetString());
        Assert.Equal(input.Name, metadata.RootElement.GetProperty("Name").GetProperty("After").GetString());
        Assert.Single(await db.Set<BarTabHistory>().Where(row => row.TabId == tab.Id && row.Kind == "NameChanged" && row.ActorId == audit.UserId).ToListAsync());
    }

    private static LongBeachDbContext NamingContext(Fixture f) => new(
        new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(f.Db.Database.GetConnectionString()).Options, TimeProvider.System);

    private static BarTabsService NamingService(LongBeachDbContext db, Gateway gateway) => new(db, gateway, TimeProvider.System,
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["Authentication:Jwt:SigningKey"] = "test-only-signing-key-more-than-thirty-two-chars" }).Build());

    private sealed class NamingAudit : IAuditContext
    {
        public Guid? UserId { get; } = Guid.NewGuid();
        public string? IpAddress => null;
        public string? UserAgent => null;
        public string CorrelationId => "tab-name-synthetic-test";
    }
}
