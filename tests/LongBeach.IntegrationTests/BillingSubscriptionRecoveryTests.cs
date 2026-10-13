using System.Collections.Concurrent;
using System.Text.Json;
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

public sealed class BillingSubscriptionRecoveryTests
{
    [PostgresFact]
    public async Task Rejected_creation_is_terminal_for_its_operation_and_allows_a_corrected_new_adhesion()
    {
        var recurring = new Recurring { RejectCreate = true };
        await using var db = Database();
        var seed = await Seed(db, recurring);
        var service = Service(db, recurring);
        var input = Input(seed);

        var rejected = await service.Subscribe(seed.Account, input, seed.User, default);
        Assert.Equal("Rejected", rejected.State);
        Assert.False(rejected.CanResume);
        Assert.False(string.IsNullOrWhiteSpace(rejected.FailureReason));
        Assert.Equal(1, recurring.CreateCalls);

        recurring.RejectCreate = false;
        db.ChangeTracker.Clear();
        var replay = await service.Subscribe(seed.Account, input, seed.User, default);
        Assert.Equal(rejected.Id, replay.Id);
        Assert.Equal("Rejected", replay.State);
        Assert.Equal(1, recurring.CreateCalls);

        var corrected = await service.Subscribe(seed.Account, input with { OperationId = Guid.NewGuid() }, seed.User, default);
        Assert.NotEqual(rejected.Id, corrected.Id);
        Assert.Equal("ACTIVE", corrected.State);
        Assert.Equal(2, recurring.CreateCalls);
        Assert.Equal(2, await db.Set<BillingSubscription>().CountAsync(x => x.AccountId == seed.Account));
    }

    [PostgresFact]
    public async Task Unknown_creation_is_not_resent_after_restart_and_blocks_a_second_operation()
    {
        var recurring = new Recurring { LoseCreateResponse = true };
        Seeded seed;
        SubscribeInput input;
        await using (var db = Database())
        {
            seed = await Seed(db, recurring);
            input = Input(seed);
            await Assert.ThrowsAsync<HttpRequestException>(() => Service(db, recurring).Subscribe(seed.Account, input, seed.User, default));
            var pending = await db.Set<BillingSubscription>().SingleAsync(x => x.AccountId == seed.Account);
            Assert.Equal("Creating", pending.State);
            Assert.True(pending.CreationAttempted);
            Assert.Null(pending.ProviderId);
            Assert.Equal(1, recurring.CreateCalls);
        }

        await using var restarted = Database();
        var service = Service(restarted, recurring);
        var replay = await service.Subscribe(seed.Account, input, seed.User, default);
        Assert.Equal("Creating", replay.State);
        Assert.False(replay.CanResume);
        var refreshed = await service.RefreshSubscription(replay.Id, seed.User, default);
        Assert.Equal("Creating", refreshed.State);
        Assert.False(refreshed.CanResume);
        Assert.Equal(1, recurring.CreateCalls);
        Assert.True(recurring.FindSubscriptionCalls > 0);
        Assert.Equal("Creating", (await service.Subscriptions(seed.User, default)).Single().State);
        await Assert.ThrowsAsync<BarRuleException>(() => service.Subscribe(seed.Account, input with { OperationId = Guid.NewGuid() }, seed.User, default));
        Assert.Equal(1, recurring.CreateCalls);
        Assert.Equal(0, (await service.Account(seed.Account, seed.User, default)).Paid);
    }

