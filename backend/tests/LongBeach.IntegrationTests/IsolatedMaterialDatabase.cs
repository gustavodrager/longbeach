using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace LongBeach.IntegrationTests;

internal sealed class IsolatedMaterialDatabase(string adminConnection, string schema, string connection, LongBeachDbContext context) : IAsyncDisposable
{
    public const string PreviousMigration = "20261021154910_ExpenseAttachments";
    public string Connection { get; } = connection;
    public LongBeachDbContext Context { get; } = context;
    public LongBeachDbContext NewContext() => Build(Connection, schema);
    private static LongBeachDbContext Build(string connection, string schema) => new(
        new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(connection,
            options => options.MigrationsHistoryTable("__EFMigrationsHistory", schema)).Options, TimeProvider.System);
    public static async Task<IsolatedMaterialDatabase> Create(bool previousVersion = false)
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")) { Pooling = false };
        var adminConnection = connection.ConnectionString;
        var schema = "material_test_" + Guid.NewGuid().ToString("N");
        await using (var admin = new NpgsqlConnection(adminConnection))
        {
            await admin.OpenAsync();
            await using var command = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", admin);
            await command.ExecuteNonQueryAsync();
        }
        connection.SearchPath = schema;
        var database = new IsolatedMaterialDatabase(adminConnection, schema, connection.ConnectionString, Build(connection.ConnectionString, schema));
        try
        {
            await database.Context.GetService<IMigrator>().MigrateAsync(previousVersion ? PreviousMigration : null);
            return database;
        }
        catch { await database.DisposeAsync(); throw; }
    }
    public async ValueTask DisposeAsync()
    {
        await Context.DisposeAsync();
        await using var admin = new NpgsqlConnection(adminConnection);
        await admin.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", admin);
        await command.ExecuteNonQueryAsync();
    }
}
