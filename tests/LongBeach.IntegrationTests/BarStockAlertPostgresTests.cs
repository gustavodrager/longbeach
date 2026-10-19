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
