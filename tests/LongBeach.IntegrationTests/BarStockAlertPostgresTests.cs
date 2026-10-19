using LongBeach.Application.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed class BarStockAlertPostgresTests
{
    [PostgresFact]
    public async Task Bar_alert_excludes_other_locations_counts_reservations_and_keeps_all_locations_available()
    {
        await using var database = await Database.Create(); var db = database.Context;
        var bar = await db.Set<StockLocation>().SingleAsync(x => x.Name == "Bar");
        db.Entry(bar).Property(x => x.Name).CurrentValue = "bAr";
        var category = new BarProductCategory("Bebidas teste");
        BarProduct Product(string name) => new(Guid.NewGuid().ToString(), name, name, category.Id, "un", "un", 1, 5, 1, 1, true, false, 0);
        var reserved = Product("Reservado"); var stocked = Product("Com saldo"); var missing = Product("Sem contagem");
        var balance = new StockBalance(reserved.Id, bar.Id); balance.Move(3); balance.Reserve(2);
        var other = new StockBalance(stocked.Id, bar.Id); other.Move(10);
        db.AddRange(category, reserved, stocked, missing, balance, other); await db.SaveChangesAsync();
        var service = new BarTabsService(db, null!, TimeProvider.System, new ConfigurationBuilder().Build());
        var report = await service.Report("low-stock-bar", null, null, 1, 20, default);
        Assert.True(report.Current); Assert.Equal(2, report.Value); Assert.Equal(2, report.Rows.Total);
        Assert.All(report.Rows.Items, row => Assert.Contains("bAr", row.Detail));
        Assert.Contains(report.Rows.Items, row => row.ResourceId == reserved.Id);
        Assert.Contains(report.Rows.Items, row => row.ResourceId == missing.Id);
        Assert.DoesNotContain(report.Rows.Items, row => row.ResourceId == stocked.Id);
        var all = await service.Report("low-stock", null, null, 1, 20, default);
        Assert.Equal(5, all.Value); Assert.Contains(all.Rows.Items, row => row.Detail.Contains("Almoxarifado"));
        Assert.Single((await service.Report("low-stock-bar", null, null, 2, 1, default)).Rows.Items);
        db.Add(new StockLocation("BAR")); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<BarRuleException>(() => service.Report("low-stock-bar", null, null, 1, 20, default));
    }

    [PostgresFact]
    public async Task Missing_Bar_is_unavailable_instead_of_zero()
    {
        await using var database = await Database.Create();
        await database.Context.Set<StockLocation>().Where(x => x.Name == "Bar").ExecuteDeleteAsync();
        var service = new BarTabsService(database.Context, null!, TimeProvider.System, new ConfigurationBuilder().Build());
        await Assert.ThrowsAsync<BarRuleException>(() => service.Report("low-stock-bar", null, null, 1, 20, default));
    }

    [PostgresFact]
    public async Task Balance_alert_matches_summary_including_missing_and_equal_minimum_without_writing_rows()
    {
        await using var database = await Database.Create(); var db = database.Context;
        var bar = await db.Set<StockLocation>().SingleAsync(x => x.Name == "Bar");
        var category = new BarProductCategory("Estoque teste");
        var exact = new BarProduct("exact", "No mínimo", "No mínimo", category.Id, "un", "un", 1, 5, 1, 2, true, false, 0);
        var missing = new BarProduct("missing", "Sem saldo", "Sem saldo", category.Id, "un", "un", 1, 5, 1, 0, true, false, 0);
        var balance = new StockBalance(exact.Id, bar.Id); balance.Move(3); balance.Reserve(1);
        db.AddRange(category, exact, missing, balance); await db.SaveChangesAsync();
        var before = await db.Set<StockBalance>().CountAsync();
        var data = System.Text.Json.JsonSerializer.SerializeToElement(await new BarStockService(db).Balances(false, default));
        var rows = data.EnumerateArray().Where(x => x.GetProperty("LocationId").GetGuid() == bar.Id && x.GetProperty("Low").GetBoolean()).ToArray();
        var report = await new BarTabsService(db, null!, TimeProvider.System, new ConfigurationBuilder().Build()).Report("low-stock-bar", null, null, 1, 20, default);
        Assert.Equal(report.Value, rows.Length);
        Assert.Contains(rows, x => x.GetProperty("ProductId").GetGuid() == exact.Id);
        Assert.Contains(rows, x => x.GetProperty("ProductId").GetGuid() == missing.Id);
        Assert.All(rows, x => Assert.Equal("un", x.GetProperty("Unit").GetString()));
        Assert.Equal(before, await db.Set<StockBalance>().CountAsync());
        Assert.All(data.EnumerateArray(), x => Assert.Equal(System.Text.Json.JsonValueKind.Null, x.GetProperty("UnitCost").ValueKind));
    }

    [PostgresFact]
    public async Task Movement_history_filters_before_paging_and_includes_location_and_balances()
    {
        await using var database = await Database.Create(); var db = database.Context;
        var bar = await db.Set<StockLocation>().SingleAsync(x => x.Name == "Bar");
        var other = await db.Set<StockLocation>().SingleAsync(x => x.Name == "Almoxarifado");
        var category = new BarProductCategory("Histórico teste");
        var product = new BarProduct("hist", "Água teste", "Água", category.Id, "un", "un", 1, 5, 1, 0, true, false, 0);
        var balance = new StockBalance(product.Id, bar.Id); var oldBalance = new StockBalance(product.Id, other.Id);
        db.AddRange(category, product, balance, oldBalance);
        var actor = Guid.NewGuid();
        for (var i = 0; i < 25; i++) db.Add(new StockMovement(balance, 1, 1, "PurchaseReceived", "Entrada de teste", Guid.NewGuid(), actor));
        for (var i = 0; i < 501; i++) db.Add(new StockMovement(oldBalance, 1, 1, "InitialCount", "Outro local", Guid.NewGuid(), actor));
        await db.SaveChangesAsync();
        var service = new BarStockService(db);
        var data = System.Text.Json.JsonSerializer.SerializeToElement(await service.MovementHistory(bar.Id, "Água", "PurchaseReceived", null, null, 2, default));
        Assert.Equal(25, data.GetProperty("Total").GetInt32());
        Assert.Equal(5, data.GetProperty("Items").GetArrayLength());
        Assert.All(data.GetProperty("Items").EnumerateArray(), x => { Assert.Equal("Bar", x.GetProperty("LocationName").GetString()); Assert.Equal(1, x.GetProperty("After").GetDecimal()-x.GetProperty("Before").GetDecimal()); });
        var none = System.Text.Json.JsonSerializer.SerializeToElement(await service.MovementHistory(bar.Id, null, null, new DateOnly(2000,1,1), new DateOnly(2000,1,2), 1, default));
        Assert.Equal(0, none.GetProperty("Total").GetInt32());
        await Assert.ThrowsAsync<BarRuleException>(()=>service.MovementHistory(bar.Id, null, null, new DateOnly(2026,10,20), new DateOnly(2026,10,19), 1, default));
    }

    [PostgresFact]
    public async Task Missing_counts_are_zeroed_atomically() => await VerifyZeroApproval(false);

    [PostgresFact]
    public async Task Concurrent_stock_still_blocks_zero_approval() => await VerifyZeroApproval(true);

    private async Task VerifyZeroApproval(bool changed)
    {
        await using var database = await Database.Create(); var db = database.Context;
        var bar = await db.Set<StockLocation>().SingleAsync(x => x.Name == "Bar");
        var category = new BarProductCategory("Contagem zero");
        var product = new BarProduct("zero", "Produto zero", "Zero", category.Id, "un", "un", 1, 5, 1, 0, true, false, 0);
        var balance = new StockBalance(product.Id, bar.Id); balance.Move(7);
        db.AddRange(category, product, balance); await db.SaveChangesAsync();
        var service = new BarStockService(db); var actor = Guid.NewGuid();
        var count = await service.CreateCount(new(bar.Id, false), actor, default);
        if (changed)
        {
            balance.Move(1); await db.SaveChangesAsync();
            await Assert.ThrowsAsync<BarRuleException>(() => service.Approve(count.Id, "Zeros", actor, default, true));
        }
        else await service.Approve(count.Id, "Zeros", actor, default, true);
        db.ChangeTracker.Clear();
        var persisted = await db.Set<InventoryCount>().Include(x => x.Items).SingleAsync(x => x.Id == count.Id);
        Assert.Equal(changed ? "Counting" : "Approved", persisted.State);
        if (changed) Assert.Null(Assert.Single(persisted.Items).Counted);
        else Assert.Equal(0m, Assert.Single(persisted.Items).Counted);
        Assert.Equal(changed ? 8m : 0m, (await db.Set<StockBalance>().SingleAsync(x => x.Id == balance.Id)).Quantity);
        Assert.Equal(changed ? 0 : 1, await db.Set<StockMovement>().CountAsync(x => x.OriginId == count.Id));
    }

    private sealed class Database(string connectionString, string schema, LongBeachDbContext context) : IAsyncDisposable
    {
        public LongBeachDbContext Context { get; } = context;
        public static async Task<Database> Create()
        {
            var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")) { Pooling = false };
            var schema = "bar_alert_test_" + Guid.NewGuid().ToString("N");
            await using (var admin = new NpgsqlConnection(connection.ConnectionString))
            {
                await admin.OpenAsync(); await using var command = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", admin); await command.ExecuteNonQueryAsync();
            }
            var original = connection.ConnectionString; connection.SearchPath = schema;
            var context = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(connection.ConnectionString, options => options.MigrationsHistoryTable("__EFMigrationsHistory", schema)).Options, TimeProvider.System);
            var database = new Database(original, schema, context);
            try { await context.Database.MigrateAsync(); return database; }
            catch { await database.DisposeAsync(); throw; }
        }
        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync(); await using var admin = new NpgsqlConnection(connectionString); await admin.OpenAsync();
            await using var command = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", admin); await command.ExecuteNonQueryAsync();
        }
    }
}