    [PostgresFact]
    public async Task Unknown_creation_can_bind_the_authoritative_reference_without_another_provider_create()
    {
        var recurring = new Recurring { LoseCreateResponse = true };
        Seeded seed;
        Guid pendingId;
        await using (var db = Database())
        {
            seed = await Seed(db, recurring);
            await Assert.ThrowsAsync<HttpRequestException>(() => Service(db, recurring).Subscribe(seed.Account, Input(seed), seed.User, default));
            pendingId = (await db.Set<BillingSubscription>().SingleAsync(x => x.AccountId == seed.Account)).Id;
        }

        recurring.Publish(pendingId);
        await using var restarted = Database();
        var service = Service(restarted, recurring);
        await Assert.ThrowsAsync<BarTabAccessException>(() => service.RefreshSubscription(pendingId, Guid.NewGuid(), default));
        Assert.Equal(0, recurring.FindSubscriptionCalls);
        Assert.Equal(0, recurring.GetCalls);
        Assert.Equal(1, recurring.CreateCalls);
        Assert.Equal(0, recurring.CreateForCustomerCalls);

        // A refresh after restart uses only the persisted reference and user identity.
        var recovered = await service.RefreshSubscription(pendingId, seed.User, default);
        Assert.Equal(pendingId, recovered.Id);
        Assert.Equal("ACTIVE", recovered.State);
        Assert.False(recovered.CanResume);
        Assert.Equal(1, recurring.CreateCalls);
        Assert.Equal("SUBS_" + pendingId, (await restarted.Set<BillingSubscription>().SingleAsync(x => x.Id == pendingId)).ProviderId);
    }

    [PostgresFact]
    public async Task Unknown_creation_also_blocks_a_different_enrollment_owned_by_the_same_customer()
    {
        var recurring = new Recurring { LoseCreateResponse = true };
        await using var db = Database();
        var first = await Seed(db, recurring);
        var second = await Seed(db, recurring, first.User);
        var service = Service(db, recurring);
        await Assert.ThrowsAsync<HttpRequestException>(() => service.Subscribe(first.Account, Input(first), first.User, default));
        Assert.True((await db.Set<BillingSubscription>().SingleAsync(x => x.AccountId == first.Account)).CreationAttempted);

        var customerLookups = recurring.FindCustomerCalls;
        await Assert.ThrowsAsync<BarRuleException>(() => service.Subscribe(second.Account, Input(second) with { UpdateExistingCustomerCard = true }, second.User, default));
        Assert.Equal(customerLookups, recurring.FindCustomerCalls);
        Assert.Equal(1, recurring.CreateCalls);
        Assert.Equal(0, recurring.CreateForCustomerCalls);
        Assert.Empty(await db.Set<BillingSubscription>().Where(x => x.AccountId == second.Account).ToListAsync());
    }

    [PostgresFact]
    public async Task Legacy_creation_marked_uncertain_by_migration_also_blocks_another_enrollment()
    {
        var recurring = new Recurring();
        await using var db = Database();
        var first = await Seed(db, recurring);
        var second = await Seed(db, recurring, first.User);
        var legacy = new BillingSubscription(first.Account, Guid.NewGuid(), first.User, "enrollments", first.Enrollment, 100, first.Due, DateTimeOffset.UtcNow);
        legacy.Plan("PLAN_legacy");
        // The migration marks preexisting Creating rows as dispatched because their
        // old schema could not prove whether the external request had been sent.
        legacy.BeginCreation();
        db.Add(legacy);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<BarRuleException>(() => Service(db, recurring).Subscribe(second.Account, Input(second) with { UpdateExistingCustomerCard = true }, second.User, default));
        Assert.Equal(0, recurring.FindCustomerCalls);
        Assert.Equal(0, recurring.CreateCalls);
        Assert.Equal(0, recurring.CreateForCustomerCalls);
        Assert.Empty(await db.Set<BillingSubscription>().Where(x => x.AccountId == second.Account).ToListAsync());
    }

    [PostgresFact]
    public async Task Existing_customer_owned_by_another_user_is_rejected_even_with_card_update_consent()
    {
        var recurring = new Recurring();
        await using var db = Database();
        var seed = await Seed(db, recurring);
        var stranger = User.Create("Outro responsável", Guid.NewGuid() + "@example.invalid", "test-hash");
        db.Add(stranger);
        await db.SaveChangesAsync();
        recurring.Customer = new("CUST_foreign", stranger.Id.ToString(), "12345678909");

        var result = await Service(db, recurring).Subscribe(seed.Account, Input(seed) with { UpdateExistingCustomerCard = true }, seed.User, default);
        Assert.Equal("Rejected", result.State);
        Assert.False(result.CanResume);
        Assert.Equal(0, recurring.CreateCalls);
        Assert.Equal(0, recurring.CreateForCustomerCalls);
        Assert.Null((await db.Set<BillingSubscription>().SingleAsync(x => x.Id == result.Id)).ProviderId);
    }

