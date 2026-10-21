using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;

namespace LongBeach.UnitTests;

public sealed class ExpenseRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);
    private static ExpenseInput Expense() => new("Material fictício", 500m, Today);
    [Fact]
    public void Partner_advance_keeps_a_single_unpaid_reimbursement_and_requires_an_independent_partner()
    {
        var partner = ExpenseRules.Normalize(Expense() with { PaidBy = "Partner", PartnerId = Guid.NewGuid() }, Today);
        Assert.Null(partner.PaidDate);
        Assert.Equal(300m, ExpenseRules.Remaining(500m, 200m, "Pendente"));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(Expense() with { PaidBy = "Partner" }, Today));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(Expense() with { PartnerId = Guid.NewGuid() }, Today));
    }
    [Fact]
    public void Company_payment_requires_confirmation_and_future_dates_or_fractional_cents_are_rejected()
    {
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(Expense() with { PaidBy = "Company" }, Today));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(Expense() with { PaidBy = "Company", PaidDate = Today.AddDays(1) }, Today));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(Expense() with { ExpenseDate = Today.AddDays(1) }, Today));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(Expense() with { Amount = 1.001m }, Today));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(Expense() with { Amount = 0m }, Today));
        Assert.Null(ExpenseRules.Normalize(Expense(), Today).DueDate);
    }
    [Fact]
    public void Team_requires_month_or_work_date_and_does_not_infer_the_agreed_rate_as_a_payment()
    {
        var team = Expense() with { Kind = "Team", TeamMemberId = Guid.NewGuid(), TeamBasis = "Monthly", ReferenceMonth = "2026-10" };
        Assert.Equal(500m, ExpenseRules.Normalize(team, Today).Amount);
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(team with { ReferenceMonth = "2026-11" }, Today));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(team with { ReferenceMonth = "2026-13" }, Today));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(team with { WorkDate = Today }, Today));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(team with { TeamMemberId = null }, Today));
        Assert.Equal("Noite", ExpenseRules.Normalize(team with { TeamBasis = "Daily", ReferenceMonth = null, WorkDate = Today, Shift = " Noite " }, Today).Shift);
    }
    [Fact]
    public void Payment_cannot_exceed_remaining_or_reopen_completed_expenses()
    {
        ExpenseRules.PaymentAllowed(500m, 200m, 300m, "Pendente");
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.PaymentAllowed(500m, 200m, 300.01m, "Pendente"));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.PaymentAllowed(500m, 0m, 1m, "Cancelado"));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.PaymentAllowed(500m, 500m, 1m, "Pago"));
        Assert.Throws<ExpenseRuleException>(() => ExpenseRules.Normalize(new ExpensePaymentInput(Guid.NewGuid(), 1m, Today.AddDays(1), 1), Today));
    }
    [Fact]
    public void Old_generic_route_rejects_forged_managed_metadata_even_on_creation()
    {
        Assert.True(ExpenseRules.Reserved(JsonSerializer.SerializeToElement(new { expense = new { paidAmount = 500 } })));
        Assert.True(ExpenseRules.Reserved(JsonSerializer.SerializeToElement(new { ExpensePaidAmount = 500 })));
        Assert.True(ExpenseRules.Reserved(JsonSerializer.SerializeToElement(new { sourceKind = "barPurchases" })));
        Assert.False(ExpenseRules.Reserved(JsonSerializer.SerializeToElement(new { direction = "Receber", amount = 500 })));
    }
    [Fact]
    public void Current_position_deducts_managed_payables_once_and_does_not_mark_no_deadline_overdue()
    {
        FinancialPositionEntry[] entries = [
            new("Pagar", "Pendente", 50000, Today.AddDays(-3), 0, 20000, false, true),
            new("Pagar", "Pendente", 10000, Today.AddDays(-1)),
            new("Receber", "Pendente", 8000, Today.AddDays(-1), 3000),
            new("Pagar", "Pago", 99900, Today, 0, 99900, true, true)
        ];
        var payable = CurrentFinancialPositionRules.Outstanding(entries, "Pagar", Today);
        Assert.Equal(40000, payable.AmountCents); Assert.Equal(10000, payable.OverdueCents);
        Assert.Equal(20000, payable.ConfirmedPaymentsCents); Assert.Equal(2, payable.Records);
        Assert.Equal(5000, CurrentFinancialPositionRules.Outstanding(entries, "Receber", Today).AmountCents);
    }
    [Fact]
    public void Today_uses_sao_paulo_even_before_midnight_utc()
    {
        Assert.Equal(Today, ExpenseRules.Today(new FixedClock()));
    }
    private sealed class FixedClock : TimeProvider { public override DateTimeOffset GetUtcNow() => new(2026, 10, 21, 2, 30, 0, TimeSpan.Zero); }
}
