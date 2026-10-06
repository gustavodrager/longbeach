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
    }
    [PostgresFact]
    public async Task Edi_links_one_validated_event_without_creating_another_receipt()
    {
        await using var db = Database(); var gateway = new Gateway { State = "PAID" }; var seed = await Seed(db, gateway); var service = Service(db, gateway);
        var account = await service.Pay(seed.Account, Input(), seed.User, true, default); var payment = Assert.Single(account.Payments); var document = Guid.NewGuid(); var external = Guid.NewGuid().ToString(); var day = DateOnly.FromDateTime(DateTime.UtcNow);
        var payload = JsonSerializer.Serialize(new { detalhes = new[] { new { movimento_api_codigo = external, codigo_transacao = "EDI_TEST", tipo_evento = "1", status_pagamento = "3", quantidade_parcelas = "1", taxa_antecipacao = 0m, valor_original_transacao = 100m, valor_liquido_transacao = 97m, taxa_intermediacao = 2m, tarifa_intermediacao = 1m, data_movimentacao = day.ToString("yyyy-MM-dd") } } });
        var hash = new string('a', 32) + document.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO provider_documents(id,provider,movement,movement_date,page_number,source_sha256,payload,validated,fetched_at_utc) VALUES({document},'pagbank-edi','financial',{day},1,{hash},{payload}::jsonb,true,{DateTimeOffset.UtcNow})");
        var candidates = JsonSerializer.SerializeToElement(await service.SettlementCandidates(default)); Assert.Contains(candidates.GetProperty("records").EnumerateArray(), x => x.GetProperty("externalId").GetString() == external);
        var input = new SettlementInput(payment.Id, document, external, "Conferido por transação no extrato"); await service.Settle(seed.Account, input, seed.User, default); await service.Settle(seed.Account, input, seed.User, default);
        Assert.Equal(1, await db.Set<BillingSettlement>().CountAsync(x => x.PaymentId == payment.Id)); Assert.Equal(1, await db.Set<BillingPayment>().CountAsync(x => x.AccountId == seed.Account)); Assert.Equal(100, (await service.Account(seed.Account, seed.User, default)).Paid);
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
        public Task<string?> PublicKey(CancellationToken ct) => Task.FromResult<string?>("test");
        public Task<string> CreatePlan(Guid reference, decimal amount, int trial, CancellationToken ct) => Task.FromResult("PLAN_test");
        public Task<RecurringState> Create(Guid reference, Guid op, string plan, SubscribeInput input, CancellationToken ct) { state = state with { Id = "SUBS_" + reference, Reference = reference.ToString() }; return Task.FromResult(state); }
        public Task<RecurringState> Get(string id, CancellationToken ct) => Task.FromResult(state);
        public Task<RecurringState> Cancel(string id, Guid operation, CancellationToken ct) { state = state with { State = "CANCELED" }; return Task.FromResult(state); }
        public Task<IReadOnlyList<RecurringInvoice>> Invoices(string id, CancellationToken ct) => Task.FromResult<IReadOnlyList<RecurringInvoice>>(Rows);
        public Task Refund(string id, Guid op, decimal amount, decimal previous, CancellationToken ct) => Task.CompletedTask;
    }
}
