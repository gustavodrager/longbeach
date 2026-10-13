using System.Security.Cryptography;
using System.Text;
using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Bootstrap;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Infrastructure.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed class PagBankHomologationPostgresTests
{
    private const string ReviewerEmail = "avaliador@homolog.longbeach.invalid";
    private const string CustomerEmail = "recorrencia@homolog.longbeach.invalid";
    private const string ReviewerPassword = "isolated-homologation-test-password";
    private static IPasswordHasher Hasher() => new AspNetIdentityPasswordHasher(Options.Create(new PasswordHasherOptions { IterationCount = 1000 }));
    private static IConfiguration Config() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Homologation:Enabled"] = "true", ["Homologation:ReviewerPassword"] = ReviewerPassword,
        // Validate the production guard against its required name. The context
        // itself uses a new isolated schema in LONG_BEACH_TEST_DATABASE_URL.
        ["ConnectionStrings:LongBeach"] = "Host=localhost;Database=longbeach_pagbank_homolog;Username=test",
        ["Payments:PagBank:BaseUrl"] = "https://sandbox.api.pagseguro.com/"
    }).Build();

    [PostgresFact]
    public async Task Prepare_migrated_empty_database_creates_distinct_reviewer_and_customer_idempotently()
    {
        await using var isolated = await IsolatedDatabase.Create(); var db = isolated.Context; var hasher = Hasher();
        await PagBankHomologation.Prepare(db, hasher, Config(), new EnvironmentStub());
        db.ChangeTracker.Clear();
        var users = await db.Users.Include(x => x.UserRoles).ThenInclude(x => x.Role).ToListAsync(); Assert.Equal(2, users.Count);
        var reviewer = users.Single(x => x.Email == ReviewerEmail); var customer = users.Single(x => x.Email == CustomerEmail);
        Assert.Equal("Avaliador PagBank — TESTE", reviewer.Name); Assert.Equal("Cliente Recorrência — TESTE", customer.Name);
        Assert.Equal(SystemRoles.Administrator, Assert.Single(reviewer.UserRoles).Role.Name);
        Assert.Equal(SystemRoles.Student, Assert.Single(customer.UserRoles).Role.Name);
        Assert.Equal(PasswordHashVerificationResult.Success, hasher.Verify(ReviewerPassword, reviewer.PasswordHash));
        var customerPassword = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(ReviewerPassword + ":recorrencia-test")));
        Assert.Equal(PasswordHashVerificationResult.Success, hasher.Verify(customerPassword, customer.PasswordHash));
        Assert.Equal(PasswordHashVerificationResult.Failed, hasher.Verify(ReviewerPassword, customer.PasswordHash));
        Assert.Null(customer.GoogleSubject); Assert.False(customer.RequiresFirstAccess); Assert.True(customer.IsActive);
        var original = users.ToDictionary(x => x.Id, x => x.PasswordHash);
        await PagBankHomologation.Prepare(db, hasher, Config(), new EnvironmentStub()); db.ChangeTracker.Clear();
        var repeated = await db.Users.ToDictionaryAsync(x => x.Id, x => x.PasswordHash);
        Assert.Equal(original.OrderBy(x => x.Key), repeated.OrderBy(x => x.Key));
    }

    [PostgresFact]
    public async Task Prepare_adds_customer_to_existing_homologation_without_replacing_reviewer_password()
    {
        await using var isolated = await IsolatedDatabase.Create(); var db = isolated.Context; var hasher = Hasher();
        var admin = await db.Roles.SingleOrDefaultAsync(x => x.Name == SystemRoles.Administrator) ?? new Role(SystemRoles.Administrator);
        var student = await db.Roles.SingleOrDefaultAsync(x => x.Name == SystemRoles.Student) ?? new Role(SystemRoles.Student);
        if (db.Entry(admin).State == EntityState.Detached) db.Roles.Add(admin);
        if (db.Entry(student).State == EntityState.Detached) db.Roles.Add(student);
        var reviewer = User.Create("Avaliador PagBank — TESTE", ReviewerEmail, hasher.Hash("prior-reviewer-credential")); reviewer.AssignRole(admin); db.Users.Add(reviewer); await db.SaveChangesAsync();
        var originalHash = reviewer.PasswordHash; var originalId = reviewer.Id; db.ChangeTracker.Clear();
        await PagBankHomologation.Prepare(db, hasher, Config(), new EnvironmentStub()); db.ChangeTracker.Clear();
        var preserved = await db.Users.SingleAsync(x => x.Email == ReviewerEmail);
        Assert.Equal(originalId, preserved.Id); Assert.Equal(originalHash, preserved.PasswordHash);
        var customer = await db.Users.Include(x => x.UserRoles).ThenInclude(x => x.Role).SingleAsync(x => x.Email == CustomerEmail);
        Assert.Equal(SystemRoles.Student, Assert.Single(customer.UserRoles).Role.Name);
        Assert.Equal(2, await db.Users.CountAsync());
    }

    [PostgresFact]
    public async Task Prepare_refuses_database_with_unrelated_user_and_no_reviewer()
    {
        await using var isolated = await IsolatedDatabase.Create(); var db = isolated.Context;
        var existing = User.Create("Unrelated test", "unrelated@example.invalid", "untouched-test-hash"); db.Users.Add(existing); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => PagBankHomologation.Prepare(db, Hasher(), Config(), new EnvironmentStub()));
        db.ChangeTracker.Clear(); var remaining = Assert.Single(await db.Users.ToListAsync());
        Assert.Equal(existing.Id, remaining.Id); Assert.Equal("untouched-test-hash", remaining.PasswordHash);
    }

    [PostgresFact]
    public async Task Prepare_refuses_customer_with_unexpected_privileges_without_changing_credentials()
    {
        await using var isolated = await IsolatedDatabase.Create(); var db = isolated.Context; var hasher = Hasher();
        await PagBankHomologation.Prepare(db, hasher, Config(), new EnvironmentStub());
        var customer = await db.Users.Include(x => x.UserRoles).SingleAsync(x => x.Email == CustomerEmail);
        customer.AssignRole(await db.Roles.SingleAsync(x => x.Name == SystemRoles.Administrator)); await db.SaveChangesAsync();
        var hashes = await db.Users.ToDictionaryAsync(x => x.Id, x => x.PasswordHash); db.ChangeTracker.Clear();
        await Assert.ThrowsAsync<InvalidOperationException>(() => PagBankHomologation.Prepare(db, hasher, Config(), new EnvironmentStub()));
        db.ChangeTracker.Clear(); Assert.Equal(hashes.OrderBy(x => x.Key), (await db.Users.ToDictionaryAsync(x => x.Id, x => x.PasswordHash)).OrderBy(x => x.Key));
        Assert.Equal(2, (await db.Users.Include(x => x.UserRoles).SingleAsync(x => x.Email == CustomerEmail)).UserRoles.Count);
    }

    private sealed class EnvironmentStub : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Staging";
        public string ApplicationName { get; set; } = "HomologationTests";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class IsolatedDatabase(string connectionString, string schema, LongBeachDbContext context) : IAsyncDisposable
    {
        public LongBeachDbContext Context { get; } = context;
        public static async Task<IsolatedDatabase> Create()
        {
            var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")) { Pooling = false };
            var schema = "homolog_test_" + Guid.NewGuid().ToString("N");
            await using (var admin = new NpgsqlConnection(connection.ConnectionString))
            {
                await admin.OpenAsync(); await using var command = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", admin); await command.ExecuteNonQueryAsync();
            }
            var original = connection.ConnectionString; connection.SearchPath = schema;
            var context = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(connection.ConnectionString, options => options.MigrationsHistoryTable("__EFMigrationsHistory", schema)).Options, TimeProvider.System);
            var isolated = new IsolatedDatabase(original, schema, context);
            try { await context.Database.MigrateAsync(); return isolated; }
            catch { await isolated.DisposeAsync(); throw; }
        }
        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync(); await using var admin = new NpgsqlConnection(connectionString); await admin.OpenAsync();
            await using var command = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", admin); await command.ExecuteNonQueryAsync();
        }
    }
}
