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

public sealed class BillingPostgresTests
{
    private static LongBeachDbContext Database() => new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).Options, TimeProvider.System);
    private static BillingService Service(LongBeachDbContext db, Gateway gateway, Recurring? recurring = null) => new(db, gateway, new BarTabsService(db, gateway, TimeProvider.System, new ConfigurationBuilder().Build()), recurring ?? new(), new RentalGroupsService(db, TimeProvider.System), TimeProvider.System, NullLogger<BillingService>.Instance, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Payments:Billing:Enabled"] = "true" }).Build());
    private static async Task<(Guid Account, Guid User, Guid Entry)> Seed(LongBeachDbContext db, Gateway gateway, Recurring? recurring = null, string status = "Pendente")
    {
        await db.Database.MigrateAsync(); var user = User.Create("Aluno teste", "billing-" + Guid.NewGuid() + "@example.invalid", "test-hash"); db.Add(user);
        var student = Guid.NewGuid(); var enrollment = Guid.NewGuid(); var entry = Guid.NewGuid(); var due = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3)).AddDays(2);
        db.AddRange(new OperationalRecord(student, "students", "Aluno", JsonSerializer.Serialize(new { id = student, name = "Aluno" })), new OperationalRecord(enrollment, "enrollments", "Matrícula", JsonSerializer.Serialize(new { id = enrollment, name = "Matrícula", studentId = student })), new OperationalRecord(entry, "financeEntries", "Mensalidade", JsonSerializer.Serialize(new { id = entry, name = "Mensalidade", amount = 100m, dueDate = due.ToString("yyyy-MM-dd"), month = due.ToString("yyyy-MM"), direction = "Receber", origin = "Escola", sourceKind = "enrollments", sourceId = enrollment, status, paidDate = status == "Pago" ? due.AddDays(-2).ToString("yyyy-MM-dd") : "", version = 1 })));
        await db.SaveChangesAsync(); var account = await Service(db, gateway, recurring).Assign(new("Quadra", entry, user.Id, student), user.Id, default); return (account.Id, user.Id, entry);
    }
    private static PayAccountInput Input(string method = "Pix") => new(Guid.NewGuid(), method, "Aluno teste", "billing@example.invalid", "12345678909", method == "CreditCard" ? "encrypted-card-only" : null);
    [PostgresFact]
    public async Task Assigned_court_account_preserves_classification_before_and_after_payment_creation()
    {
        await using var db = Database(); var gateway = new Gateway(); var seed = await Seed(db, gateway);
        var saved = (await db.OperationalRecords.SingleAsync(x => x.Id == seed.Entry)).Payload;
        foreach (var paid in new[] { false, true })
        {
            if (paid) await Service(db, gateway).Pay(seed.Account, Input(), seed.User, true, default);
            var contradictory = JsonNode.Parse(saved)!.AsObject(); contradictory["origin"] = "Arena";
            contradictory["allocationScope"] = "Unit"; contradictory["businessUnitId"] = "bar";
            contradictory["receiptSource"] = "PagVendas";
            var error = await Assert.ThrowsAsync<BarRuleException>(() => BillingWriteGuard.Check(db, seed.Entry, contradictory, saved, default));
            Assert.Contains("conta da Quadra", error.Message);
            var compatible = JsonNode.Parse(saved)!.AsObject(); compatible["allocationScope"] = "Unit"; compatible["businessUnitId"] = "quadra";
            compatible["receiptSource"] = "CourtPix"; compatible["receivingAccount"] = "PagBank";
            await BillingWriteGuard.Check(db, seed.Entry, compatible, saved, default);
        }
        Assert.Equal(1, gateway.Created);
    }

    [PostgresFact]
    public async Task Bar_receipt_cannot_become_a_court_account_or_start_a_court_payment()
    {
        await using var db = Database(); var gateway = new Gateway(); var seed = await Seed(db, gateway); var service = Service(db, gateway);
        var template = JsonNode.Parse((await db.OperationalRecords.SingleAsync(x => x.Id == seed.Entry)).Payload)!.AsObject();
        foreach (var receiptSource in new[] { "PagBankTerminal", "PagVendas" })
        {
            var id = Guid.NewGuid(); var body = template.DeepClone().AsObject(); body["id"] = id.ToString(); body["origin"] = "Arena";
            body["allocationScope"] = "Unit"; body["businessUnitId"] = "bar"; body["receiptSource"] = receiptSource;
            db.Add(new OperationalRecord(id, "financeEntries", "Venda do Bar", body.ToJsonString())); await db.SaveChangesAsync();
            Assert.DoesNotContain((await service.Candidates(default)).Accounts, candidate => candidate.Id == id);
            var assignError = await Assert.ThrowsAsync<BarRuleException>(() => service.Assign(new("Quadra", id, seed.User), seed.User, default));
            Assert.Contains("Escolha uma cobrança", assignError.Message);

            // Guard payment initiation even if a historical account had an inconsistent link.
            var oldAccount = new BillingAccount("Quadra", id, seed.User, null, seed.User); db.Add(oldAccount); await db.SaveChangesAsync();
            Assert.False((await service.Account(oldAccount.Id, seed.User, default)).RecurringEligible);
            await Assert.ThrowsAsync<BarRuleException>(() => service.Pay(oldAccount.Id, Input(), seed.User, true, default));
        }
        Assert.Equal(0, gateway.Created);
    }
    [PostgresFact]
    public async Task Unsigned_hint_requires_bound_order_and_authoritative_amount_before_settlement()
    {
        await using var db = Database(); var gateway = new Gateway(); var seed = await Seed(db, gateway); var service = Service(db, gateway);
        var account = await service.Pay(seed.Account, Input(), seed.User, true, default);
        var payment = await db.Set<BillingPayment>().SingleAsync(x => x.Id == account.Payments.Single().Id);
        Assert.False(await service.RefreshNotificationHint("ORDE_unknown", default));
        gateway.State = "PAID"; gateway.WrongAmount = true;
        await Assert.ThrowsAsync<BarRuleException>(() => service.RefreshNotificationHint(payment.ProviderId!, default));
        Assert.Equal(0, (await service.Account(seed.Account, seed.User, default)).Paid);
        gateway.WrongAmount = false;
        Assert.True(await service.RefreshNotificationHint(payment.ProviderId!, default));
        Assert.True(await service.RefreshNotificationHint(payment.ProviderId!, default));
        Assert.Equal(100, (await service.Account(seed.Account, seed.User, default)).Paid);
        Assert.False(await service.Webhook(System.Text.Encoding.UTF8.GetBytes("{}"), [], default));
    }
    [PostgresFact]
    public async Task Student_isolation_timeout_replay_authoritative_settlement_and_partial_refund()
    {
        await using var db = Database(); var gateway = new Gateway { Timeout = true }; var seed = await Seed(db, gateway); var service = Service(db, gateway); var input = Input(); var stranger = Guid.NewGuid();
        Assert.Empty(await service.Accounts(stranger, default));
        await Assert.ThrowsAsync<BarTabAccessException>(() => service.Account(seed.Account, stranger, default));
        await Assert.ThrowsAsync<BarTabAccessException>(() => service.Pay(seed.Account, input, stranger, true, default));
        await Assert.ThrowsAsync<BarPaymentConfirmationPendingException>(() => service.Pay(seed.Account, input, seed.User, true, default));
        var pending = await service.Account(seed.Account, seed.User, default); Assert.Equal(100, pending.Pending); Assert.Equal(0, pending.Payable);
        await Assert.ThrowsAsync<BarRuleException>(() => service.Pay(seed.Account, Input(), seed.User, false, default));
        gateway.Timeout = false; pending = await service.Pay(seed.Account, input, seed.User, true, default); Assert.Equal(1, gateway.Created); var p = Assert.Single(pending.Payments);
        gateway.State = "PAID"; gateway.WrongAmount = true; await Assert.ThrowsAsync<BarRuleException>(() => service.Refresh(seed.Account, p.Id, seed.User, true, default));
        Assert.Equal(0, (await service.Account(seed.Account, seed.User, default)).Paid); gateway.WrongAmount = false;
        var paid = await service.Refresh(seed.Account, p.Id, seed.User, true, default); Assert.Equal(100, paid.Paid);
        var version = JsonNode.Parse((await db.OperationalRecords.SingleAsync(x => x.Id == seed.Entry)).Payload)!["version"]!.GetValue<int>();
        await service.Refresh(seed.Account, p.Id, seed.User, true, default); Assert.Equal(version, JsonNode.Parse((await db.OperationalRecords.SingleAsync(x => x.Id == seed.Entry)).Payload)!["version"]!.GetValue<int>());
        var refund = new RefundInput(Guid.NewGuid(), 40, "Devolução parcial"); await service.Refund(seed.Account, p.Id, refund, seed.User, default); await service.Refund(seed.Account, p.Id, refund, seed.User, default);
        var result = await service.Account(seed.Account, seed.User, default); Assert.Equal(60, result.Paid); Assert.Equal(40, result.Payable); Assert.Equal(1, gateway.RefundedCalls);
        Assert.Equal(1, await db.Set<BillingRefund>().CountAsync(x => x.PaymentId == p.Id));
        var saved = (await db.OperationalRecords.SingleAsync(x => x.Id == seed.Entry)).Payload; var changed = JsonNode.Parse(saved)!.AsObject(); changed["amount"] = 120;
        await Assert.ThrowsAsync<BarRuleException>(() => BillingWriteGuard.Check(db, seed.Entry, changed, saved, default));
        Assert.False(await service.Webhook(System.Text.Encoding.UTF8.GetBytes("{}"), ["invalid"], default));
    }
    [PostgresFact]
    public async Task Concurrent_checkout_creates_one_intent_and_preserves_manual_payment()
    {
        var gateway = new Gateway(); Guid account, user;
        await using (var db = Database()) { var seed = await Seed(db, gateway); account = seed.Account; user = seed.User; }
        async Task<bool> Pay() { await using var db = Database(); try { await Service(db, gateway).Pay(account, Input(), user, true, default); return true; } catch (BarRuleException) { return false; } }
        var results = await Task.WhenAll(Pay(), Pay()); Assert.Single(results, x => x); Assert.Equal(1, gateway.Created);
        await using var verify = Database(); var manual = await Seed(verify, gateway, status: "Pago"); var service = Service(verify, gateway); Assert.Equal(100, (await service.Account(manual.Account, manual.User, default)).Paid);
        await Assert.ThrowsAsync<BarRuleException>(() => service.Pay(manual.Account, Input(), manual.User, true, default));
    }
    [PostgresFact]
    public async Task Subscription_hints_bind_only_validated_ids_and_defer_invoice_reconciliation_to_worker()
    {
        Guid subscriptionId, accountId, userId;
        var gateway = new Gateway(); var recurring = new Recurring();
        await using (var db = Database())
        {
            var seed = await Seed(db, gateway, recurring); accountId = seed.Account; userId = seed.User;
            var service = Service(db, gateway, recurring); var account = await service.Account(accountId, userId, default);
            var entry = JsonNode.Parse((await db.OperationalRecords.SingleAsync(x => x.Id == seed.Entry)).Payload)!;
            var subscription = new BillingSubscription(accountId, Guid.NewGuid(), userId, "enrollments", Guid.Parse(entry["sourceId"]!.GetValue<string>()), 100, account.DueDate!.Value, DateTimeOffset.UtcNow);
            db.Add(subscription); await db.SaveChangesAsync(); subscriptionId = subscription.Id;
            var input = new SubscribeInput(subscription.OperationId, "Aluno teste", "test@example.invalid", "12345678909", "11999999999", "encrypted", true, 100, subscription.FirstDue, "123");
            await recurring.Create(subscriptionId, input.OperationId, "PLAN_test", input, default);
            byte[] Hint(string id) => JsonSerializer.SerializeToUtf8Bytes(new { resource = new { id, reference_id = subscriptionId, status = "CANCELED", amount = new { value = 999 } } });
            Assert.False(await service.SubscriptionWebhook(Hint("CUST_test"), default));
            Assert.False(await service.SubscriptionWebhook(JsonSerializer.SerializeToUtf8Bytes(new { resource = new { id = 3 } }), default));
            recurring.WrongAmount = true;
            await Assert.ThrowsAsync<BarRuleException>(() => service.SubscriptionWebhook(Hint("SUBS_" + subscriptionId), default));
            Assert.Null(subscription.ProviderId);
            recurring.WrongAmount = false;
            recurring.FailInvoices = true;
            Assert.True(await service.SubscriptionWebhook(Hint("SUBS_" + subscriptionId), default));
            var calls = recurring.GetCalls;
            Assert.True(await service.SubscriptionWebhook(Hint("SUBS_" + subscriptionId), default));
            Assert.Equal(calls, recurring.GetCalls);
            Assert.Equal("Creating", subscription.State);
            Assert.Equal(0, (await service.Account(accountId, userId, default)).Paid);
        }
        // A fresh scope after a restart recovers the persisted binding without the webhook body.
        recurring.FailInvoices = false;
        recurring.Rows = [new("INVO_" + subscriptionId, 1, "PAID", 10000, "BRL", "PAYM_" + subscriptionId, "APPROVED")];
        await using var recovered = Database(); var worker = Service(recovered, gateway, recurring);
        await worker.Recover(default);
        Assert.Equal(100, (await worker.Account(accountId, userId, default)).Paid);
        Assert.Equal("ACTIVE", (await worker.Subscriptions(userId, default)).Single().State);
    }
    [PostgresFact]
    public async Task Subscription_cycles_are_unique_and_cancellation_requires_no_inflight_payment()
    {
        await using var db = Database(); var gateway = new Gateway(); var recurring = new Recurring(); var seed = await Seed(db, gateway, recurring); var service = Service(db, gateway, recurring); var a = await service.Account(seed.Account, seed.User, default);
        var input = new SubscribeInput(Guid.NewGuid(), "Aluno teste", "billing@example.invalid", "12345678909", "11999999999", "encrypted", true, a.Total, a.DueDate!.Value, "123");
        var subscription = await service.Subscribe(seed.Account, input, seed.User, default); Assert.Equal(subscription.Id, (await service.Subscribe(seed.Account, input, seed.User, default)).Id);
        await Assert.ThrowsAsync<BarRuleException>(() => service.Pay(seed.Account, Input(), seed.User, true, default));
        var suffix = Guid.NewGuid().ToString("N"); recurring.Rows = [new("INVO_1" + suffix, 1, "PAID", 10000, "BRL", "PAYM_1" + suffix, "APPROVED"), new("INVO_2" + suffix, 2, "UNPAID", 10000, "BRL", null, null)];
        await service.Subscribe(seed.Account, input, seed.User, default); await service.Recover(default);
        var accounts = await service.Accounts(seed.User, default); Assert.Equal(2, accounts.Count); Assert.Equal(100, accounts.Single(x => x.Id == seed.Account).Paid); var future = accounts.Single(x => x.Id != seed.Account); Assert.Equal(100, future.Pending); Assert.Equal(subscription.Id, future.SubscriptionId);
        Assert.Equal(2, await db.Set<BillingPayment>().CountAsync(x => x.AccountId == seed.Account || x.AccountId == future.Id));
        await service.Cancel(subscription.Id, new(Guid.NewGuid()), seed.User, default); Assert.Equal(100, (await service.Account(future.Id, seed.User, default)).Pending);
        recurring.Rows = [recurring.Rows[0], recurring.Rows[1] with { SafeToRelease = true }]; await service.Recover(default);
        Assert.Equal(100, (await service.Account(future.Id, seed.User, default)).Payable);
    }
    [PostgresFact]
    public async Task Declined_card_and_expired_pix_release_only_after_provider_confirmation()
    {
        await using var db = Database(); var gateway = new Gateway { State = "DECLINED" }; var seed = await Seed(db, gateway); var service = Service(db, gateway);
        var card = await service.Pay(seed.Account, Input("CreditCard"), seed.User, true, default); Assert.Equal(100, card.Payable); Assert.Equal("Canceled", Assert.Single(card.Payments).State);
        gateway.State = "WAITING"; var pix = await service.Pay(seed.Account, Input(), seed.User, true, default); Assert.Equal(100, pix.Pending);
        gateway.State = "CANCELED"; var p = pix.Payments.Single(x => x.State == "Pending"); await service.Refresh(seed.Account, p.Id, seed.User, true, default); Assert.Equal(100, (await service.Account(seed.Account, seed.User, default)).Payable);
        var entry = await db.OperationalRecords.SingleAsync(x => x.Id == seed.Entry); var canceled = JsonNode.Parse(entry.Payload)!.AsObject(); canceled["status"] = "Cancelado";
        await BillingWriteGuard.Check(db, seed.Entry, canceled, entry.Payload, default); entry.Update(entry.Name, canceled.ToJsonString()); await db.SaveChangesAsync();
        await service.Refresh(seed.Account, p.Id, seed.User, true, default); var after = await service.Account(seed.Account, seed.User, default); Assert.Equal("Cancelado", after.State); Assert.Equal(0, after.Payable);
    }
    [PostgresFact]
    public async Task Provider_confirmation_updates_receipts_without_matching_and_preserves_historical_settlements()
    {
        await using var db = Database(); var gateway = new Gateway { State = "PAID" }; var seed = await Seed(db, gateway); var service = Service(db, gateway);
        var account = await service.Pay(seed.Account, Input(), seed.User, true, default); var payment = Assert.Single(account.Payments); var document = Guid.NewGuid(); var external = Guid.NewGuid().ToString(); var day = DateOnly.FromDateTime(DateTime.UtcNow);
        Assert.Equal("Approved", payment.State); Assert.Equal(100, account.Paid);
        Assert.False(await db.Set<BillingSettlement>().AnyAsync(x => x.PaymentId == payment.Id));
        // Historical rows remain readable and immutable after the manual matching API is removed.
        var historical = new BillingSettlement(seed.Account, payment.Id, document, external, 100, 3, 97, day);
        db.Add(historical); await db.SaveChangesAsync();
        await service.Refresh(seed.Account, payment.Id, seed.User, true, default);
        var stored = await db.Set<BillingSettlement>().AsNoTracking().SingleAsync(x => x.Id == historical.Id);
        Assert.Equal(document, stored.DocumentId); Assert.Equal(external, stored.ExternalId);
        Assert.Equal(3, stored.Fee); Assert.Equal(97, stored.Net);
        Assert.Equal(1, await db.Set<BillingPayment>().CountAsync(x => x.AccountId == seed.Account));
        Assert.Equal(100, (await service.Account(seed.Account, seed.User, default)).Paid);
        db.Remove(historical); await Assert.ThrowsAsync<BarRuleException>(() => db.SaveChangesAsync());
    }
    [PostgresFact]
    public async Task Rental_subscription_follows_group_across_months_without_duplicate_meetings()
    {
        await using var db = Database(); await db.Database.MigrateAsync(); var gateway = new Gateway(); var recurring = new Recurring(); var service = Service(db, gateway, recurring); var rentals = new RentalGroupsService(db, TimeProvider.System);
        var user = User.Create("Responsável", Guid.NewGuid() + "@example.invalid", "test"); var court = Guid.NewGuid(); var group = Guid.NewGuid(); var member = Guid.NewGuid(); var due = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(1); due = new(due.Year, due.Month, 10); var month = due.ToString("yyyy-MM");
        db.Add(user); db.Add(new OperationalRecord(court, "courts", "Quadra teste", JsonSerializer.Serialize(new { id = court, name = "Quadra teste", status = "Disponível", openingTime = "06:00", closingTime = "24:00", operatingDays = new[] { 1, 2, 3, 4, 5, 6, 0 } })));
        db.Add(new OperationalRecord(group, "rentalGroups", "Grupo teste", JsonSerializer.Serialize(new { id = group, version = 1, name = "Grupo teste", courtId = court, weekDay = 5, startTime = "22:00", endTime = "24:00", startDate = due.ToString("yyyy-MM") + "-01", endDate = "", status = "Ativo", capacity = 12, organizerId = member, backupId = "", members = new[] { new { id = member, name = "Responsável", phone = "", status = "Ativo" } }, monthlyAmount = 100m, extraAmount = (decimal?)null, fifthPolicy = "Incluído", dueDay = 10, sport = "Futevôlei", notes = "" }))); await db.SaveChangesAsync();
        await rentals.Generate(group, new(month, 1, true), default); var entryId = LongBeach.Application.Operations.RentalGroupRules.StableId("charge", group, month); var a = await service.Assign(new("Quadra", entryId, user.Id), user.Id, default);
        var input = new SubscribeInput(Guid.NewGuid(), "Responsável", "group@example.invalid", "12345678909", "11999999999", "encrypted", true, 100, due, "123"); await service.Subscribe(a.Id, input, user.Id, default);
        var suffix = Guid.NewGuid().ToString("N"); recurring.Rows = [new("INVO_" + suffix, 1, "PAID", 10000, "BRL", "PAYM_" + suffix, "APPROVED"), new("INVO_future" + suffix, 2, "UNPAID", 10000, "BRL", null, null)]; await service.Subscribe(a.Id, input, user.Id, default); var meetings = await db.OperationalRecords.Where(x => x.Kind == "reservations").Select(x => x.Id).ToArrayAsync(); await service.Subscribe(a.Id, input, user.Id, default);
        Assert.Equal(meetings.Length, await db.OperationalRecords.CountAsync(x => x.Kind == "reservations")); var accounts = await service.Accounts(user.Id, default); Assert.Equal(2, accounts.Count); Assert.All(accounts, x => Assert.NotNull(x.SubscriptionId)); var future = accounts.Single(x => x.Id != a.Id); await Assert.ThrowsAsync<BarRuleException>(() => service.Pay(future.Id, Input(), user.Id, true, default));
    }
    [PostgresFact]
    public async Task Own_bar_account_exposes_consumption_without_staff_data_and_preserves_authoritative_totals()
    {
        await using var db = Database(); var gateway = new Gateway(); var seed = await Seed(db, gateway);
        var location = new LongBeach.Domain.Inventory.StockLocation("Bar teste");
        var tab = new BarTab(location.Id, seed.User, "Comanda teste", "Tab");
        var category = new BarProductCategory("Bebidas teste");
        var product = new BarProduct("BILL-" + Guid.NewGuid().ToString("N")[..10], "Água teste", "Água", category.Id, "un", "un", 1, 5, 2, 0, false, false, 0);
        var delivered = new BarTabItem(tab.Id, product, 2, seed.User, false); delivered.Accept(DateTimeOffset.UtcNow); delivered.Fulfill(DateTimeOffset.UtcNow);
        var requested = new BarTabItem(tab.Id, product, 1, null, true);
        var reversed = new BarTabItem(tab.Id, product, 3, seed.User, false); reversed.Accept(DateTimeOffset.UtcNow); reversed.Reverse("Anotação interna", false);
        tab.Adjust(2);
        var payment = new BarTabPayment(tab.Id, Guid.NewGuid(), "test", 3, "CardManual", seed.User, null, 3, "TEST"); payment.ConfirmManual(DateTimeOffset.UtcNow);
        db.AddRange(location, category, product, tab, delivered, requested, reversed, payment); await db.SaveChangesAsync();
        var service = Service(db, gateway); var account = await service.Assign(new("Bar", tab.Id, seed.User), seed.User, default);
        var mine = await service.Account(account.Id, seed.User, default);
        Assert.Equal(8, mine.Total); Assert.Equal(3, mine.Paid); Assert.Equal(5, mine.Payable); Assert.Equal(2, mine.Discount);
        Assert.Equal(3, mine.Items!.Count); Assert.Contains(mine.Items, i => i.State == "Requested"); Assert.Contains(mine.Items, i => i.State == "Reversed");
        var json = JsonSerializer.Serialize(mine.Items); Assert.DoesNotContain("UnitCost", json); Assert.DoesNotContain("ActorId", json); Assert.DoesNotContain("Anotação interna", json);
        await Assert.ThrowsAsync<BarTabAccessException>(() => service.Account(account.Id, Guid.NewGuid(), default));
        await Assert.ThrowsAsync<BarTabAccessException>(() => service.Pay(account.Id, Input(), Guid.NewGuid(), true, default));
        Assert.Empty(await service.Accounts(Guid.NewGuid(), default));
    }
    private sealed class Gateway : IPaymentGateway
    {
        private readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, GatewayPayment> orders = new();
        public bool Enabled => true; public bool CardEnabled => true; public bool Timeout; public bool WrongAmount; public string State = "WAITING"; public int Created; public int RefundedCalls; private long refunded;
        public Task<GatewayPayment> CreatePix(Guid id, Guid operation, decimal amount, DateTimeOffset expires, PixCustomer customer, CancellationToken ct) { var r = orders.GetOrAdd(operation, _ => { Interlocked.Increment(ref Created); return new("ORDE_" + id, "CHAR_" + id, id.ToString(), "WAITING", (long)(amount * 100), "BRL", "copy", null); }); if (Timeout) throw new HttpRequestException("test timeout"); return Task.FromResult(r); }
        public Task<GatewayPayment> CreateCard(Guid id, Guid op, decimal amount, PixCustomer customer, string encrypted, CancellationToken ct) => CreatePix(id, op, amount, DateTimeOffset.UtcNow, customer, ct);
        public Task<GatewayPayment> Get(string id, CancellationToken ct) { var p = orders.Values.Single(x => x.OrderId == id); return Task.FromResult(p with { State = State, Amount = WrongAmount ? p.Amount + 1 : p.Amount, Refunded = refunded }); }
        public Task<GatewayPayment> Refund(string id, Guid op, decimal amount, CancellationToken ct) => RefundPartial(id, op, amount, 0, ct);
        public Task<GatewayPayment> RefundPartial(string id, Guid op, decimal amount, decimal previous, CancellationToken ct) { RefundedCalls++; refunded = (long)((previous + amount) * 100); return Get(id, ct); }
        public bool VerifyWebhook(byte[] body, IEnumerable<string> signatures) => false;
    }
    private sealed class Recurring : IRecurringGateway
    {
        public bool Enabled => true; private RecurringState state = new("SUBS_test", "", "ACTIVE", 10000, "BRL"); public RecurringInvoice[] Rows = [];
        public bool WrongAmount, FailInvoices; public int GetCalls;
        public Task<string?> PublicKey(CancellationToken ct) => Task.FromResult<string?>("test");
        public Task<string> CreatePlan(Guid reference, decimal amount, int trial, CancellationToken ct) => Task.FromResult("PLAN_test");
        public Task<RecurringState> Create(Guid reference, Guid op, string plan, SubscribeInput input, CancellationToken ct) { state = state with { Id = "SUBS_" + reference, Reference = reference.ToString() }; return Task.FromResult(state); }
        public Task<RecurringState> Get(string id, CancellationToken ct) { GetCalls++; return Task.FromResult(WrongAmount ? state with { Amount = state.Amount + 1 } : state); }
        public Task<RecurringState> Cancel(string id, Guid operation, CancellationToken ct) { state = state with { State = "CANCELED" }; return Task.FromResult(state); }
        public Task<IReadOnlyList<RecurringInvoice>> Invoices(string id, CancellationToken ct) => FailInvoices ? throw new HttpRequestException("Callback must not fetch invoices") : Task.FromResult<IReadOnlyList<RecurringInvoice>>(Rows);
        public Task Refund(string id, Guid op, decimal amount, decimal previous, CancellationToken ct) => Task.CompletedTask;
    }
}
