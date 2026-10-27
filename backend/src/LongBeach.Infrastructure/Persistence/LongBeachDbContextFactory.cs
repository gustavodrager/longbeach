using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace LongBeach.Infrastructure.Persistence;

public sealed class LongBeachDbContextFactory : IDesignTimeDbContextFactory<LongBeachDbContext>
{
    public LongBeachDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("LONG_BEACH_DATABASE_URL")
            ?? "Host=localhost;Port=5432;Database=longbeach;Username=longbeach;Password=longbeach";

        var options = new DbContextOptionsBuilder<LongBeachDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new LongBeachDbContext(options, TimeProvider.System);
    }
}
