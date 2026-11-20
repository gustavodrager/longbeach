using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Contracts.Bar;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Operations;
using LongBeach.Domain.Purchases;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed class PurchaseReopeningPostgresTests
{
    private static readonly DateTimeOffset CorrectDate = new(2026, 3, 2, 12, 0, 0, TimeSpan.FromHours(-3));
    private static readonly TestAudit Audit = new();

    [PostgresFact]
    public async Task Endpoint_reopens_the_same_purchase_with_persisted_date_audit_and_no_stock_or_finance_changes()
    {
        await using var isolated = await IsolatedBarDatabase.Create(new AuditSaveChangesInterceptor(Audit, TimeProvider.System));
        var db = isolated.Context;
        var purchase = await CreatePurchase(db, canceled: true);
        var before = (await new BarPurchasesService(db).Find(purchase.Id, default))!;
        var originalItem = Assert.Single(before.Items);
        var itemSnapshot = (originalItem.Id, originalItem.ProductId, originalItem.Quantity, originalItem.PurchaseCost,
            originalItem.PurchaseUnit, originalItem.Conversion, originalItem.LandedTotal);
        db.Add(new OperationalRecord(Guid.NewGuid(), "financeEntries", "Outra compra fictícia", JsonSerializer.Serialize(new
        {
            direction = "Pagar", status = "Pendente", sourceKind = "barPurchases", sourceId = Guid.NewGuid()
        })));
        await db.SaveChangesAsync();
        var financialBefore = await db.OperationalRecords.CountAsync();
        var movementsBefore = await db.Set<StockMovement>().CountAsync();
        var connection = db.Database.GetConnectionString();
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:LongBeach"] = connection,
                ["BackgroundJobs:Enabled"] = "false"
            }))
            .ConfigureServices(services => services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(connection))));
        using var client = factory.CreateClient();
        var path = $"/api/v1/bar/purchases/{purchase.Id}/reopen";
        var input = new PurchaseReopenInput(CorrectDate, "  Corrigir data após conferência  ", before.Version);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync(path, input)).StatusCode);
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Student");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path, input)).StatusCode);
        client.DefaultRequestHeaders.Authorization = OperationalPostgresTests.Header("Manager");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path, input with { Reason = " " })).StatusCode);

        using var response = await client.PostAsJsonAsync(path, input);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(purchase.Id, body.RootElement.GetProperty("id").GetGuid());
        Assert.Equal("Ordered", body.RootElement.GetProperty("state").GetString());
        Assert.Equal(CorrectDate.ToUniversalTime(), body.RootElement.GetProperty("purchasedAtUtc").GetDateTimeOffset());
        Assert.Equal(before.Version + 1, body.RootElement.GetProperty("version").GetInt32());
        using var readBack = await client.GetAsync($"/api/v1/bar/purchases/{purchase.Id}");
        using var persistedBody = JsonDocument.Parse(await readBack.Content.ReadAsStringAsync());
        Assert.Equal(CorrectDate.ToUniversalTime(), persistedBody.RootElement.GetProperty("purchasedAtUtc").GetDateTimeOffset());
        Assert.Equal(new DateOnly(2026, 3, 2), DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(
            persistedBody.RootElement.GetProperty("purchasedAtUtc").GetDateTimeOffset(), TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo")).DateTime));

        db.ChangeTracker.Clear();
        var saved = (await new BarPurchasesService(db).Find(purchase.Id, default))!;
        var item = Assert.Single(saved.Items);
        Assert.Equal((before.Id, before.SupplierId, before.Document, before.ActorId, before.Total, before.Freight, before.Discount,
                before.PaymentMethod, before.AccountReference, before.CancellationReason, before.CanceledBy),
            (saved.Id, saved.SupplierId, saved.Document, saved.ActorId, saved.Total, saved.Freight, saved.Discount,
                saved.PaymentMethod, saved.AccountReference, saved.CancellationReason, saved.CanceledBy));
        Assert.Equal(itemSnapshot, (item.Id, item.ProductId, item.Quantity, item.PurchaseCost, item.PurchaseUnit, item.Conversion, item.LandedTotal));
        Assert.Equal(0m, item.Received);
        Assert.Equal(0m, item.CostReceived);
        Assert.Equal(movementsBefore, await db.Set<StockMovement>().CountAsync());
        Assert.Equal(financialBefore, await db.OperationalRecords.CountAsync());
        Assert.False(await db.Set<PurchaseReceipt>().AnyAsync(receipt => receipt.PurchaseId == purchase.Id));
        Assert.Equal(1, await db.Set<Purchase>().CountAsync(p => p.SupplierId == saved.SupplierId && p.Document == saved.Document));
        var audit = await db.AuditLogs.SingleAsync(row => row.ResourceId == purchase.Id.ToString() && row.Action == "PurchaseReopened");
        Assert.Equal(LongBeachWebApplicationFactory.StaffOwnerId, audit.ActorUserId);
        using var metadata = JsonDocument.Parse(audit.MetadataJson);
        Assert.Equal("Corrigir data após conferência", metadata.RootElement.GetProperty("Reason").GetString());
        Assert.Equal(before.PurchasedAtUtc, metadata.RootElement.GetProperty("Before").GetProperty("PurchasedAtUtc").GetDateTimeOffset());
        Assert.Equal("Canceled", metadata.RootElement.GetProperty("Before").GetProperty("State").GetString());
        Assert.Equal(CorrectDate.ToUniversalTime(), metadata.RootElement.GetProperty("After").GetProperty("PurchasedAtUtc").GetDateTimeOffset());
        Assert.Equal(before.CancellationReason, metadata.RootElement.GetProperty("LastCancellation").GetProperty("CancellationReason").GetString());
        Assert.Equal(before.CanceledBy, metadata.RootElement.GetProperty("LastCancellation").GetProperty("CanceledBy").GetGuid());
        Assert.True(await db.AuditLogs.AnyAsync(row => row.ResourceId == purchase.Id.ToString() && row.Action == "Modified"));

        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(path, input)).StatusCode);
        Assert.Equal(1, await db.AuditLogs.CountAsync(row => row.ResourceId == purchase.Id.ToString() && row.Action == "PurchaseReopened"));
        await using var duplicate = Database(connection!);
        var duplicateError = await Assert.ThrowsAsync<DbUpdateException>(() => new BarPurchasesService(duplicate).Create(
            new PurchaseInput(saved.SupplierId, saved.Document, [new(item.ProductId, item.Quantity, item.PurchaseCost)]), Audit.UserId!.Value, default));
        Assert.Equal(PostgresErrorCodes.UniqueViolation, Assert.IsType<PostgresException>(duplicateError.InnerException).SqlState);
    }

    [PostgresFact]
    public async Task Reopening_rejects_receipt_history_residual_quantities_costs_and_all_managed_or_legacy_financial_links()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        foreach (var obstruction in new[] { "receipt", "received", "cost", "managed-pending", "managed-paid", "legacy-canceled" })
        {
            var purchase = await CreatePurchase(db, canceled: true);
            var item = purchase.Items.Single();
            if (obstruction == "receipt")
                db.Add(new PurchaseReceipt(purchase.Id, StockModel.Bar, Guid.NewGuid(), Audit.UserId!.Value));
            else if (obstruction == "received")
                db.Entry(item).Property(x => x.Received).CurrentValue = 1m;
            else if (obstruction == "cost")
                db.Entry(item).Property(x => x.CostReceived).CurrentValue = 0.01m;
            else
            {
                var payload = obstruction == "legacy-canceled"
                    ? JsonSerializer.Serialize(new { direction = "Pagar", status = "Cancelado", sourceKind = "barPurchases", sourceId = purchase.Id.ToString().ToUpperInvariant() })
                    : JsonSerializer.Serialize(new { direction = "Pagar", status = obstruction == "managed-paid" ? "Pago" : "Pendente",
                        expense = new { purchaseId = purchase.Id.ToString().ToUpperInvariant(), paidAmount = obstruction == "managed-paid" ? purchase.Total : 0m } });
                db.Add(new OperationalRecord(Guid.NewGuid(), "financeEntries", "Vínculo fictício", payload));
            }
            await db.SaveChangesAsync();
            db.ChangeTracker.Clear();
            var error = await Assert.ThrowsAsync<BarRuleException>(() => new BarPurchasesService(db, Audit).Reopen(
                purchase.Id, new(CorrectDate, "Conferência da data", purchase.Version), Audit.UserId!.Value, default));
            Assert.Equal(400, error.StatusCode);
            db.ChangeTracker.Clear();
            var saved = (await new BarPurchasesService(db).Find(purchase.Id, default))!;
            Assert.Equal("Canceled", saved.State);
            Assert.Equal(purchase.PurchasedAtUtc, saved.PurchasedAtUtc);
            Assert.Equal(purchase.Version, saved.Version);
            Assert.False(await db.AuditLogs.AnyAsync(row => row.ResourceId == purchase.Id.ToString() && row.Action == "PurchaseReopened"));
        }
    }

    [PostgresFact]
    public async Task Concurrent_reopening_keeps_one_version_change_and_one_audit_event()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        var purchase = await CreatePurchase(db, canceled: true);
        var input = new PurchaseReopenInput(CorrectDate, "Corrigir data conferida", purchase.Version);
        var connection = db.Database.GetConnectionString()!;
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<bool> Attempt()
        {
            await using var writer = Database(connection);
            await start.Task;
            try
            {
                await new BarPurchasesService(writer, Audit).Reopen(purchase.Id, input, Audit.UserId!.Value, default);
                return true;
            }
            catch (BarRuleException error) when (error.StatusCode == 409) { return false; }
            catch (DbUpdateConcurrencyException) { return false; }
            catch (Exception error) when (SerializationConflict(error)) { return false; }
        }
        var attempts = new[] { Attempt(), Attempt() };
        start.SetResult();
        var results = await Task.WhenAll(attempts);
        Assert.Single(results, success => success);
        db.ChangeTracker.Clear();
        var saved = (await new BarPurchasesService(db).Find(purchase.Id, default))!;
        Assert.Equal("Ordered", saved.State);
        Assert.Equal(purchase.Version + 1, saved.Version);
        Assert.Equal(CorrectDate.ToUniversalTime(), saved.PurchasedAtUtc);
        Assert.Equal(1, await db.AuditLogs.CountAsync(row => row.ResourceId == purchase.Id.ToString() && row.Action == "PurchaseReopened"));
        Assert.False(await db.Set<PurchaseReceipt>().AnyAsync());
        Assert.False(await db.Set<StockMovement>().AnyAsync());
        Assert.False(await db.OperationalRecords.AnyAsync());
    }

    [PostgresFact]
    public async Task Reopening_waits_for_finance_started_before_cancellation_and_rejects_its_committed_link()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        var purchase = await CreatePurchase(db, canceled: false);
        var connection = db.Database.GetConnectionString()!;
        var barrier = new PauseSupplierRead();
        await using var finance = Database(connection, barrier);
        await using var reopening = Database(connection);
        await reopening.Database.OpenConnectionAsync();
        var reopeningPid = ((NpgsqlConnection)reopening.Database.GetDbConnection()).ProcessID;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var expenseTask = new ExpensesService(finance, Audit, TimeProvider.System).Create(Guid.NewGuid(),
            new ExpenseInput("Compra fictícia em conferência", purchase.Total, new DateOnly(2026, 3, 2), PurchaseId: purchase.Id), timeout.Token);
        try
        {
            // PurchaseOption has checked Ordered, while the financial transaction still owns its lock.
            await barrier.Reached.Task.WaitAsync(timeout.Token);
            await new BarPurchasesService(db).Cancel(purchase.Id, "Data incorreta", Audit.UserId!.Value, timeout.Token);
            var input = new PurchaseReopenInput(CorrectDate, "Corrigir data conferida", purchase.Version);
            var reopeningTask = new BarPurchasesService(reopening, Audit).Reopen(purchase.Id, input, Audit.UserId!.Value, timeout.Token);
            await WaitForAdvisoryLock(connection, reopeningPid, timeout.Token);
            barrier.Continue.TrySetResult();
            var expense = await expenseTask;
            Assert.Equal(purchase.Id, expense.Expense.PurchaseId);
            var error = await Assert.ThrowsAsync<BarRuleException>(() => reopeningTask);
            Assert.Contains("vínculo financeiro", error.Message);
            db.ChangeTracker.Clear();
            var saved = (await new BarPurchasesService(db).Find(purchase.Id, timeout.Token))!;
            Assert.Equal("Canceled", saved.State);
            Assert.Equal(purchase.PurchasedAtUtc, saved.PurchasedAtUtc);
            Assert.Equal(purchase.Version, saved.Version);
            Assert.False(await db.AuditLogs.AnyAsync(row => row.ResourceId == purchase.Id.ToString() && row.Action == "PurchaseReopened", timeout.Token));
        }
        finally
        {
            barrier.Continue.TrySetResult();
            await expenseTask;
        }
    }

    private static async Task<Purchase> CreatePurchase(LongBeachDbContext db, bool canceled)
    {
        var catalog = new BarCatalogService(db);
        var service = new BarPurchasesService(db, Audit);
        var suffix = Guid.NewGuid().ToString("N");
        var category = await catalog.CreateCategory(new CategoryInput("Teste reabertura " + suffix), default);
        var product = await catalog.SaveProduct(null, new ProductInput("", "Produto fictício " + suffix, "Teste", category.Id,
            "un", "cx", 6, 5, 0, 0, true, false, 0), default);
        var supplier = await service.CreateSupplier("Fornecedor fictício " + suffix, default);
        var purchase = await service.Create(new PurchaseInput(supplier.Id, "Documento fictício " + suffix,
            [new(product.Product.Id, 2, 12.34m)], Freight: 2, Discount: 1, PurchasedAtUtc: CorrectDate.AddDays(3)), Audit.UserId!.Value, default);
        if (canceled) await service.Cancel(purchase.Id, "Data incorreta no cadastro", Audit.UserId!.Value, default);
        return purchase;
    }

    private static LongBeachDbContext Database(string connection, params IInterceptor[] interceptors) => new(
        new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(connection).AddInterceptors(interceptors).Options, TimeProvider.System);

    private static async Task WaitForAdvisoryLock(string connection, int pid, CancellationToken ct)
    {
        await using var observer = new NpgsqlConnection(connection);
        await observer.OpenAsync(ct);
        await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = @pid AND locktype = 'advisory' AND NOT granted)", observer);
        command.Parameters.AddWithValue("pid", pid);
        while (!(bool)(await command.ExecuteScalarAsync(ct))!) await Task.Delay(10, ct);
    }

    private sealed class PauseSupplierRead : DbCommandInterceptor
    {
        public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Continue { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.Contains("FROM suppliers", StringComparison.Ordinal)
                || command.CommandText.Contains("FROM \"suppliers\"", StringComparison.Ordinal))
            {
                Reached.TrySetResult();
                await Continue.Task.WaitAsync(cancellationToken);
            }
            return result;
        }
    }

    private static bool SerializationConflict(Exception error)
    {
        for (Exception? cause = error; cause is not null; cause = cause.InnerException)
            if (cause is PostgresException postgres && postgres.SqlState is PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.DeadlockDetected)
                return true;
        return false;
    }

    private sealed class TestAudit : IAuditContext
    {
        public Guid? UserId { get; } = Guid.NewGuid();
        public string? IpAddress => null;
        public string? UserAgent => "purchase-reopening-test";
        public string CorrelationId => "purchase-reopening-test";
    }
}
