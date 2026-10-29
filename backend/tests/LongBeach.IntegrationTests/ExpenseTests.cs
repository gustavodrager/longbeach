using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Operations;
using LongBeach.Domain.Purchases;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using static LongBeach.IntegrationTests.OperationalPostgresTests;

namespace LongBeach.IntegrationTests;

public sealed class ExpenseTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);
    private static readonly TestAudit Audit = new();
    private static readonly TimeProvider Clock = new FixedClock();
    private static ExpenseInput Input() => new("Compra fictícia", 500m, Today.AddDays(-1));
    private static ExpensesService Service(LongBeachDbContext db) => new(db, Audit, Clock);
    [Fact]
    public async Task Finance_read_and_write_are_required_and_first_access_cannot_access_expenses()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/expenses")).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Operations", "employees:read", "employees:write");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/expenses/options")).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Operations", "finance:read");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/v1/expenses/{Guid.NewGuid()}", Input())).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Operations", "finance:write");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/v1/expenses/{Guid.NewGuid()}", Input())).StatusCode);
    }
    [PostgresFact]
    public async Task Partner_purchase_partial_reimbursement_is_idempotent_audited_and_counted_once_everywhere()
    {
        await using var fixture = await IsolatedBarDatabase.Create(new AuditSaveChangesInterceptor(Audit, Clock)); var db = fixture.Context; var service = Service(db);
        var partner = await service.CreatePartner(new(Guid.NewGuid(), "Sócio fictício"), default);
        var sameName = await service.CreatePartner(new(Guid.NewGuid(), " SÓCIO FICTÍCIO "), default); Assert.Equal(partner.Id, sameName.Id);
        var id = Guid.NewGuid(); var input = Input() with { PaidBy = "Partner", PartnerId = partner.Id };
        var created = await service.Create(id, input, default);
        Assert.Equal("Pending", created.Expense.Status); Assert.Equal(500m, created.Expense.RemainingAmount); Assert.Empty(created.Payments);
        var payment = new ExpensePaymentInput(Guid.NewGuid(), 200m, Today, created.Expense.Version);
        var paid = await service.Pay(id, payment, default);
        Assert.Equal("Partial", paid.Expense.Status); Assert.Equal(300m, paid.Expense.RemainingAmount); Assert.Single(paid.Payments);
        var replay = await service.Pay(id, payment, default); Assert.Equal(paid.Expense.Version, replay.Expense.Version); Assert.Single(replay.Payments);
        Assert.Equal(paid.Expense.Version, (await service.Create(id, input, default)).Expense.Version);
        Assert.True((await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Create(id, input with { Amount = 501m }, default))).Conflict);
        Assert.True((await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Pay(id, payment with { Amount = 201m }, default))).Conflict);
        Assert.True((await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Pay(id, payment with { OperationId = Guid.NewGuid(), Amount = 301m, Version = paid.Expense.Version }, default))).Conflict);
        var page = await service.List("Partners", "Open", null, 1, 20, default);
        Assert.Single(page.Items); Assert.Equal(300m, page.Summary.OutstandingAmount); Assert.Equal(300m, page.Summary.PartnerAmount); Assert.Equal(0m, page.Summary.OverdueAmount);
        Assert.Equal(page.Summary, (await service.List("Expenses", "Completed", "missing", 1, 20, default)).Summary);
        Assert.Single(await db.OperationalRecords.Where(x => x.Kind == "financeEntries").ToListAsync());
        var current = await new FinancialHistoryService(db, Audit, Clock, new ConfigurationBuilder().Build()).CurrentPosition(default);
        Assert.Equal(30000, current.Payable.AmountCents); Assert.Equal(20000, current.Payable.ConfirmedPaymentsCents); Assert.Equal(0, current.Payable.OverdueCents);
        var detail = Assert.Single(current.Entries); Assert.True(detail.ManagedExpense); Assert.False(detail.HasDueDate);
        var explicitAudit = await db.AuditLogs.SingleAsync(x => x.Action == "ExpensePaymentRecorded"); Assert.Equal(Audit.UserId, explicitAudit.ActorUserId); Assert.Contains("remainingAmount", explicitAudit.MetadataJson); Assert.DoesNotContain(partner.Name, explicitAudit.MetadataJson);
        var complete = await service.Pay(id, new(Guid.NewGuid(), 300m, Today, paid.Expense.Version), default);
        Assert.Equal("Paid", complete.Expense.Status); Assert.Equal(0m, complete.Expense.RemainingAmount); Assert.Equal(2, complete.Payments.Length);
        Assert.Empty((await service.List(null, null, null, 1, 20, default)).Items);
        Assert.Single((await service.List(null, "Completed", null, 1, 20, default)).Items);
        var journal = await db.OperationalRecords.FirstAsync(x => x.Kind == ExpenseRules.PaymentKind); journal.Update(journal.Name, "{}");
        await Assert.ThrowsAsync<BarRuleException>(() => db.SaveChangesAsync());
    }
    [PostgresFact]
    public async Task Company_paid_expense_has_one_confirmed_payment_and_legacy_payable_is_adopted_without_new_expense()
    {
        await using var fixture = await IsolatedBarDatabase.Create(); var db = fixture.Context; var service = Service(db);
        var company = await service.Create(Guid.NewGuid(), Input() with { PaidBy = "Company", PaidDate = Today }, default);
        Assert.Equal(500m, company.Expense.PaidAmount); Assert.Equal("Paid", company.Expense.Status); Assert.Single(company.Payments);
        var legacy = Legacy("Pagar", 100m); var receivable = Legacy("Receber", 200m); db.AddRange(legacy, receivable); await db.SaveChangesAsync();
        var old = await service.Detail(legacy.Id, default); Assert.False(old.Expense.Managed);
        var partial = await service.Pay(legacy.Id, new(Guid.NewGuid(), 40m, Today, old.Expense.Version), default);
        Assert.True(partial.Expense.Managed); Assert.Equal(60m, partial.Expense.RemainingAmount);
        Assert.Equal(3, await db.OperationalRecords.CountAsync(x => x.Kind == "financeEntries"));
        await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Pay(receivable.Id, new(Guid.NewGuid(), 1m, Today, 0), default));
        Assert.Equal(60m, (await service.List(null, null, null, 1, 20, default)).Summary.OutstandingAmount);
        Assert.Equal(new ExpensePaidSummary(540m, 2), await service.PaidSummary(Today, Today, default));
    }
    [PostgresFact]
    public async Task Team_uses_registered_person_and_rejects_duplicate_month_but_allows_distinct_daily_shifts()
    {
        await using var fixture = await IsolatedBarDatabase.Create(); var db = fixture.Context; var service = Service(db);
        var employee = new OperationalRecord(Guid.NewGuid(), "team", "Pessoa fictícia", JsonSerializer.Serialize(new { payAmount = 100m, payBasis = "Diária", paymentFrequency = "Semanal", paymentDay = "Sexta" }));
        db.Add(employee); await db.SaveChangesAsync();
        var options = await service.Options(default); Assert.Equal(100m, Assert.Single(options.Team).PayAmount);
        var input = Input() with { Kind = "Team", TeamMemberId = employee.Id, TeamBasis = "Monthly", ReferenceMonth = "2026-10", Beneficiary = "ignored" };
        var created = await service.Create(Guid.NewGuid(), input, default); Assert.Equal(employee.Name, created.Expense.Beneficiary); Assert.Equal(500m, created.Expense.Amount);
        Assert.True((await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Create(Guid.NewGuid(), input, default))).Conflict);
        var daily = input with { TeamBasis = "Daily", ReferenceMonth = null, WorkDate = Today, Shift = "Manhã" };
        await service.Create(Guid.NewGuid(), daily, default); await service.Create(Guid.NewGuid(), daily with { Shift = "Noite" }, default);
        Assert.True((await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Create(Guid.NewGuid(), daily with { Shift = " MANHÃ " }, default))).Conflict);
        Assert.Equal(3, (await service.List("Team", null, null, 1, 20, default)).Total);
    }
    [PostgresFact]
    public async Task Purchase_link_uses_frozen_real_amount_and_prevents_duplicate_finance_or_canceled_purchase()
    {
        await using var fixture = await IsolatedBarDatabase.Create(); var db = fixture.Context; var service = Service(db);
        var supplier = new Supplier("Fornecedor fictício"); var category = new BarProductCategory("Insumos");
        var product = new BarProduct("FX", "Item fictício", "Item", category.Id, "UN", "UN", 1, 10, 5, 0, true, false, 0);
        var purchase = new Purchase(supplier.Id, "Fictício-001", Audit.UserId!.Value); purchase.Items.Add(new PurchaseItem(purchase.Id, product, 2, 50m)); purchase.Terms(0, 0, "Pending", null, Clock.GetUtcNow().AddDays(-1));
        db.AddRange(supplier, category, product, purchase); await db.SaveChangesAsync();
        var option = await service.PurchaseOption(purchase.Id, default); Assert.Equal(100m, option.Amount);
        var created = await service.Create(Guid.NewGuid(), Input() with { PurchaseId = purchase.Id, Amount = 1m, Description = "Forged", Origin = "Arena" }, default);
        Assert.Equal(100m, created.Expense.Amount); Assert.Equal(option.Description, created.Expense.Description); Assert.Equal("Bar", created.Expense.Origin);
        Assert.Equal(created.Expense.Id, (await service.PurchaseOption(purchase.Id, default)).ExpenseId);
        Assert.True((await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Create(Guid.NewGuid(), Input() with { PurchaseId = purchase.Id }, default))).Conflict);
        purchase.Cancel("Cancelamento após resposta perdida", Audit.UserId.Value); await db.SaveChangesAsync();
        Assert.Equal(created.Expense.Id, (await service.Create(created.Expense.Id, Input() with { PurchaseId = purchase.Id, Amount = 1m, Description = "Forged", Origin = "Arena" }, default)).Expense.Id);
        var canceled = new Purchase(supplier.Id, "Fictício-002", Audit.UserId.Value); canceled.Cancel("Teste", Audit.UserId.Value); db.Add(canceled); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Create(Guid.NewGuid(), Input() with { PurchaseId = canceled.Id }, default));
    }
    [PostgresFact]
    public async Task Concurrent_payments_cannot_spend_the_same_balance_or_ignore_stale_versions()
    {
        await using var fixture = await IsolatedBarDatabase.Create(); var db = fixture.Context; var service = Service(db); var id = Guid.NewGuid();
        var created = await service.Create(id, Input(), default);
        async Task<bool> Pay()
        {
            await using var connection = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(db.Database.GetConnectionString()).Options, Clock);
            try { await Service(connection).Pay(id, new(Guid.NewGuid(), 400m, Today, created.Expense.Version), default); return true; }
            catch (ExpenseRuleException error) when (error.Conflict) { return false; }
        }
        var results = await Task.WhenAll(Pay(), Pay()); Assert.Single(results, success => success);
        db.ChangeTracker.Clear(); var result = await service.Detail(id, default); Assert.Equal(100m, result.Expense.RemainingAmount); Assert.Single(result.Payments);
    }
    [PostgresFact]
    public async Task Generic_endpoint_cannot_create_managed_metadata_overwrite_expense_or_detach_adopted_legacy()
    {
        await using var factory = Factory(); using var client = factory.CreateClient(); await Migrate(factory); client.DefaultRequestHeaders.Authorization = Header("Manager");
        var id = Guid.NewGuid(); var created = await client.PutAsJsonAsync($"/api/v1/expenses/{id}", Input()); Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var generic = new { id, name = "Forjado", direction = "Receber", amount = 1, dueDate = "2026-10-20", status = "Pendente", origin = "Arena", version = 1 };
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/v1/operations/financeEntries/{id}", generic)).StatusCode);
        var forged = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/v1/operations/financeEntries/{forged}", new { id = forged, name = "Forjado", expense = new { paidAmount = 1 } })).StatusCode);
    }
    [PostgresFact]
    public async Task Cancellation_preserves_history_replays_once_and_rejects_paid_or_partner_obligations()
    {
        await using var fixture = await IsolatedBarDatabase.Create(); var db = fixture.Context; var service = Service(db);
        var pending = await service.Create(Guid.NewGuid(), Input(), default);
        var cancel = new ExpenseCancelInput(Guid.NewGuid(), pending.Expense.Version, "Lançado por engano");
        var canceled = await service.Cancel(pending.Expense.Id, cancel, default);
        Assert.Equal("Canceled", canceled.Expense.Status); Assert.Equal(0m, canceled.Expense.RemainingAmount); Assert.Equal(cancel.Reason, canceled.CancellationReason);
        Assert.Equal(canceled.Expense.Version, (await service.Cancel(pending.Expense.Id, cancel, default)).Expense.Version);
        Assert.Single(await db.OperationalRecords.Where(x => x.Kind == "expenseOperations").ToListAsync());
        Assert.Equal("ExpenseCanceled", (await db.AuditLogs.SingleAsync(x => x.Action == "ExpenseCanceled")).Action);
        Assert.True((await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Cancel(pending.Expense.Id, cancel with { Reason = "Outro" }, default))).Conflict);
        var paid = await service.Create(Guid.NewGuid(), Input() with { PaidBy = "Company", PaidDate = Today }, default);
        await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Cancel(paid.Expense.Id, new(Guid.NewGuid(), paid.Expense.Version, "Erro"), default));
        var partner = await service.CreatePartner(new(Guid.NewGuid(), "Pessoa sócia fictícia"), default);
        var advanced = await service.Create(Guid.NewGuid(), Input() with { PaidBy = "Partner", PartnerId = partner.Id }, default);
        await Assert.ThrowsAsync<ExpenseRuleException>(() => service.Cancel(advanced.Expense.Id, new(Guid.NewGuid(), advanced.Expense.Version, "Erro"), default));
    }
    [PostgresFact]
    public async Task Paid_summary_counts_each_actual_payment_on_its_date_and_legacy_paid_entries_once()
    {
        await using var fixture = await IsolatedBarDatabase.Create(); var db = fixture.Context; var service = Service(db);
        var expense = await service.Create(Guid.NewGuid(), Input(), default);
        var partial = await service.Pay(expense.Expense.Id, new(Guid.NewGuid(), 200m, Today.AddDays(-1), expense.Expense.Version), default);
        await service.Pay(expense.Expense.Id, new(Guid.NewGuid(), 300m, Today, partial.Expense.Version), default);
        var legacy = new OperationalRecord(Guid.NewGuid(), "financeEntries", "Quitado histórico", JsonSerializer.Serialize(new { direction = "Pagar", amount = 70m, status = "Pago", dueDate = "2026-10-19", paidDate = Today.ToString("yyyy-MM-dd") }));
        var revenue = new OperationalRecord(Guid.NewGuid(), "financeEntries", "Receita histórica", JsonSerializer.Serialize(new { direction = "Receber", amount = 900m, status = "Pago", paidDate = Today.ToString("yyyy-MM-dd") }));
        db.AddRange(legacy, revenue); await db.SaveChangesAsync();
        Assert.Equal(new ExpensePaidSummary(200m, 1), await service.PaidSummary(Today.AddDays(-1), Today.AddDays(-1), default));
        Assert.Equal(new ExpensePaidSummary(370m, 2), await service.PaidSummary(Today, Today, default));
        Assert.Equal(new ExpensePaidSummary(570m, 3), await service.PaidSummary(Today.AddDays(-1), Today, default));
    }
    private static OperationalRecord Legacy(string direction, decimal amount) => new(Guid.NewGuid(), "financeEntries", "Lançamento fictício", JsonSerializer.Serialize(new { id = Guid.NewGuid(), name = "Lançamento fictício", direction, amount, status = "Pendente", dueDate = "2026-10-19", origin = "Arena", version = 1 }));
    private sealed class FixedClock : TimeProvider { public override DateTimeOffset GetUtcNow() => new(2026, 10, 21, 2, 30, 0, TimeSpan.Zero); }
    private sealed class TestAudit : IAuditContext
    {
        public Guid? UserId { get; } = Guid.NewGuid(); public string? IpAddress => null; public string? UserAgent => "Fictional-tests"; public string CorrelationId => "expense-tests";
    }
}
