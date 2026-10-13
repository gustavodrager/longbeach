using LongBeach.Application.Abstractions;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace LongBeach.Infrastructure.Bootstrap;

public static class PagBankHomologation
{
    public static bool Enabled(IConfiguration config, IHostEnvironment environment) =>
        environment.IsStaging() && config.GetValue("Homologation:Enabled", false);

    public static void Validate(IConfiguration config, IHostEnvironment environment)
    {
        if (!config.GetValue("Homologation:Enabled", false)) return;
        var database = new NpgsqlConnectionStringBuilder(config.GetConnectionString("LongBeach"));
        if (!environment.IsStaging() || database.Database != "longbeach_pagbank_homolog" ||
            config["Payments:PagBank:BaseUrl"] != "https://sandbox.api.pagseguro.com/" ||
            config.GetValue("Integrations:PagBankEdi:Enabled", false) ||
            config.GetValue("Payments:PagBankSubscriptions:Enabled", false) ||
            config.GetValue("DemoMode:PublicOperationalData", false))
            throw new InvalidOperationException("Homologation requires Staging, its exclusive database and PagBank Sandbox; EDI, subscriptions and public demo must be disabled.");
    }

    public static async Task Prepare(LongBeachDbContext db, IPasswordHasher hasher, IConfiguration config, IHostEnvironment environment)
    {
        Validate(config, environment);
        if (!Enabled(config, environment)) throw new InvalidOperationException("Enable the isolated homologation environment first.");
        var password = config["Homologation:ReviewerPassword"];
        if (string.IsNullOrWhiteSpace(password) || password.Length < 20)
            throw new InvalidOperationException("Configure a unique reviewer password of at least 20 characters.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031906)");
        const string email = "avaliador@homolog.longbeach.invalid";
        var user = await db.Users.Include(x => x.UserRoles).SingleOrDefaultAsync(x => x.NormalizedEmail == User.NormalizeEmail(email));
        if (user is not null)
        {
            if (!user.IsActive || user.Name != "Avaliador PagBank — TESTE" || user.UserRoles.Count != 1 ||
                !await db.Roles.AnyAsync(x => x.Id == user.UserRoles.First().RoleId && x.Name == SystemRoles.Administrator))
                throw new InvalidOperationException("Existing reviewer conflicts with homologation; no account was changed.");
            return;
        }
        if (await db.Users.AnyAsync()) throw new InvalidOperationException("Initialize homologation only in a new database.");
        var permissions = await db.Permissions.ToDictionaryAsync(x => x.Name);
        foreach (var name in SystemPermissions.All)
            if (!permissions.ContainsKey(name)) { var permission = new Permission(name); permissions.Add(name, permission); db.Permissions.Add(permission); }
        var roles = await db.Roles.Include(x => x.RolePermissions).ToDictionaryAsync(x => x.Name);
        foreach (var name in SystemRoles.All)
        {
            if (!roles.TryGetValue(name, out var role)) { role = new Role(name); roles.Add(name, role); db.Roles.Add(role); }
            foreach (var permission in ProfileAccess.Grants[name]) role.Grant(permissions[permission]);
        }
        user = User.Create("Avaliador PagBank — TESTE", email, hasher.Hash(password));
        user.AssignRole(roles[SystemRoles.Administrator]);
        db.Users.Add(user);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
    }
}
