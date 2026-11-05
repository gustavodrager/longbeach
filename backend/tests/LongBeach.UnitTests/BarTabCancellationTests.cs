using LongBeach.Domain.Bar;

namespace LongBeach.UnitTests;

public sealed class BarTabCancellationTests
{
    [Fact]
    public void Cancel_is_terminal_clears_current_concession_and_preserves_identity()
    {
        var tab = new BarTab(Guid.NewGuid(), Guid.NewGuid(), "Mesa", "Tab"); tab.Adjust(5);
        var id = tab.Id; var version = tab.Version; var now = DateTimeOffset.UtcNow;
        tab.Cancel("Cliente desistiu", now);
        Assert.Equal(id, tab.Id); Assert.Equal("Cancelled", tab.State); Assert.Equal(now, tab.ClosedAtUtc);
        Assert.Equal(0, tab.Discount); Assert.Equal(version + 1, tab.Version);
        Assert.Throws<BarRuleException>(() => tab.EnsureOpen());
        Assert.Throws<BarRuleException>(() => tab.Cancel("Outro motivo", now));
        Assert.Throws<BarRuleException>(() => tab.ReopenAfterRefund());
        Assert.Equal("Cancelled", tab.State);
    }

    [Theory]
    [InlineData("")] [InlineData("   ")] [InlineData("ab")]
    public void Invalid_reason_does_not_change_state_or_concession(string reason)
    {
        var tab = new BarTab(Guid.NewGuid(), Guid.NewGuid(), "Mesa", "Tab"); tab.Adjust(5); var version = tab.Version;
        Assert.Throws<BarRuleException>(() => tab.Cancel(reason, DateTimeOffset.UtcNow));
        Assert.Equal("Open", tab.State); Assert.Equal(5, tab.Discount); Assert.Equal(version, tab.Version); Assert.Null(tab.ClosedAtUtc);
    }

    [Fact]
    public void Concession_is_only_reduced_to_remaining_gross_and_does_not_become_negative()
    {
        var tab = new BarTab(Guid.NewGuid(), Guid.NewGuid(), "Mesa", "Tab"); tab.Adjust(8);
        Assert.Equal(3, tab.LimitConcession(5)); Assert.Equal(5, tab.Discount);
        Assert.Equal(0, tab.LimitConcession(10)); Assert.Equal(5, tab.Discount);
        Assert.Equal(0, tab.LimitConcession(100_000_000)); Assert.Equal(5, tab.Discount);
        Assert.Equal(5, tab.LimitConcession(0)); Assert.Equal(0, tab.Discount);
        Assert.Throws<BarRuleException>(() => tab.LimitConcession(-1));
    }
}