    [PostgresFact]
    public async Task Own_legacy_subscription_reference_allows_explicit_customer_card_update()
    {
        var recurring = new Recurring();
        await using var db = Database();
        var seed = await Seed(db, recurring);
        var legacy = new BillingSubscription(seed.Account, Guid.NewGuid(), seed.User, "enrollments", seed.Enrollment, 100, seed.Due, DateTimeOffset.UtcNow);
        legacy.Observe("CANCELED");
        db.Add(legacy);
        await db.SaveChangesAsync();
        recurring.Customer = new("CUST_legacy", legacy.Id.ToString(), "12345678909");

        var result = await Service(db, recurring).Subscribe(seed.Account, Input(seed) with { UpdateExistingCustomerCard = true }, seed.User, default);
        Assert.Equal("ACTIVE", result.State);
        Assert.Equal(0, recurring.CreateCalls);
        Assert.Equal(1, recurring.CreateForCustomerCalls);
        Assert.Equal("CUST_legacy", recurring.CustomerUsed?.Id);
        Assert.True((await db.Set<BillingSubscription>().SingleAsync(x => x.Id == result.Id)).UpdateExistingCustomerCard);
    }

    [PostgresFact]
    public async Task Existing_own_customer_requires_separate_card_update_consent()
    {
        var recurring = new Recurring();
        await using var db = Database();
        var seed = await Seed(db, recurring);
        recurring.Customer = new("CUST_own", seed.User.ToString(), "12345678909");
        var service = Service(db, recurring);
        var input = Input(seed);

        var rejected = await service.Subscribe(seed.Account, input, seed.User, default);
        Assert.Equal("Rejected", rejected.State);
        Assert.Equal(0, recurring.CreateCalls);
        Assert.Equal(0, recurring.CreateForCustomerCalls);

        await Assert.ThrowsAsync<BarRuleException>(() => service.Subscribe(seed.Account, input with { UpdateExistingCustomerCard = true }, seed.User, default));
        Assert.Equal(0, recurring.CreateForCustomerCalls);
        var accepted = await service.Subscribe(seed.Account, input with { OperationId = Guid.NewGuid(), UpdateExistingCustomerCard = true }, seed.User, default);
        Assert.Equal("ACTIVE", accepted.State);
        Assert.Equal(1, recurring.CreateForCustomerCalls);
    }

    [PostgresFact]
    public async Task Invalid_documents_are_refused_before_an_intent_or_customer_lookup()
    {
        var recurring = new Recurring();
        await using var db = Database();
        var seed = await Seed(db, recurring);
        var service = Service(db, recurring);
        foreach (var invalid in new[] { "12345678900", "00000000000" })
            await Assert.ThrowsAsync<BarRuleException>(() => service.Subscribe(seed.Account, Input(seed) with { TaxId = invalid }, seed.User, default));

        Assert.Empty(await db.Set<BillingSubscription>().Where(x => x.AccountId == seed.Account).ToListAsync());
        Assert.Equal(0, recurring.FindCustomerCalls);
        Assert.Equal(0, recurring.CreateCalls);
    }

    [PostgresFact]
    public async Task Valid_cpf_and_cnpj_can_start_an_adhesion()
    {
        foreach (var document in new[] { "12345678909", "11222333000181" })
        {
            var recurring = new Recurring();
            await using var db = Database();
            var seed = await Seed(db, recurring);
            var result = await Service(db, recurring).Subscribe(seed.Account, Input(seed) with { TaxId = document }, seed.User, default);
            Assert.Equal("ACTIVE", result.State);
            Assert.Equal(1, recurring.FindCustomerCalls);
            Assert.Equal(1, recurring.CreateCalls);
        }
    }

