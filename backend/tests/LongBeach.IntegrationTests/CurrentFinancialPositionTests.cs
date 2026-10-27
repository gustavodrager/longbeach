using System.Net;
using System.Net.Http.Headers;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class CurrentFinancialPositionTests
{
    [Fact]
    public async Task Current_position_requires_management_even_with_finance_read_permission()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        const string path = "/api/v1/financial-history/current-position";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", [new("sub", Guid.NewGuid().ToString()), new(ClaimTypes.Role, "Operations"), new("permission", "finance:read")], DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), credentials);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", new JwtSecurityTokenHandler().WriteToken(token));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
    }

    [PostgresFact]
    public async Task Current_position_deducts_confirmed_net_once_and_keeps_pending_pix_and_bar_separate()
    {
        await using var db = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).Options, TimeProvider.System);
        await db.Database.MigrateAsync();
        var clock = new MidnightClock();
        var service = new FinancialHistoryService(db, new NullAuditContext(), clock, new ConfigurationBuilder().Build());
        var before = await service.CurrentPosition(default);
        var user = User.Create("Teste financeiro", "finance-" + Guid.NewGuid() + "@example.invalid", "test-only-hash");
        var entries = new[] { Entry("Receber", 100m), Entry("Receber", 25m), Entry("Pagar", 50m) };
        var account = new BillingAccount("Quadra", entries[0].Id, user.Id, null, user.Id);
        var pixAccount = new BillingAccount("Quadra", entries[1].Id, user.Id, null, user.Id);
        // Even a bar account whose source happens to match an entry must not be deducted here.
        var barAccount = new BillingAccount("Bar", entries[1].Id, user.Id, null, user.Id);
        var paid = new BillingPayment(account.Id, Guid.NewGuid(), 100m, "CreditCard", user.Id, clock.GetUtcNow().AddMinutes(10));
        paid.Observe("PAID", 40m, clock.GetUtcNow());
        var pending = new BillingPayment(pixAccount.Id, Guid.NewGuid(), 25m, "Pix", user.Id, clock.GetUtcNow().AddMinutes(10));
        var barPayment = new BillingPayment(barAccount.Id, Guid.NewGuid(), 25m, "Pix", user.Id, clock.GetUtcNow().AddMinutes(10));
        barPayment.Observe("PAID", 0, clock.GetUtcNow());
        db.Add(user); db.AddRange(entries); db.AddRange(account, pixAccount, barAccount, paid, pending, barPayment);
        await db.SaveChangesAsync();
        try
        {
            var result = await service.CurrentPosition(default);
            Assert.Equal(new DateOnly(2026, 10, 12), result.Date); // 02:30 UTC is still the previous local day.
            Assert.Equal(clock.GetUtcNow(), result.ReadAtUtc); Assert.NotNull(result.LastRecordChangeAtUtc);
            Assert.Equal(6500, result.Receivable.AmountCents - before.Receivable.AmountCents);
            Assert.Equal(6000, result.Receivable.ConfirmedPaymentsCents - before.Receivable.ConfirmedPaymentsCents);
            Assert.Equal(2, result.Receivable.Records - before.Receivable.Records);
            Assert.Equal(5000, result.Payable.AmountCents - before.Payable.AmountCents);
            Assert.Equal(3, result.RegisteredEntries - before.RegisteredEntries);
            var details = result.Entries.Where(x => entries.Select(e => e.Id).Contains(x.Id)).ToArray();
            Assert.Equal(6500, details.Where(x => x.Direction == "Receber").Sum(x => x.OutstandingCents));
            var partial = Assert.Single(details, x => x.Id == entries[0].Id);
            Assert.Equal(10000, partial.OriginalCents); Assert.Equal(6000, partial.ConfirmedPaymentsCents); Assert.Equal(4000, partial.OutstandingCents);
            Assert.Equal("NotConnected", result.CurrentBank.Status); Assert.Null(result.CurrentBank.AmountCents); Assert.Null(result.CurrentBank.AsOfUtc);
        }
        finally
        {
            db.RemoveRange(paid, pending, barPayment); await db.SaveChangesAsync();
            db.RemoveRange(account, pixAccount, barAccount); await db.SaveChangesAsync();
            db.RemoveRange(entries); db.Remove(user); await db.SaveChangesAsync();
        }
    }

    private static OperationalRecord Entry(string direction, decimal amount) => new(Guid.NewGuid(), "financeEntries", "Registro fictício", JsonSerializer.Serialize(new { direction, amount, status = "Pendente", dueDate = "2026-10-12" }));
    private sealed class MidnightClock : TimeProvider { public override DateTimeOffset GetUtcNow() => new(2026, 10, 13, 2, 30, 0, TimeSpan.Zero); }
}
