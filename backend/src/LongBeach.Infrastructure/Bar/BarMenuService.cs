using System.Data;
using System.Text.Json;
using LongBeach.Application.Bar;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LongBeach.Infrastructure.Bar;

public sealed class BarMenuService(LongBeachDbContext db, TimeProvider clock) : IBarMenu
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static MenuDocument Empty => new("CARDÁPIO", []);
    private static MenuManagement View(BarMenu? menu) => menu is null ? new(0, Empty, null) : new(menu.Version,
        JsonSerializer.Deserialize<MenuDocument>(menu.DraftJson, Json)!,
        menu.PublishedJson is null ? null : JsonSerializer.Deserialize<PublishedMenu>(menu.PublishedJson, Json));
    public async Task<MenuManagement> Get(CancellationToken ct) => View(await db.Set<BarMenu>().AsNoTracking().SingleOrDefaultAsync(ct));
    public async Task<PublishedMenu?> Published(CancellationToken ct) => (await Get(ct)).Published;
    public Task<MenuManagement> Save(MenuSaveInput input, CancellationToken ct)
    {
        if (input.Draft is null) throw new MenuValidationException(new Dictionary<string,string[]> { ["draft"] = ["Informe o rascunho."] });
        return Change(input.Version, input.Draft, false, ct);
    }
    public Task<MenuManagement> Publish(MenuPublishInput input, CancellationToken ct) => Change(input.Version, null, true, ct);

    public static void Validate(MenuDocument document)
    {
        static void Check(bool invalid, string message) { if (invalid) throw new MenuValidationException(new Dictionary<string,string[]> { ["draft"] = [message] }); }
        Check(string.IsNullOrWhiteSpace(document.Title) || document.Title.Length > 160, "Informe um título de até 160 caracteres.");
        Check(document.Pages is null || document.Pages.Count > 40, "Limite de 40 páginas.");
        var pageIds = new HashSet<string>();
        foreach (var page in document.Pages!)
        {
            Check(page is null || string.IsNullOrWhiteSpace(page.Id) || !pageIds.Add(page.Id), "Identificador de página inválido ou repetido.");
            Check(string.IsNullOrWhiteSpace(page!.Title) || page.Title.Length > 160 || page.DurationSeconds is < 5 or > 120, "Confira título e duração da página (5 a 120 segundos).");
            Check(page.Items is null || page.Items.Count > 100, "Limite de 100 itens por página.");
            var itemIds = new HashSet<string>();
            foreach (var item in page.Items!)
            {
                Check(item is null || string.IsNullOrWhiteSpace(item.Id) || !itemIds.Add(item.Id), "Identificador de item inválido ou repetido.");
                Check(string.IsNullOrWhiteSpace(item!.Name) || item.Name.Length > 160 || item.Description is null || item.Description.Length > 1000, "Confira nome e descrição do item.");
                Check(item.ProductIds is null || item.ProductIds.Count > 200 || item.ProductIds.Distinct().Count() != item.ProductIds.Count, "Vínculos inválidos ou repetidos.");
            }
        }
    }

    private async Task<MenuManagement> Change(int version, MenuDocument? draft, bool publish, CancellationToken ct)
    {
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var menu = await db.Set<BarMenu>().SingleOrDefaultAsync(ct);
            if ((menu?.Version ?? 0) != version || publish && menu is null) throw new MenuConcurrencyException();
            var document = draft ?? View(menu).Draft;
            Validate(document);
            if (publish)
            {
                var ids = document.Pages.Where(p => p.Visible).SelectMany(p => p.Items.Where(i => i.Visible)).SelectMany(i => i.ProductIds).Distinct().ToArray();
                var products = await db.Set<BarProduct>().FromSql($"SELECT * FROM bar_products WHERE \"Id\" = ANY ({ids}) ORDER BY \"Id\" FOR SHARE").AsNoTracking().ToDictionaryAsync(p => p.Id, ct);
                var errors = new Dictionary<string,string[]>();
                var pages = new List<PublishedMenuPage>();
                foreach (var page in document.Pages.Where(p => p.Visible))
                {
                    var items = new List<PublishedMenuItem>();
                    foreach (var item in page.Items.Where(i => i.Visible))
                    {
                        var linked = item.ProductIds.Select(id => products.GetValueOrDefault(id)).ToArray();
                        if (linked.Length == 0 || linked.Any(p => p is null || !p.Active || p.SalePrice <= 0 || p.SalePrice > 99_999_999m) || linked.Select(p => p!.SalePrice).Distinct().Count() != 1)
                        { errors[$"{page.Id}/{item.Id}"] = [$"{page.Title} / {item.Name}: confira vínculos, produtos ativos e preços positivos iguais."]; continue; }
                        items.Add(new(item.Id, item.Name, item.Description, linked[0]!.SalePrice));
                    }
                    if (items.Count > 0) pages.Add(new(page.Id, page.Title, page.DurationSeconds, items));
                }
                if (pages.Count == 0) errors["pages"] = ["Inclua uma página visível com itens válidos."];
                if (errors.Count > 0) throw new MenuValidationException(errors);
                var snapshot = JsonSerializer.Serialize(new PublishedMenu(menu!.Version + 1, clock.GetUtcNow(), document.Title, pages), Json);
                if (System.Text.Encoding.UTF8.GetByteCount(snapshot) > 900_000)
                    throw new MenuValidationException(new Dictionary<string,string[]> { ["pages"] = ["O cardápio excede o limite de cache offline. Reduza páginas ou descrições."] });
                menu.Publish(snapshot);
            }
            else if (menu is null) { menu = new(JsonSerializer.Serialize(document, Json)); db.Add(menu); }
            else menu.SaveDraft(JsonSerializer.Serialize(document, Json));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return View(menu);
        }
        catch (DbUpdateConcurrencyException) { throw new MenuConcurrencyException(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" or "40001" or "40P01" }) { throw new MenuConcurrencyException(); }
        catch (PostgresException ex) when (ex.SqlState is "40001" or "40P01") { throw new MenuConcurrencyException(); }
        catch (InvalidOperationException ex) when (IsConcurrency(ex)) { throw new MenuConcurrencyException(); }
    }
    private static bool IsConcurrency(Exception error)
    {
        for (Exception? current = error; current is not null; current = current.InnerException)
            if (current is PostgresException { SqlState: "40001" or "40P01" or "23505" }) return true;
        return false;
    }
}
