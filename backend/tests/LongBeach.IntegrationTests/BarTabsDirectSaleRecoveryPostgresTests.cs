using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed partial class BarTabsPostgresTests
{
    [PostgresTheory]
    [InlineData("40001")]
    [InlineData("40P01")]
    [InlineData("concurrency")]
    public async Task Direct_sale_retries_rolled_back_writes_without_duplicating_item_stock_or_history(string failure)
    {
        await using var f = await Fixture.Create();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var input = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1)], true, true, 10);
        var fault = new FaultAfterTabWrite(input.OperationId, () => WriteFailure(failure), 2);
        await using var writer = DirectSaleWriter(f, fault);
        var service = RecoveryService(writer, f);

        var result = await service.Add(tab.Id, input, f.Actor, null, default);
        Assert.Equal(3, fault.Attempts);
        var item = Assert.Single(result.Items);
        Assert.Equal("Fulfilled", item.State);
        Assert.Equal(10, result.Total);
        Assert.Single(result.History, row => row.Kind == "Requested");
        Assert.Single(result.History, row => row.Kind == "Accepted");
        Assert.Single(result.History, row => row.Kind == "Fulfilled");
        Assert.Null(writer.Database.CurrentTransaction);
        Assert.Equal(1, await writer.Set<BarTabOperation>().CountAsync(row => row.Id == input.OperationId));
        Assert.Equal(1, await writer.Set<StockMovement>().CountAsync(row => row.OriginId == item.Id && row.Kind == "TabDelivery"));
        var balance = await writer.Set<StockBalance>().AsNoTracking().SingleAsync(row => row.ProductId == f.Product.Id);
        Assert.Equal(19, balance.Quantity);
        Assert.Equal(0, balance.Reserved);

        var replay = await service.Add(tab.Id, input, f.Actor, null, default);
        Assert.Equal(item.Id, Assert.Single(replay.Items).Id);
        Assert.Equal(3, fault.Attempts);
        Assert.Equal(0, f.Gateway.Created);
    }

    [PostgresTheory]
    [InlineData("23505")]
    [InlineData("23503")]
    [InlineData("23514")]
    public async Task Direct_sale_preserves_constraint_failures_without_guessing_they_are_transient(string sqlState)
    {
        await using var f = await Fixture.Create();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var input = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1)], true, true, 10);
        var fault = new FaultAfterTabWrite(input.OperationId, () => WriteFailure(sqlState), 1);
        await using var writer = DirectSaleWriter(f, fault);
        var service = RecoveryService(writer, f);

        var error = await Assert.ThrowsAsync<DirectSaleWriteException>(() => service.Add(tab.Id, input, f.Actor, null, default));
        Assert.Equal("direct_sale_write_failed", error.Code);
        Assert.Equal("unconfirmed", error.Outcome);
        Assert.False(error.Retryable);
        Assert.Equal(input.OperationId, error.OperationId);
        Assert.Equal(tab.Id, error.TabId);
        Assert.Equal(1, error.Attempts);
        Assert.Equal(1, fault.Attempts);
        await AssertDirectSaleRolledBack(writer, f, tab.Id, input.OperationId);

        // An explicit later retry keeps the original operation, even after a permanent
        // failure is resolved. It must not require a new UUID or duplicate consumption.
        var resumed = await service.Add(tab.Id, input, f.Actor, null, default);
        Assert.Single(resumed.Items);
        Assert.Equal(10, resumed.Total);
        Assert.Equal(1, await writer.Set<BarTabOperation>().CountAsync(row => row.Id == input.OperationId));
    }

    [PostgresFact]
    public async Task Direct_sale_stops_after_three_conflicts_and_can_resume_with_the_same_operation()
    {
        await using var f = await Fixture.Create();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var input = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1)], true, true, 10);
        var fault = new FaultAfterTabWrite(input.OperationId, () => WriteFailure("40001"), 3);
        await using var writer = DirectSaleWriter(f, fault);
        var service = RecoveryService(writer, f);

        var error = await Assert.ThrowsAsync<DirectSaleWriteException>(() => service.Add(tab.Id, input, f.Actor, null, default));
        Assert.Equal("direct_sale_retryable_conflict", error.Code);
        Assert.True(error.Retryable);
        Assert.Equal(3, error.Attempts);
        Assert.Equal(3, fault.Attempts);
        await AssertDirectSaleRolledBack(writer, f, tab.Id, input.OperationId);

        var resumed = await service.Add(tab.Id, input, f.Actor, null, default);
        Assert.Single(resumed.Items);
        Assert.Equal(10, resumed.Total);
        Assert.Equal(4, fault.Attempts);
    }

    [PostgresFact]
    public async Task Direct_sale_does_not_retry_a_cancelled_request()
    {
        await using var f = await Fixture.Create();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var input = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1)], true, true, 10);
        using var cancelled = new CancellationTokenSource();
        var fault = new FaultAfterTabWrite(input.OperationId, () =>
        {
            cancelled.Cancel();
            return new OperationCanceledException(cancelled.Token);
        }, 1);
        await using var writer = DirectSaleWriter(f, fault);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => RecoveryService(writer, f).Add(tab.Id, input, f.Actor, null, cancelled.Token));
        Assert.Equal(1, fault.Attempts);
        await AssertDirectSaleRolledBack(writer, f, tab.Id, input.OperationId);
    }

    [PostgresFact]
    public async Task Direct_sale_recovery_does_not_replay_legacy_carts_or_payments()
    {
        await using var f = await Fixture.Create();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var cart = new AddTabItemsInput(Guid.NewGuid(), [new(f.Product.Id, 1)], true);
        var cartFault = new FaultAfterTabWrite(cart.OperationId, () => WriteFailure("40001"), 1);
        await using (var writer = DirectSaleWriter(f, cartFault))
        {
            await Assert.ThrowsAsync<DbUpdateException>(() => RecoveryService(writer, f).Add(tab.Id, cart, f.Actor, null, default));
            Assert.Equal(1, cartFault.Attempts);
            await AssertDirectSaleRolledBack(writer, f, tab.Id, cart.OperationId);
        }
        await f.Tabs.Add(tab.Id, cart, f.Actor, null, default);
        var payment = new TabPaymentInput(Guid.NewGuid(), "Cash", 10, f.Session.Id);
        var paymentFault = new FaultAfterTabWrite(payment.OperationId, () => WriteFailure("40001"), 1, payment: true);
        await using (var writer = DirectSaleWriter(f, paymentFault))
        {
            await Assert.ThrowsAsync<DbUpdateException>(() => RecoveryService(writer, f).Pay(tab.Id, payment, f.Actor, null, default));
            Assert.Equal(1, paymentFault.Attempts);
            Assert.Empty(await writer.Set<BarTabPayment>().Where(row => row.TabId == tab.Id).ToListAsync());
            Assert.False(await writer.Set<BarTabOperation>().AnyAsync(row => row.Id == payment.OperationId));
            Assert.Equal(0, (await RecoveryService(writer, f).Get(tab.Id, false, default)).Paid);
        }
        Assert.Equal(0, f.Gateway.Created);
    }

    [PostgresFact]
    public async Task Direct_sale_still_records_one_unit_when_the_product_has_no_stock_balance()
    {
        await using var f = await Fixture.Create();
        var product = new BarProduct(Guid.NewGuid().ToString("N"), "Produto sem saldo cadastrado", "Sem saldo",
            f.Product.CategoryId, "un", "un", 1, 8, 0, 0, true, false, 0);
        f.Db.Add(product); await f.Db.SaveChangesAsync();
        var tab = await f.Tabs.Open(new(Guid.NewGuid(), f.Location.Id), f.Actor, default);
        var input = new AddTabItemsInput(Guid.NewGuid(), [new(product.Id, 1)], true, true, 8);
        var result = await f.Tabs.Add(tab.Id, input, f.Actor, null, default);
        Assert.Equal(8, result.Total);
        Assert.Equal("Fulfilled", Assert.Single(result.Items).State);
        var balance = await f.Db.Set<StockBalance>().SingleAsync(row => row.ProductId == product.Id && row.LocationId == f.Location.Id);
        Assert.Equal(-1, balance.Quantity);
        Assert.Equal(0, balance.Reserved);
    }

    private static LongBeachDbContext DirectSaleWriter(Fixture fixture, IInterceptor interceptor) => new(
        new DbContextOptionsBuilder<LongBeachDbContext>()
            .UseNpgsql(fixture.Db.Database.GetConnectionString()).AddInterceptors(interceptor).Options,
        TimeProvider.System);

    private static BarTabsService RecoveryService(LongBeachDbContext writer, Fixture fixture) =>
        new(writer, fixture.Gateway, TimeProvider.System, new ConfigurationBuilder().Build());

    private static Exception WriteFailure(string failure) => failure == "concurrency"
        ? new DbUpdateConcurrencyException("Synthetic concurrency")
        : new DbUpdateException("Synthetic save failure", new PostgresException("Synthetic SQL failure", "ERROR", "ERROR", failure));

    private static async Task AssertDirectSaleRolledBack(LongBeachDbContext writer, Fixture fixture, Guid tabId, Guid operationId)
    {
        Assert.Null(writer.Database.CurrentTransaction);
        Assert.Empty(await writer.Set<BarTabItem>().Where(row => row.TabId == tabId).ToListAsync());
        Assert.False(await writer.Set<BarTabHistory>().AnyAsync(row => row.TabId == tabId &&
            (row.Kind == "Requested" || row.Kind == "Accepted" || row.Kind == "Fulfilled")));
        Assert.False(await writer.Set<BarTabOperation>().AnyAsync(row => row.Id == operationId));
        var balance = await writer.Set<StockBalance>().AsNoTracking().SingleAsync(row => row.ProductId == fixture.Product.Id);
        Assert.Equal(20, balance.Quantity);
        Assert.Equal(0, balance.Reserved);
    }

    // Fail after SQL has run but before Run commits. A retry that forgets rollback or
    // reuses tracked entities would leave duplicate rows, stock or ledger entries.
    private sealed class FaultAfterTabWrite(Guid operationId, Func<Exception> error, int failures, bool payment = false) : SaveChangesInterceptor
    {
        public int Attempts { get; private set; }
        public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            var context = eventData.Context!;
            var hasWrite = payment
                ? context.ChangeTracker.Entries<BarTabPayment>().Any(row => row.Entity.OperationId == operationId)
                : context.ChangeTracker.Entries<BarTabItem>().Any();
            if (hasWrite && !context.ChangeTracker.Entries<BarTabOperation>().Any(row => row.Entity.Id == operationId))
            {
                Attempts++;
                if (Attempts <= failures) throw error();
            }
            return ValueTask.FromResult(result);
        }
    }
}
