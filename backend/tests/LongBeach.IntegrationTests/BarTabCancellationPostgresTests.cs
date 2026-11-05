using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;

namespace LongBeach.IntegrationTests;

public sealed class BarTabCancellationPostgresTests
{
    [PostgresFact]
    public async Task Cancellation_rejects_requests_releases_only_reservations_voids_concession_and_revokes_Qr_once()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open();
        await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 2)]), f.Actor, null, default);
        var access = await f.Tabs.IssueAccess(tab.Id, new(Guid.NewGuid()), f.Actor, default);
        await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1)], true), null, access.Token, default);
        await f.Tabs.Adjust(tab.Id, new(Guid.NewGuid(), "Discount", 3, "Concessão original"), f.Actor, default);
        var current = await f.Current(tab.Id); Assert.Contains("cancel", current.AllowedActions);
        Assert.DoesNotContain("cancel", (await f.Tabs.Get(tab.Id, false, default)).AllowedActions);
        var input = new TabCancelInput(Guid.NewGuid(), current.Version, "  Cliente desistiu  ");
        var cancelled = await f.Tabs.Cancel(tab.Id, input, f.Actor, default);
        Assert.Equal("Cancelled", cancelled.State); Assert.NotNull(cancelled.ClosedAtUtc); Assert.Empty(cancelled.AllowedActions);
        Assert.Equal(0, cancelled.Total); Assert.Equal(0, cancelled.Discount); Assert.Equal(0, cancelled.Paid);
        Assert.Contains(cancelled.Items, x => x.State == "Rejected"); Assert.Contains(cancelled.Items, x => x.State == "Reversed");
        var history = Assert.Single(cancelled.History, x => x.Kind == "Cancelled"); Assert.Equal("Cliente desistiu", history.Reason); Assert.Equal(f.Actor, history.ActorId);
        Assert.Equal(3, Assert.Single(cancelled.History, x => x.Kind == "Discount").Amount);
        Assert.Equal(-3, Assert.Single(cancelled.History, x => x.Kind == "ConcessionVoided").Amount);
        Assert.Equal(10, (await f.Balance()).Quantity); Assert.Equal(0, (await f.Balance()).Reserved);
        Assert.Empty(await f.Db.Set<StockMovement>().ToListAsync()); Assert.Empty(await f.Db.Set<CashMovement>().ToListAsync());
        Assert.True((await f.Db.Set<BarTabAccess>().SingleAsync()).Revoked);
        Assert.Equal(cancelled.Version, (await f.Tabs.Cancel(tab.Id, input, f.Actor, default)).Version);
        Assert.Single(await f.Db.Set<BarTabHistory>().Where(x => x.TabId == tab.Id && x.Kind == "Cancelled").ToListAsync());
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Cancel(tab.Id, input with { Reason = "Outro motivo" }, f.Actor, default));
        Assert.Equal(409, (await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Cancel(tab.Id, input with { OperationId = Guid.NewGuid() }, f.Actor, default))).StatusCode);
        await Assert.ThrowsAsync<BarTabAccessException>(() => f.Tabs.Client(access.Token, default));
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1)]), f.Actor, null, default));
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Pay(tab.Id, new(Guid.NewGuid(), "Cash", 5, f.Session.Id), f.Actor, null, default));
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.IssueAccess(tab.Id, new(Guid.NewGuid()), f.Actor, default));
        Assert.Single((await f.Tabs.List("Cancelled", null, 1, 20, false, default)).Items);
        Assert.Empty((await f.Tabs.List("Open", null, 1, 20, false, default)).Items);
        Assert.Equal(0, (await f.Tabs.Report("consumed", null, null, 1, 20, default)).Value);
        Assert.Equal(0, (await f.Tabs.Report("receivable", null, null, 1, 20, default)).Value);
    }

    [PostgresFact]
    public async Task Reason_and_version_failures_leave_everything_unchanged()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open();
        await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 2)]), f.Actor, null, default);
        var current = await f.Tabs.Adjust(tab.Id, new(Guid.NewGuid(), "Discount", 3, "Concessão"), f.Actor, default);
        foreach (var reason in new[] { "", "   ", "ab", new string('x', 451) })
            await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), current.Version, reason), f.Actor, default));
        Assert.Equal(409, (await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), current.Version - 1, "Cliente desistiu"), f.Actor, default))).StatusCode);
        var after = await f.Current(tab.Id); Assert.Equal("Open", after.State); Assert.Equal(3, after.Discount); Assert.Equal(current.Version, after.Version);
        Assert.Equal(2, (await f.Balance()).Reserved); Assert.DoesNotContain(after.History, x => x.Kind is "Cancelled" or "ConcessionVoided" or "Reversed");
    }

    [PostgresFact]
    public async Task Saved_immediate_items_can_be_cancelled_without_returning_delivered_stock()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open("Immediate");
        await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 2)], true), f.Actor, null, default);
        var current = await f.Tabs.Adjust(tab.Id, new(Guid.NewGuid(), "Discount", 3, "Concessão"), f.Actor, default);
        Assert.Contains("cancel", (await f.Current(tab.Id)).AllowedActions);
        var after = await f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), current.Version, "Cliente desistiu"), f.Actor, default);
        Assert.Equal("Cancelled", after.State); Assert.Equal(0, after.Total); Assert.Equal(0, after.Discount);
        var item = Assert.Single(after.Items); Assert.Equal("Reversed", item.State); Assert.Contains("Sem devolução física", item.Reason);
        Assert.Equal(8, (await f.Balance()).Quantity); Assert.Equal(0, (await f.Balance()).Reserved);
        Assert.Single(await f.Db.Set<StockMovement>().Where(x => x.Kind == "TabDelivery").ToListAsync());
        Assert.Empty(await f.Db.Set<StockMovement>().Where(x => x.Kind == "TabReturn").ToListAsync());
        Assert.Equal(-3, Assert.Single(after.History, x => x.Kind == "ConcessionVoided").Amount);
    }

    [PostgresFact]
    public async Task Received_and_pending_values_block_cancellation_and_reverse_before_mutating_concessions()
    {
        await using var f = await Fixture.Create();
        foreach (var method in new[] { "Cash", "Pix" })
        {
            var tab = await f.Open(); var accepted = await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1, "Um"), new(f.Product.Id, 1, "Dois")]), f.Actor, null, default);
            var current = await f.Tabs.Adjust(tab.Id, new(Guid.NewGuid(), "Discount", 8, "Concessão"), f.Actor, default);
            f.Db.Add(new BarTabPayment(tab.Id, Guid.NewGuid(), "synthetic", 2, method, f.Actor, method == "Cash" ? f.Session.Id : null, null, null)); await f.Db.SaveChangesAsync();
            await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.ItemAction(tab.Id, accepted.Items[0].Id, "reverse", new(Guid.NewGuid(), "Correção"), f.Actor, true, default));
            Assert.Equal(409, (await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), current.Version, "Cliente desistiu"), f.Actor, default))).StatusCode);
            var after = await f.Current(tab.Id); Assert.Equal(current.Version, after.Version); Assert.Equal(8, after.Discount); Assert.All(after.Items, x => Assert.Equal("Accepted", x.State));
            Assert.DoesNotContain(after.History, x => x.Kind is "ConcessionReduced" or "ConcessionVoided" or "Cancelled"); Assert.DoesNotContain("cancel", after.AllowedActions);
        }
    }

    [PostgresFact]
    public async Task Pending_refund_blocks_cancellation_but_fully_refunded_payments_preserve_history_and_cash()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open();
        await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1)]), f.Actor, null, default);
        var paid = await f.Tabs.Pay(tab.Id, new(Guid.NewGuid(), "Cash", 5, f.Session.Id), f.Actor, null, default);
        var pending = new BarTabRefund(tab.Id, paid.Id, Guid.NewGuid(), "synthetic", 5, "Estorno pendente", f.Actor); f.Db.Add(pending); await f.Db.SaveChangesAsync();
        var current = await f.Current(tab.Id);
        Assert.Equal(409, (await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), current.Version, "Cliente desistiu"), f.Actor, default))).StatusCode);
        Assert.Equal("Accepted", Assert.Single((await f.Current(tab.Id)).Items).State);
        // Complete the synthetic pending intent through the real refund path;
        // replay keeps the original intent and fingerprint intact.
        await f.Tabs.Refund(tab.Id, paid.Id, new(pending.OperationId, 5, pending.Reason), f.Actor, default);
        current = await f.Current(tab.Id); var cashCount = await f.Db.Set<CashMovement>().CountAsync();
        var cancelled = await f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), current.Version, "Cliente desistiu"), f.Actor, default);
        Assert.Equal("Cancelled", cancelled.State); Assert.Equal(0, cancelled.Paid); Assert.Equal(5, Assert.Single(cancelled.Payments).Refunded);
        Assert.Equal(cashCount, await f.Db.Set<CashMovement>().CountAsync()); Assert.Equal(0, (await f.Db.Set<CashSession>().SingleAsync()).Expected);
        Assert.Contains(cancelled.History, x => x.Kind == "PaymentRefunded");
        await f.Tabs.Refund(tab.Id, paid.Id, new(pending.OperationId, 5, pending.Reason), f.Actor, default);
        Assert.Equal("Cancelled", (await f.Current(tab.Id)).State);
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Refund(tab.Id, paid.Id, new(Guid.NewGuid(), 1, "Outro estorno"), f.Actor, default));
        Assert.Equal("Cancelled", (await f.Current(tab.Id)).State);
    }

    [PostgresFact]
    public async Task Reverse_limits_partial_discount_and_courtesy_to_remaining_gross_then_allows_cancellation()
    {
        await using var f = await Fixture.Create();
        foreach (var kind in new[] { "Discount", "Courtesy" })
        {
            var tab = await f.Open(); var accepted = await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1, "Um"), new(f.Product.Id, 1, "Dois")]), f.Actor, null, default);
            await f.Tabs.Adjust(tab.Id, new(Guid.NewGuid(), kind, 8, "Concessão original"), f.Actor, default);
            var first = new TabActionInput(Guid.NewGuid(), "Cliente desistiu");
            var reduced = await f.Tabs.ItemAction(tab.Id, accepted.Items[0].Id, "reverse", first, f.Actor, true, default);
            Assert.Equal(5, reduced.Discount); Assert.Equal(0, reduced.Total);
            Assert.Equal(1, (await f.Balance()).Reserved);
            var replay = await f.Tabs.ItemAction(tab.Id, accepted.Items[0].Id, "reverse", first, f.Actor, true, default);
            Assert.Single(replay.History, x => x.Kind == "ConcessionReduced");
            var last = await f.Tabs.ItemAction(tab.Id, accepted.Items[1].Id, "reverse", new(Guid.NewGuid(), "Cliente desistiu"), f.Actor, true, default);
            Assert.Equal(0, last.Discount); Assert.Equal(0, last.Total); Assert.Equal(0, (await f.Balance()).Reserved);
            Assert.Equal(kind == "Discount" ? -8 : -10, last.History.Where(x => x.Kind == "ConcessionReduced").Sum(x => x.Amount));
            Assert.Single(last.History, x => x.Kind == kind);
            var cancelled = await f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), last.Version, "Cliente desistiu"), f.Actor, default);
            Assert.Equal(0, cancelled.Total); Assert.Equal(0, cancelled.Discount);
        }
    }

    [PostgresFact]
    public async Task Recipe_reservations_are_released_from_existing_snapshots_without_physical_stock_return()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open();
        var prepared = new BarProduct("PREP", "Preparado", "Preparado", f.Product.CategoryId, "un", "un", 1, 10, 0, 0, false, false, 0); prepared.SetPreparation(true); f.Db.Add(prepared); await f.Db.SaveChangesAsync();
        var recipe = await f.Tabs.SaveRecipe(new(Guid.NewGuid(), prepared.Id, 1, "Receita", [new(f.Product.Id, 2)]), f.Actor, default);
        await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(prepared.Id, 2)]), f.Actor, null, default);
        f.Product.SetSaleAvailability(false); await f.Db.SaveChangesAsync(); var current = await f.Current(tab.Id);
        await f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), current.Version, "Cliente desistiu"), f.Actor, default);
        Assert.Equal(10, (await f.Balance()).Quantity); Assert.Equal(0, (await f.Balance()).Reserved);
        Assert.Single(await f.Db.Set<BarTabIngredientSnapshot>().Where(x => x.RecipeId == recipe.Id).ToListAsync()); Assert.Empty(await f.Db.Set<StockMovement>().ToListAsync());
    }

    [PostgresFact]
    public async Task Previously_returned_items_are_not_returned_twice_when_cancelling()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open();
        var delivered = await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 2)], true), f.Actor, null, default);
        var corrected = await f.Tabs.ItemAction(tab.Id, Assert.Single(delivered.Items).Id, "reverse", new(Guid.NewGuid(), "Devolução conferida", ReturnStock: true), f.Actor, true, default);
        Assert.Equal(10, (await f.Balance()).Quantity);
        await f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), corrected.Version, "Cliente desistiu"), f.Actor, default);
        Assert.Equal(10, (await f.Balance()).Quantity);
        Assert.Single(await f.Db.Set<StockMovement>().Where(x => x.Kind == "TabReturn").ToListAsync());
    }

    [PostgresFact]
    public async Task Immediate_prepared_cancellation_keeps_consumed_ingredient_snapshots_and_quantities()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open("Immediate");
        var prepared = new BarProduct("PREP", "Preparado", "Preparado", f.Product.CategoryId, "un", "un", 1, 10, 0, 0, false, false, 0); prepared.SetPreparation(true); f.Db.Add(prepared); await f.Db.SaveChangesAsync();
        var recipe = await f.Tabs.SaveRecipe(new(Guid.NewGuid(), prepared.Id, 1, "Receita", [new(f.Product.Id, 2)]), f.Actor, default);
        var delivered = await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(prepared.Id, 2)], true), f.Actor, null, default);
        Assert.Equal("Fulfilled", Assert.Single(delivered.Items).State); Assert.Equal(6, (await f.Balance()).Quantity);
        var cancelled = await f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), delivered.Version, "Cliente desistiu"), f.Actor, default);
        Assert.Equal("Cancelled", cancelled.State); Assert.Equal(0, cancelled.Total); Assert.Equal(6, (await f.Balance()).Quantity); Assert.Equal(0, (await f.Balance()).Reserved);
        Assert.Single(await f.Db.Set<BarTabIngredientSnapshot>().Where(x => x.RecipeId == recipe.Id).ToListAsync());
        Assert.Single(await f.Db.Set<StockMovement>().Where(x => x.Kind == "TabDelivery").ToListAsync());
        Assert.Empty(await f.Db.Set<StockMovement>().Where(x => x.Kind == "TabReturn").ToListAsync());
    }

    [PostgresFact]
    public async Task Inconsistent_reservation_causes_full_rollback_instead_of_inventing_stock()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open();
        await f.Tabs.Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 2)]), f.Actor, null, default);
        var balance = await f.Balance(); balance.Release(2); await f.Db.SaveChangesAsync();
        var current = await f.Current(tab.Id); var input = new TabCancelInput(Guid.NewGuid(), current.Version, "Cliente desistiu");
        await Assert.ThrowsAsync<BarRuleException>(() => f.Tabs.Cancel(tab.Id, input, f.Actor, default));
        var after = await f.Current(tab.Id); Assert.Equal("Open", after.State); Assert.Equal(current.Version, after.Version);
        Assert.Equal("Accepted", Assert.Single(after.Items).State); Assert.DoesNotContain(after.History, x => x.Kind is "Reversed" or "Cancelled");
        Assert.False(await f.Db.Set<BarTabOperation>().AnyAsync(x => x.Id == input.OperationId)); Assert.Equal(10, (await f.Balance()).Quantity);
    }

    [PostgresFact]
    public async Task Concurrent_cancellation_and_new_order_cannot_leave_items_in_a_cancelled_tab()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open();
        await using var cancelling = f.NewContext(); await using var adding = f.NewContext();
        var cancel = Record.ExceptionAsync(() => f.Service(cancelling).Cancel(tab.Id, new(Guid.NewGuid(), tab.Version, "Cliente desistiu"), f.Actor, default));
        var add = Record.ExceptionAsync(() => f.Service(adding).Add(tab.Id, new(Guid.NewGuid(), [new(f.Product.Id, 1)]), f.Actor, null, default));
        var errors = await Task.WhenAll(cancel, add); Assert.Contains(errors, x => x is null);
        f.Db.ChangeTracker.Clear();
        var current = await f.Current(tab.Id);
        if (current.State == "Cancelled") { Assert.Empty(current.Items); Assert.NotNull(errors[1]); }
        else { Assert.Equal("Open", current.State); Assert.Single(current.Items); Assert.NotNull(errors[0]); }
    }

    [PostgresFact]
    public async Task Concurrent_same_operation_records_one_cancellation_and_retries_its_receipt()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open(); var input = new TabCancelInput(Guid.NewGuid(), tab.Version, "Cliente desistiu");
        await using var one = f.NewContext(); await using var two = f.NewContext();
        var errors = await Task.WhenAll(Record.ExceptionAsync(() => f.Service(one).Cancel(tab.Id, input, f.Actor, default)), Record.ExceptionAsync(() => f.Service(two).Cancel(tab.Id, input, f.Actor, default)));
        Assert.Contains(errors, x => x is null);
        Assert.Equal("Cancelled", (await f.Tabs.Cancel(tab.Id, input, f.Actor, default)).State);
        Assert.Single(await f.Db.Set<BarTabHistory>().Where(x => x.TabId == tab.Id && x.Kind == "Cancelled").ToListAsync());
        Assert.Single(await f.Db.Set<BarTabOperation>().Where(x => x.Id == input.OperationId).ToListAsync());
    }

    [PostgresFact]
    public async Task Migration_adds_terminal_state_without_columns_and_refuses_downgrade_after_use()
    {
        await using var f = await Fixture.Create(); var tab = await f.Open(); var migrator = f.Db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261105215807_BarProductSaleAvailability");
        var before = await f.Db.Database.SqlQuery<string>($"SELECT to_jsonb(t)::text AS \"Value\" FROM bar_tabs t WHERE \"Id\" = {tab.Id}").SingleAsync();
        await migrator.MigrateAsync();
        Assert.Equal(before, await f.Db.Database.SqlQuery<string>($"SELECT to_jsonb(t)::text AS \"Value\" FROM bar_tabs t WHERE \"Id\" = {tab.Id}").SingleAsync());
        await f.Tabs.Cancel(tab.Id, new(Guid.NewGuid(), tab.Version, "Cliente desistiu"), f.Actor, default);
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => migrator.MigrateAsync("20261105215807_BarProductSaleAvailability"));
        Assert.Equal("Cancelled", (await f.Current(tab.Id)).State); Assert.False(f.Db.Database.HasPendingModelChanges());
    }

    private sealed class Fixture(IsolatedBarDatabase isolated, BarProduct product, Guid actor, CashSession session) : IAsyncDisposable
    {
        public LongBeachDbContext Db => isolated.Context;
        public BarProduct Product { get; } = product;
        public Guid Actor { get; } = actor;
        public CashSession Session { get; } = session;
        public BarTabsService Tabs => Service(Db);
        public BarTabsService Service(LongBeachDbContext context) => new(context, new DisabledGateway(), TimeProvider.System,
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Authentication:Jwt:SigningKey"] = "synthetic-test-only-signing-key-longer-than-thirty-two-characters" }).Build());
        public LongBeachDbContext NewContext() => new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Db.Database.GetConnectionString()).Options, TimeProvider.System);
        public static async Task<Fixture> Create()
        {
            var isolated = await IsolatedBarDatabase.Create(); var db = isolated.Context; var category = new BarProductCategory("Categoria fictícia");
            var p = new BarProduct("TEST", "Produto fictício", "Produto", category.Id, "un", "un", 1, 5, 2, 0, true, false, 0); var actor = Guid.NewGuid();
            var register = new CashRegister("Caixa fictício"); var session = new CashSession(register.Id, StockModel.Bar, actor, "Teste", 0);
            var balance = new StockBalance(p.Id, StockModel.Bar); balance.Move(10); db.AddRange(category, p, register, session, balance); await db.SaveChangesAsync();
            return new(isolated, p, actor, session);
        }
        public Task<TabResponse> Open(string mode = "Tab") => Tabs.Open(new(Guid.NewGuid(), StockModel.Bar, Mode: mode), Actor, default);
        public Task<TabResponse> Current(Guid id) => Tabs.Get(id, false, default, supervisor: true);
        public Task<StockBalance> Balance() => Db.Set<StockBalance>().SingleAsync(x => x.ProductId == Product.Id);
        public ValueTask DisposeAsync() => isolated.DisposeAsync();
    }
    private sealed class DisabledGateway : IPaymentGateway
    {
        public bool Enabled => false;
        public Task<GatewayPayment> CreatePix(Guid p, Guid o, decimal a, DateTimeOffset e, PixCustomer c, CancellationToken ct) => throw new NotSupportedException();
        public Task<GatewayPayment> Get(string id, CancellationToken ct) => throw new NotSupportedException();
        public Task<GatewayPayment> Refund(string id, Guid op, decimal a, CancellationToken ct) => throw new NotSupportedException();
        public bool VerifyWebhook(byte[] b, IEnumerable<string> s) => false;
    }
}
