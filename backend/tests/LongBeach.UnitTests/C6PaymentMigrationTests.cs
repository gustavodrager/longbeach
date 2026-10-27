using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LongBeach.UnitTests;

public sealed class C6PaymentMigrationTests
{
    [Fact]
    public void Payment_migration_preserves_legacy_records_and_snapshot_matches_the_model()
    {
        using var db = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>()
            .UseNpgsql("Host=localhost;Database=longbeach;Username=test;Password=test").Options, TimeProvider.System);
        Assert.False(db.Database.HasPendingModelChanges());
        var script = db.GetService<IMigrator>().GenerateScript("20261020010000_C6Banking", "20261020020000_C6PaymentProviders");
        Assert.Contains("DEFAULT 'PagBank'", script);
        Assert.Contains("UPDATE bar_payments SET \"PaymentProvider\"='PagBank' WHERE \"Method\" IN ('Pix','CreditCard')", script);
        Assert.Contains("UPDATE bar_tab_payments SET \"PaymentProvider\"='PagBank' WHERE \"Method\" IN ('Pix','CreditCard')", script);
        Assert.Contains("\"ProviderEnvironment\"", script);
        Assert.Contains("\"PixEndToEndId\"", script);
        Assert.DoesNotContain("DROP TABLE", script);
        Assert.DoesNotContain("DROP COLUMN", script);
    }
}
