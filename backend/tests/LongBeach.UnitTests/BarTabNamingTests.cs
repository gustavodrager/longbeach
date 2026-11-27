using LongBeach.Domain.Bar;

namespace LongBeach.UnitTests;

public sealed class BarTabNamingTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Visitante")]
    public void Naming_a_tab_trims_the_name_and_versions_only_real_changes(string? initialName)
    {
        var tab = new BarTab(Guid.NewGuid(), Guid.NewGuid(), initialName, "Tab");
        tab.Rename("  Mesa de teste  ");
        Assert.Equal("Mesa de teste", tab.Name);
        Assert.Equal(1, tab.Version);
        tab.Rename(" Mesa de teste ");
        Assert.Equal(1, tab.Version);
        tab.Rename("   ");
        Assert.Equal("", tab.Name);
        Assert.Equal(2, tab.Version);
    }

    [Fact]
    public void Naming_requires_an_explicit_value_and_respects_the_existing_limit()
    {
        var tab = new BarTab(Guid.NewGuid(), Guid.NewGuid(), "Original", "Tab");
        Assert.Throws<BarRuleException>(() => tab.Rename(null!));
        Assert.Throws<BarRuleException>(() => tab.Rename(new string('a', 81)));
        Assert.Equal("Original", tab.Name);
        Assert.Equal(0, tab.Version);
        tab.Rename(" " + new string('a', 80) + " ");
        Assert.Equal(80, tab.Name.Length);
        Assert.Equal(1, tab.Version);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Naming_cannot_change_closed_or_cancelled_tabs(bool cancelled)
    {
        var tab = new BarTab(Guid.NewGuid(), Guid.NewGuid(), "Original", "Tab");
        if (cancelled) tab.Cancel("Cancelamento de teste", DateTimeOffset.UtcNow);
        else tab.Close(0, 0, false, DateTimeOffset.UtcNow);
        Assert.Throws<BarRuleException>(() => tab.Rename("Novo nome"));
        Assert.Equal("Original", tab.Name);
        Assert.Equal(1, tab.Version);
    }
}
