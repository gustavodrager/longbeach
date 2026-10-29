using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.IntegrationTests;
public sealed class BarMenuPostgresTests
{
    [PostgresFact]
    public async Task Publication_resolves_catalog_prices_and_stays_stable_after_draft_edit()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var db = isolated.Context;
        var product = await new BarCatalogService(db).SaveProduct(null, new("", "Água", "Água", null, "un", "un", 1, 5, 0, 0, false, false, 0), default);
        var menu = new BarMenuService(db, TimeProvider.System);
        MenuDocument draft = new("Cardápio", [new("p", "Bebidas", 10, true, [new("i", "Água", "", true, [product.Product.Id])])]);
        var saved = await menu.Save(new(0, draft), default);
        var published = await menu.Publish(new(saved.Version), default);
        Assert.Equal(5, published.Published!.Pages[0].Items[0].Price);
        var edited = await menu.Save(new(published.Version, draft with { Title = "Rascunho" }), default);
        Assert.Equal("Cardápio", edited.Published!.Title);
        Assert.Equal("Rascunho", edited.Draft.Title);
        await Assert.ThrowsAsync<MenuConcurrencyException>(() => menu.Save(new(saved.Version, draft), default));
        await using var fresh = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(db.Database.GetConnectionString()).Options, TimeProvider.System);
        var reloaded = await new BarMenuService(fresh, TimeProvider.System).Get(default);
        Assert.Equal(edited.Version, reloaded.Version);
        Assert.Equal("Cardápio", reloaded.Published!.Title);
    }
    [PostgresFact]
    public async Task Missing_product_cannot_publish()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var menu = new BarMenuService(isolated.Context, TimeProvider.System);
        var saved = await menu.Save(new(0, new("Cardápio", [new("p", "Bebidas", 10, true, [new("i", "Água", "", true, [Guid.NewGuid()])])])), default);
        await Assert.ThrowsAsync<MenuValidationException>(() => menu.Publish(new(saved.Version), default));
        Assert.Null(await menu.Published(default));
    }

    [PostgresFact]
    public async Task Publication_rejects_zero_inactive_and_divergent_prices()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        var catalog = new BarCatalogService(isolated.Context);
        var first = await catalog.SaveProduct(null, new("", "Água A", "Água A", null, "un", "un", 1, 5, 0, 0, false, false, 0), default);
        var second = await catalog.SaveProduct(null, new("", "Água B", "Água B", null, "un", "un", 1, 8, 0, 0, false, false, 0), default);
        var menu = new BarMenuService(isolated.Context, TimeProvider.System);
        var state = await menu.Save(new(0, new("Cardápio", [new("p", "Bebidas", 10, true, [new("i", "Água", "", true, [first.Product.Id, second.Product.Id])])])), default);
        await Assert.ThrowsAsync<MenuValidationException>(() => menu.Publish(new(state.Version), default));
        var input = new ProductInput(second.Product.Code, "Água B", "Água B", second.Product.CategoryId, "un", "un", 1, 0, 0, 0, false, false, 0, Version: second.Product.Version);
        var zero = await catalog.SaveProduct(second.Product.Id, input, default);
        await Assert.ThrowsAsync<MenuValidationException>(() => menu.Publish(new(state.Version), default));
        await catalog.SaveProduct(second.Product.Id, input with { SalePrice = 5, Active = false, Version = zero.Product.Version }, default);
        await Assert.ThrowsAsync<MenuValidationException>(() => menu.Publish(new(state.Version), default));
        Assert.Null(await menu.Published(default));
    }

    [PostgresFact]
    public async Task Concurrent_first_saves_have_one_winner()
    {
        await using var isolated = await IsolatedBarDatabase.Create();
        async Task<bool> Save()
        {
            await using var db = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(isolated.Context.Database.GetConnectionString()).Options, TimeProvider.System);
            try { await new BarMenuService(db, TimeProvider.System).Save(new(0, new("Cardápio", [])), default); return true; }
            catch (MenuConcurrencyException) { return false; }
        }
        var results = await Task.WhenAll(Save(), Save());
        Assert.Single(results, x => x);
    }
}
