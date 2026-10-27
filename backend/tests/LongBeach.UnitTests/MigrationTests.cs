using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LongBeach.UnitTests;

public sealed class MigrationTests
{
    [Fact]
    public void Initial_migration_is_discoverable_and_generates_postgresql_sql()
    {
        var options = new DbContextOptionsBuilder<LongBeachDbContext>()
            .UseNpgsql("Host=localhost;Database=longbeach;Username=test;Password=test")
            .Options;
        using var dbContext = new LongBeachDbContext(options, TimeProvider.System);

        var migrations = dbContext.Database.GetMigrations().ToArray();
        var script = dbContext.GetService<IMigrator>().GenerateScript();

        Assert.Contains("20261001000100_InitialCreate", migrations);
        Assert.Contains("CREATE TABLE users", script, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("CREATE TABLE refresh_tokens", script, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("CREATE TABLE audit_logs", script, StringComparison.OrdinalIgnoreCase);
    }
}
