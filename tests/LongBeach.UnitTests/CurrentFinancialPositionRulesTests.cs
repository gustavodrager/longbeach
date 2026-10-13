using LongBeach.Application.Finance;

namespace LongBeach.UnitTests;

public sealed class CurrentFinancialPositionRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 13);

    [Fact]
    public void Confirmed_net_payments_reduce_the_same_receivable_without_counting_income_again()
    {
        FinancialPositionEntry[] entries = [
            new("Receber", "Pendente", 10000, Today.AddDays(-1), 6000), // 100 paid, 40 refunded: only 40 remains due.
            new("Receber", "Pendente", 2500, Today),
            new("Receber", "Pago", 7000, Today.AddDays(-2), 7000),
            new("Receber", "Cancelado", 8000, Today.AddDays(-2)),
            new("Pagar", "Pendente", 9000, Today.AddDays(-1))
        ];
        var actual = CurrentFinancialPositionRules.Outstanding(entries, "Receber", Today);
        Assert.Equal(6500, actual.AmountCents); Assert.Equal(2, actual.Records);
        Assert.Equal(4000, actual.OverdueCents); Assert.Equal(1, actual.OverdueRecords);
        Assert.Equal(6000, actual.ConfirmedPaymentsCents);
    }

    [Fact]
    public void Zero_means_no_registered_debt_and_never_a_bank_balance()
    {
        var empty = CurrentFinancialPositionRules.Outstanding([], "Receber", Today);
        Assert.Equal(0, empty.AmountCents); Assert.Equal(0, empty.Records);
        var covered = CurrentFinancialPositionRules.Outstanding([new("Receber", "Pendente", 10000, Today.AddDays(-1), 11000)], "Receber", Today);
        Assert.Equal(0, covered.AmountCents); Assert.Equal(0, covered.OverdueRecords);
        Assert.Equal(0, covered.ConfirmedPaymentsCents);
    }

    [Fact]
    public void Payables_include_future_and_overdue_dates_but_ignore_receivable_payments()
    {
        FinancialPositionEntry[] entries = [new("Pagar", "Pendente", 1234, Today.AddDays(1), 1234), new("Pagar", "Pendente", 500, Today.AddDays(-1)), new("Pagar", "Pago", 900, Today)];
        var actual = CurrentFinancialPositionRules.Outstanding(entries, "Pagar", Today);
        Assert.Equal(1734, actual.AmountCents); Assert.Equal(500, actual.OverdueCents);
        Assert.Equal(2, actual.Records); Assert.Equal(0, actual.ConfirmedPaymentsCents);
    }
}