    [PostgresFact]
    public async Task Fully_refunded_old_payment_does_not_prevent_a_new_subscription_and_first_invoice()
    {
        var recurring = new Recurring { IncludePaidInvoice = true };
        await using var db = Database();
        var seed = await Seed(db, recurring);
        var old = new BillingPayment(seed.Account, Guid.NewGuid(), 100, "Subscription", seed.User, DateTimeOffset.UtcNow);
        old.Bind("INVO_old_" + old.Id, "PAYM_old_" + old.Id, null, null);
        old.Observe("PAID", 100, DateTimeOffset.UtcNow);
        db.Add(old);
        await db.SaveChangesAsync();
        var service = Service(db, recurring);
        Assert.Equal(0, (await service.Account(seed.Account, seed.User, default)).Paid);

        var subscription = await service.Subscribe(seed.Account, Input(seed), seed.User, default);
        Assert.Equal("ACTIVE", subscription.State);
        var account = await service.Account(seed.Account, seed.User, default);
        Assert.Equal(100, account.Paid);
        Assert.Equal(0, account.Payable);
        Assert.Equal(2, account.Payments.Count);
        Assert.Equal("Refunded", account.Payments.Single(x => x.Id == old.Id).State);
        Assert.Single(account.Payments, x => x.State == "Approved");
    }

    [PostgresFact]
    public async Task Concurrent_adhesions_for_one_user_do_not_create_two_external_subscriptions()
    {
        var recurring = new Recurring { PauseCreate = true };
        Seeded seed;
        await using (var db = Database()) seed = await Seed(db, recurring);
        async Task<Exception?> Subscribe()
        {
            await using var db = Database();
            return await Record.ExceptionAsync(() => Service(db, recurring).Subscribe(seed.Account, Input(seed), seed.User, default));
        }
        var first = Subscribe();
        Task<Exception?> second;
        try
        {
            await recurring.CreateEntered.Task.WaitAsync(TimeSpan.FromSeconds(10));
            second = Subscribe();
        }
        finally { recurring.ReleaseCreate.TrySetResult(); }
        var results = await Task.WhenAll(first, second);
        Assert.Single(results, x => x is null);
        Assert.Single(results, x => x is BarRuleException);
        Assert.Equal(1, recurring.CreateCalls);
        await using var verify = Database();
        Assert.Single(await verify.Set<BillingSubscription>().Where(x => x.AccountId == seed.Account).ToListAsync());
    }

