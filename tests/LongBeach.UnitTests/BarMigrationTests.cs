using LongBeach.Infrastructure.Persistence;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Cash;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace LongBeach.UnitTests;
public sealed class BarMigrationTests
{
    [Fact]
    public void All_bar_migrations_are_additive_and_model_snapshot_matches()
    {
        using var db=new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql("Host=localhost;Database=test;Username=test;Password=test").Options,TimeProvider.System);
        Assert.False(db.Database.HasPendingModelChanges());var sql=db.GetService<IMigrator>().GenerateScript();
        foreach(var table in new[]{"bar_products","stock_locations","stock_balances","stock_movements","cash_sessions","cash_closings","bar_sales","bar_payments","purchases","purchase_receipts","stock_reservations","payment_webhook_inbox","payment_reconciliations"}) Assert.Contains("CREATE TABLE "+table,sql);
        Assert.DoesNotContain("DROP TABLE",sql);Assert.Contains("CK_stock_balance",sql);
        Assert.Contains(db.Model.FindEntityType(typeof(StockBalance))!.GetIndexes(),i=>i.IsUnique&&i.Properties.Select(p=>p.Name).SequenceEqual(new[]{"ProductId","LocationId"}));
        Assert.True(db.Model.FindEntityType(typeof(StockBalance))!.FindProperty("Version")!.IsConcurrencyToken);
        Assert.True(db.Model.FindEntityType(typeof(CashSession))!.FindProperty("Version")!.IsConcurrencyToken);
    }
}
