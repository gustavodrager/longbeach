using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Bar;
namespace LongBeach.UnitTests;
public sealed class BarMenuRulesTests
{
    [Theory]
    [InlineData(4)]
    [InlineData(121)]
    public void Rejects_invalid_duration(int seconds) => Assert.Throws<MenuValidationException>(() =>
        BarMenuService.Validate(new("Cardápio", [new("p", "Bebidas", seconds, true, [])])));
    [Fact]
    public void Rejects_duplicate_pages() => Assert.Throws<MenuValidationException>(() =>
        BarMenuService.Validate(new("Cardápio", [new("p", "Bebidas", 10, true, []), new("p", "Doces", 10, true, [])])));
    [Fact]
    public void Draft_changes_preserve_the_published_snapshot()
    {
        var menu = new BarMenu("draft1");
        menu.Publish("published");
        menu.SaveDraft("draft2");
        Assert.Equal("published", menu.PublishedJson);
        Assert.Equal(3, menu.Version);
    }
}