    private sealed record Seeded(Guid Account, Guid User, Guid Enrollment, DateOnly Due);
    private static LongBeachDbContext Database() => new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).Options, TimeProvider.System);
    private static BillingService Service(LongBeachDbContext db, Recurring recurring)
    {
        var payment = new PaymentGateway();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Payments:Billing:Enabled"] = "true" }).Build();
        return new(db, payment, new BarTabsService(db, payment, TimeProvider.System, config), recurring, new RentalGroupsService(db, TimeProvider.System), TimeProvider.System, NullLogger<BillingService>.Instance, config);
    }
    private static async Task<Seeded> Seed(LongBeachDbContext db, Recurring recurring, Guid? existingUser = null)
    {
        await db.Database.MigrateAsync();
        var user = existingUser.HasValue ? null : User.Create("Aluno recuperação", "subscription-recovery-" + Guid.NewGuid() + "@example.invalid", "test-hash");
        var userId = existingUser ?? user!.Id;
        var enrollment = Guid.NewGuid();
        var student = Guid.NewGuid();
        var entry = Guid.NewGuid();
        var due = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3)).AddDays(2);
        if (user is not null) db.Add(user);
        db.AddRange(
            new OperationalRecord(student, "students", "Aluno", JsonSerializer.Serialize(new { id = student, name = "Aluno" })),
            new OperationalRecord(enrollment, "enrollments", "Matrícula", JsonSerializer.Serialize(new { id = enrollment, name = "Matrícula", studentId = student })),
            new OperationalRecord(entry, "financeEntries", "Mensalidade", JsonSerializer.Serialize(new { id = entry, name = "Mensalidade", amount = 100m, dueDate = due.ToString("yyyy-MM-dd"), month = due.ToString("yyyy-MM"), direction = "Receber", origin = "Escola", sourceKind = "enrollments", sourceId = enrollment, status = "Pendente", paidDate = "", version = 1 })));
        await db.SaveChangesAsync();
        var account = await Service(db, recurring).Assign(new("Quadra", entry, userId, student), userId, default);
        return new(account.Id, userId, enrollment, due);
    }
    private static SubscribeInput Input(Seeded seed) => new(Guid.NewGuid(), "Aluno teste", "billing@example.invalid", "12345678909", "11999999999", "encrypted-card-only", true, 100, seed.Due, "123");

    private sealed class Recurring : IRecurringGateway
    {
        private readonly ConcurrentDictionary<Guid, RecurringState> subscriptions = new();
        public bool Enabled => true;
        public bool RejectCreate, LoseCreateResponse, IncludePaidInvoice, PauseCreate;
        public int CreateCalls, CreateForCustomerCalls, FindSubscriptionCalls, FindCustomerCalls, GetCalls;
        public RecurringCustomer? Customer, CustomerUsed;
        public TaskCompletionSource CreateEntered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource ReleaseCreate { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task<string?> PublicKey(CancellationToken ct) => Task.FromResult<string?>("test-key");
        public Task<string> CreatePlan(Guid reference, decimal amount, int trialDays, CancellationToken ct) => Task.FromResult("PLAN_" + reference);
        public Task<RecurringCustomer?> FindCustomer(string taxId, CancellationToken ct)
        {
            Interlocked.Increment(ref FindCustomerCalls);
            return Task.FromResult(Customer);
        }
        public Task<RecurringState?> FindSubscription(Guid reference, CancellationToken ct)
        {
            Interlocked.Increment(ref FindSubscriptionCalls);
            return Task.FromResult(subscriptions.GetValueOrDefault(reference));
        }
        public RecurringState Publish(Guid reference)
        {
            var state = new RecurringState("SUBS_" + reference, reference.ToString(), "ACTIVE", 10000, "BRL");
            subscriptions[reference] = state;
            return state;
        }
        public async Task<RecurringState> Create(Guid reference, Guid operation, string plan, SubscribeInput input, CancellationToken ct)
        {
            Interlocked.Increment(ref CreateCalls);
            CreateEntered.TrySetResult();
            if (PauseCreate) await ReleaseCreate.Task.WaitAsync(ct);
            if (RejectCreate) throw new RecurringCreationRejectedException("Cartão recusado pelo provedor de teste.");
            if (LoseCreateResponse) throw new HttpRequestException("A conexão terminou sem resposta de criação.");
            return Publish(reference);
        }
        public Task<RecurringState> CreateForCustomer(Guid reference, Guid operation, string plan, SubscribeInput input, RecurringCustomer customer, CancellationToken ct)
        {
            Interlocked.Increment(ref CreateForCustomerCalls);
            CustomerUsed = customer;
            return Task.FromResult(Publish(reference));
        }
        public Task<RecurringState> Get(string id, CancellationToken ct)
        {
            Interlocked.Increment(ref GetCalls);
            return Task.FromResult(subscriptions.Values.Single(x => x.Id == id));
        }
        public Task<RecurringState> Cancel(string id, Guid operation, CancellationToken ct) => throw new NotSupportedException();
        public Task<IReadOnlyList<RecurringInvoice>> Invoices(string id, CancellationToken ct) => Task.FromResult<IReadOnlyList<RecurringInvoice>>(IncludePaidInvoice ? [new("INVO_" + id, 1, "PAID", 10000, "BRL", "PAYM_" + id, "APPROVED")] : []);
        public Task Refund(string paymentId, Guid operation, decimal amount, decimal previous, CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class PaymentGateway : IPaymentGateway
    {
        public bool Enabled => true;
        public bool CardEnabled => true;
        public Task<GatewayPayment> CreatePix(Guid id, Guid operationId, decimal amount, DateTimeOffset expiresAt, PixCustomer customer, CancellationToken ct) => throw new NotSupportedException();
        public Task<GatewayPayment> CreateCard(Guid id, Guid operationId, decimal amount, PixCustomer customer, string encryptedCard, CancellationToken ct) => throw new NotSupportedException();
        public Task<GatewayPayment> Get(string id, CancellationToken ct) => throw new NotSupportedException();
        public Task<GatewayPayment> Refund(string id, Guid operationId, decimal amount, CancellationToken ct) => throw new NotSupportedException();
        public bool VerifyWebhook(byte[] body, IEnumerable<string> signatures) => false;
    }
}
