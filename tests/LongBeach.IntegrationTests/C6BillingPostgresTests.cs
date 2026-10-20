using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Bar;
using LongBeach.Application.Billing;
using LongBeach.Contracts.Billing;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Billing;
using LongBeach.Infrastructure.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace LongBeach.IntegrationTests;

public sealed class C6BillingPostgresTests
{
    private static LongBeachDbContext Database() => new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).Options, TimeProvider.System);
    private static BillingService Service(LongBeachDbContext db, Routes routes, bool billingEnabled = true) => new(db, routes.PagBank,
        new BarTabsService(db, routes.PagBank, TimeProvider.System, new ConfigurationBuilder().Build()), new Recurring(),
        new RentalGroupsService(db, TimeProvider.System), TimeProvider.System, NullLogger<BillingService>.Instance,
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Payments:Billing:Enabled"] = billingEnabled.ToString() }).Build(), routes);

    private static async Task<(Guid Account, Guid User, Guid Entry)> Seed(LongBeachDbContext db, Routes routes)
    {
        await db.Database.MigrateAsync();
        var user = User.Create("Teste C6", "c6-billing-" + Guid.NewGuid() + "@example.invalid", "test-hash");
        var student = Guid.NewGuid(); var enrollment = Guid.NewGuid(); var entry = Guid.NewGuid();
        db.Add(user);
        db.AddRange(new OperationalRecord(student, "students", "Aluno", JsonSerializer.Serialize(new { id = student, name = "Aluno" })),
            new OperationalRecord(enrollment, "enrollments", "Matrícula", JsonSerializer.Serialize(new { id = enrollment, studentId = student })),
            new OperationalRecord(entry, "financeEntries", "Mensalidade", JsonSerializer.Serialize(new
            {
                id = entry, name = "Mensalidade", amount = 100m, dueDate = "2026-10-20", month = "2026-10", direction = "Receber",
                origin = "Escola", sourceKind = "enrollments", sourceId = enrollment, status = "Pendente", paidDate = "", version = 1
            })));
        await db.SaveChangesAsync();
        var account = await Service(db, routes).Assign(new("Quadra", entry, user.Id, student), user.Id, default);
        return (account.Id, user.Id, entry);
    }
    private static PayAccountInput Input(string method = "Pix") => new(Guid.NewGuid(), method, "Teste", "c6@example.invalid", "12345678909", method == "CreditCard" ? "encrypted" : null);
    private static byte[] Hint(Guid operation) => Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { pix = new[] { new { txid = operation.ToString("N"), valor = "999999.00" } } }));
    private static byte[] WrappedHint(object receipt, string key = "test-pix-key", string service = "PIX") => Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
    {
        date_time = "2026-10-19T12:00:00Z", status = "PAID", service, key, tax_id = "test-only",
        information = JsonSerializer.Serialize(new { pix = new[] { receipt } })
    }));

    [PostgresFact]
    public async Task Timeout_keeps_provider_scope_and_recovers_once_when_new_C6_payments_are_disabled()
    {
        await using var db = Database(); var routes = new Routes(); var seed = await Seed(db, routes); var service = Service(db, routes); var input = Input();
        routes.C6.TimeoutAfterCreation = true;
        await Assert.ThrowsAsync<BarPaymentConfirmationPendingException>(() => service.Pay(seed.Account, input, seed.User, true, default));
        var payment = await db.Set<BillingPayment>().SingleAsync(p => p.AccountId == seed.Account);
        Assert.Equal("C6", payment.Provider); Assert.Equal("Sandbox", payment.ProviderEnvironment); Assert.Equal("account-test", payment.ProviderAccountId);
        Assert.Null(payment.ProviderId); Assert.Equal(1, routes.C6.Created); Assert.Equal(0, routes.PagBank.Created);
        routes.C6.TimeoutAfterCreation = false; routes.C6.CreateEnabled = false; routes.NewC6Enabled = false; routes.C6.State = "PAID";
        Assert.True(await service.C6PixNotification(Hint(input.OperationId), default));
        var version = JsonNode.Parse((await db.OperationalRecords.SingleAsync(x => x.Id == seed.Entry)).Payload)!["version"]!.GetValue<int>();
        Assert.True(await service.C6PixNotification(Hint(input.OperationId), default));
        await service.Refresh(seed.Account, payment.Id, seed.User, true, default);
        Assert.Equal(version, JsonNode.Parse((await db.OperationalRecords.SingleAsync(x => x.Id == seed.Entry)).Payload)!["version"]!.GetValue<int>());
        Assert.Equal("C6", JsonNode.Parse((await db.OperationalRecords.SingleAsync(x => x.Id == seed.Entry)).Payload)!["receivingAccount"]!.GetValue<string>());
        Assert.Equal(100, (await service.Account(seed.Account, seed.User, default)).Paid);
        Assert.Equal(1, await db.Set<BillingProviderOrder>().CountAsync(x => x.PaymentId == payment.Id));
        Assert.Equal(1, routes.C6.Created); Assert.Equal(0, routes.PagBank.Created);
        Assert.False(await service.RefreshNotificationHint(payment.ProviderId!, default));
        var refunded = await service.Refund(seed.Account, payment.Id, new(Guid.NewGuid(), 40, "Estorno de teste"), seed.User, default);
        Assert.Equal(60, refunded.Paid); Assert.Equal(1, routes.C6.RefundCalls); Assert.Equal(0, routes.PagBank.RefundCalls);
    }

    [PostgresFact]
    public async Task Periodic_recovery_finds_an_unbound_C6_receipt_without_a_callback_and_without_new_creation()
    {
        await using var db = Database(); var routes = new Routes(); var seed = await Seed(db, routes); var service = Service(db, routes);
        routes.C6.TimeoutAfterCreation = true;
        await Assert.ThrowsAsync<BarPaymentConfirmationPendingException>(() => service.Pay(seed.Account, Input(), seed.User, true, default));
        routes.C6.TimeoutAfterCreation = false; routes.C6.CreateEnabled = false; routes.NewC6Enabled = false; routes.C6.State = "PAID";
        await service.Recover(default);
        Assert.Equal(100, (await service.Account(seed.Account, seed.User, default)).Paid);
        Assert.Equal(1, routes.C6.Created); Assert.Equal(0, routes.PagBank.Created);
    }

    [PostgresFact]
    public async Task Callback_rejects_authoritative_mismatch_and_never_requests_unknown_or_wrong_scope_payments()
    {
        await using var db = Database(); var routes = new Routes(); var seed = await Seed(db, routes); var service = Service(db, routes); var input = Input();
        await service.Pay(seed.Account, input, seed.User, true, default); routes.C6.State = "PAID";
        var calls = routes.C6.GetCalls;
        Assert.False(await service.C6PixNotification(Hint(Guid.NewGuid()), default)); Assert.Equal(calls, routes.C6.GetCalls);
        routes.AccountId = "another-account";
        Assert.False(await service.C6PixNotification(Hint(input.OperationId), default)); Assert.Equal(calls, routes.C6.GetCalls);
        var payment = await db.Set<BillingPayment>().SingleAsync(p => p.AccountId == seed.Account);
        await Assert.ThrowsAsync<BarRuleException>(() => service.Refresh(seed.Account, payment.Id, seed.User, true, default));
        routes.AccountId = "account-test";
        foreach (Func<GatewayPayment, GatewayPayment> corrupt in new Func<GatewayPayment, GatewayPayment>[]
        {
            p => p with { Amount = p.Amount + 1 }, p => p with { Reference = Guid.NewGuid().ToString() },
            p => p with { ProviderAccountId = "another-account" }, p => p with { ProviderEnvironment = "Production" },
            p => p with { PixEndToEndId = null }, p => p with { ChargeId = "other-txid" }
        })
        {
            routes.C6.Corrupt = corrupt;
            await Assert.ThrowsAsync<BarRuleException>(() => service.C6PixNotification(Hint(input.OperationId), default));
            Assert.Equal(0, (await service.Account(seed.Account, seed.User, default)).Paid);
        }
        routes.C6.Corrupt = p => p;
        Assert.True(await service.C6PixNotification(Hint(input.OperationId), default));
        Assert.Equal(100, (await service.Account(seed.Account, seed.User, default)).Paid);
    }

    [PostgresFact]
    public async Task Persisted_C6_operation_can_resume_read_only_with_all_new_billing_disabled()
    {
        await using var db = Database(); var routes = new Routes(); var seed = await Seed(db, routes); var input = Input();
        routes.C6.TimeoutAfterCreation = true;
        await Assert.ThrowsAsync<BarPaymentConfirmationPendingException>(() => Service(db, routes).Pay(seed.Account, input, seed.User, true, default));
        routes.C6.TimeoutAfterCreation = false; routes.C6.CreateEnabled = false; routes.NewC6Enabled = false; routes.C6.State = "PAID";
        var suspended = Service(db, routes, billingEnabled: false);
        Assert.False((await suspended.Config(default)).PixEnabled);
        Assert.Equal(100, (await suspended.Pay(seed.Account, input, seed.User, true, default)).Paid);
        var another = await Seed(db, routes);
        await Assert.ThrowsAsync<BarRuleException>(() => suspended.Pay(another.Account, Input(), another.User, true, default));
        Assert.Equal(1, routes.C6.Created); Assert.Equal(0, routes.PagBank.Created);
    }

    [PostgresFact]
    public async Task Official_wrapped_webhook_matches_scoped_txid_or_known_receipt_and_never_trusts_the_envelope()
    {
        await using var db = Database(); var routes = new Routes(); var seed = await Seed(db, routes); var service = Service(db, routes); var input = Input();
        await service.Pay(seed.Account, input, seed.User, true, default);
        var txid = new { txid = input.OperationId.ToString("N"), valor = "999999.00", chave = "test-pix-key" };
        var calls = routes.C6.GetCalls;
        Assert.False(await service.C6PixNotification(WrappedHint(txid, key: "different-key"), default));
        Assert.False(await service.C6PixNotification(WrappedHint(txid, service: "BOLETO"), default));
        Assert.False(await service.C6PixNotification(WrappedHint(new { txid = input.OperationId.ToString("N"), chave = "different-key" }), default));
        Assert.False(await service.C6PixNotification(WrappedHint(new { endToEndId = "E" + Guid.NewGuid().ToString("N")[..31], chave = "test-pix-key" }), default));
        Assert.Equal(calls, routes.C6.GetCalls);
        Assert.True(await service.C6PixNotification(WrappedHint(txid), default));
        Assert.Equal(0, (await service.Account(seed.Account, seed.User, default)).Paid); // Envelope said PAID; API still WAITING.
        routes.C6.State = "PAID";
        await service.Refresh(seed.Account, (await service.Account(seed.Account, seed.User, default)).Payments.Single().Id, seed.User, true, default);
        var payment = await db.Set<BillingPayment>().SingleAsync(p => p.AccountId == seed.Account);
        var receipt = new { endToEndId = payment.PixEndToEndId, valor = "999999.00", chave = "test-pix-key", horario = "2026-10-19T12:00:00Z" };
        calls = routes.C6.GetCalls;
        Assert.True(await service.C6PixNotification(WrappedHint(receipt), default));
        Assert.Equal(calls + 1, routes.C6.GetCalls);
        Assert.Equal(100, (await service.Account(seed.Account, seed.User, default)).Paid);
        routes.AccountId = "another-account";
        Assert.False(await service.C6PixNotification(WrappedHint(receipt), default));
        Assert.Equal(calls + 1, routes.C6.GetCalls);
    }

    [PostgresFact]
    public async Task Existing_PagBank_pix_and_new_cards_do_not_switch_to_C6()
    {
        await using var db = Database(); var routes = new Routes { NewC6Enabled = false }; var seed = await Seed(db, routes); var service = Service(db, routes);
        var input = Input(); var account = await service.Pay(seed.Account, input, seed.User, true, default); var payment = account.Payments.Single();
        routes.NewC6Enabled = true; routes.PagBank.State = "PAID";
        Assert.Equal(100, (await service.Refresh(seed.Account, payment.Id, seed.User, true, default)).Paid);
        await service.Refund(seed.Account, payment.Id, new(Guid.NewGuid(), 100, "Teste roteamento"), seed.User, default);
        Assert.Equal(1, routes.PagBank.RefundCalls); Assert.Equal(0, routes.C6.GetCalls);
        var other = await Seed(db, routes);
        await service.Pay(other.Account, Input("CreditCard"), other.User, true, default);
        Assert.Equal(2, routes.PagBank.Created); Assert.Equal(0, routes.C6.Created);
        Assert.All(await db.Set<BillingPayment>().Where(p => p.AccountId == seed.Account || p.AccountId == other.Account).ToListAsync(), p => Assert.Equal("PagBank", p.Provider));
    }

    private sealed class Routes : IBillingPaymentGateways
    {
        public readonly Gateway PagBank = new(false), C6 = new(true);
        public bool NewC6Enabled = true;
        public string AccountId = "account-test";
        public BillingGatewaySelection NewCourtPix() => NewC6Enabled ? new("C6", "Sandbox", AccountId, C6) : new("PagBank", null, null, PagBank);
        public bool MatchesC6Scope(BillingPayment payment) => payment.Provider == "C6" && payment.ProviderEnvironment == "Sandbox" && payment.ProviderAccountId == AccountId;
        public bool MatchesC6WebhookKey(string key) => key == "test-pix-key";
        public IPaymentGateway For(BillingPayment payment) => payment.Provider == "PagBank" ? PagBank : MatchesC6Scope(payment) ? C6 : throw new BarRuleException("Outra conta");
    }
    private sealed class Gateway(bool c6) : IPaymentGateway
    {
        private readonly Dictionary<Guid, GatewayPayment> orders = new();
        public bool CreateEnabled = true, TimeoutAfterCreation;
        public bool Enabled => CreateEnabled;
        public bool CardEnabled => !c6;
        public int Created, GetCalls, RefundCalls;
        public string State = "WAITING";
        private long refunded;
        public Func<GatewayPayment, GatewayPayment> Corrupt = p => p;
        public Task<GatewayPayment> CreatePix(Guid id, Guid operation, decimal amount, DateTimeOffset expires, PixCustomer customer, CancellationToken ct)
        {
            if (!CreateEnabled) throw new BarRuleException("Criação desabilitada");
            if (!orders.TryGetValue(operation, out var remote))
            {
                Created++;
                var txid = c6 ? operation.ToString("N") : "ORDE_" + id;
                orders[operation] = remote = new(txid, txid, id.ToString(), "WAITING", (long)(amount * 100), "BRL", "copia", null, 0, c6 ? "account-test" : null, c6 ? "Sandbox" : null);
            }
            if (TimeoutAfterCreation) throw new HttpRequestException("Resposta perdida após criação");
            return Task.FromResult(remote);
        }
        public Task<GatewayPayment> CreateCard(Guid id, Guid op, decimal amount, PixCustomer customer, string card, CancellationToken ct) => CreatePix(id, op, amount, DateTimeOffset.UtcNow, customer, ct);
        public Task<GatewayPayment> Get(string id, CancellationToken ct)
        {
            GetCalls++; var payment = orders.Values.Single(p => p.OrderId == id);
            return Task.FromResult(Corrupt(payment with { State = State, Refunded = refunded, PixEndToEndId = c6 && State == "PAID" ? "E" + payment.OrderId[..31] : null }));
        }
        public Task<GatewayPayment> Refund(string id, Guid operation, decimal amount, CancellationToken ct) => RefundPartial(id, operation, amount, 0, ct);
        public Task<GatewayPayment> RefundPartial(string id, Guid operation, decimal amount, decimal previous, CancellationToken ct)
        { RefundCalls++; refunded = (long)((previous + amount) * 100); return Get(id, ct); }
        public bool VerifyWebhook(byte[] body, IEnumerable<string> signatures) => false;
    }
    private sealed class Recurring : IRecurringGateway
    {
        public bool Enabled => false;
        public Task<string?> PublicKey(CancellationToken ct) => Task.FromResult<string?>(null);
        public Task<string> CreatePlan(Guid reference, decimal amount, int trial, CancellationToken ct) => throw new NotSupportedException();
        public Task<RecurringState> Create(Guid reference, Guid op, string plan, SubscribeInput input, CancellationToken ct) => throw new NotSupportedException();
        public Task<RecurringState> Get(string id, CancellationToken ct) => throw new NotSupportedException();
        public Task<RecurringState> Cancel(string id, Guid operation, CancellationToken ct) => throw new NotSupportedException();
        public Task<IReadOnlyList<RecurringInvoice>> Invoices(string id, CancellationToken ct) => throw new NotSupportedException();
        public Task Refund(string id, Guid op, decimal amount, decimal previous, CancellationToken ct) => throw new NotSupportedException();
    }
}
