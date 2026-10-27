using Npgsql;
using Microsoft.EntityFrameworkCore;
using LongBeach.Infrastructure.Persistence;
namespace LongBeach.IntegrationTests;
internal sealed class IsolatedBarDatabase(string connectionString, string schema, LongBeachDbContext context) : IAsyncDisposable
    {
        public LongBeachDbContext Context { get; } = context;
        public static async Task<IsolatedBarDatabase> Create(params Microsoft.EntityFrameworkCore.Diagnostics.IInterceptor[] interceptors)
        {
            var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")) { Pooling = false };
            var schema = "bar_alert_test_" + Guid.NewGuid().ToString("N");
            await using (var admin = new NpgsqlConnection(connection.ConnectionString))
            {
                await admin.OpenAsync(); await using var command = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", admin); await command.ExecuteNonQueryAsync();
            }
            var original = connection.ConnectionString; connection.SearchPath = schema;
            var context = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(connection.ConnectionString, options => options.MigrationsHistoryTable("__EFMigrationsHistory", schema)).AddInterceptors(interceptors).Options, TimeProvider.System);
            var database = new IsolatedBarDatabase(original, schema, context);
            try { await context.Database.MigrateAsync(); return database; }
            catch { await database.DisposeAsync(); throw; }
        }
        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync(); await using var admin = new NpgsqlConnection(connectionString); await admin.OpenAsync();
            await using var command = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", admin); await command.ExecuteNonQueryAsync();
        }
    }
