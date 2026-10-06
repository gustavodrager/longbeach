using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.IntegrationTests;

public sealed class PagVendasCatalogPostgresTests
{
    [PostgresFact]
    public async Task Import_is_atomic_reconciled_and_repeatable_without_product_duplicates()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var code = Guid.NewGuid().ToString("N"); var category = "Categoria " + code;
        var batch = await Stage(db, code, category);
        var service = new CatalogImportService(db, new NullAuditContext(), TimeProvider.System);
        var preview = await service.Preview(batch, default);
        Assert.True(preview.CanApply); Assert.Equal(1, preview.Creates);
        await service.Apply(batch, preview.ConfirmationToken, default);
        var product = await db.Set<BarProduct>().SingleAsync(x => x.Code == "PV-" + code.ToUpperInvariant());
        var version = product.Version;
        var repeated = await service.Apply(batch, preview.ConfirmationToken, default);
        Assert.True(repeated.Applied); Assert.Equal(1, repeated.Matches);
        Assert.Equal(1, await db.Set<BarProduct>().CountAsync(x => x.Code == product.Code));
        Assert.Equal(version, product.Version);
        Assert.True(await db.AuditLogs.AnyAsync(x => x.Action == "PagVendasCatalogApplied" && x.ResourceId == batch.ToString()));
        Assert.Equal("Applied", await db.Database.SqlQuery<string>($"SELECT review_status AS \"Value\" FROM import_rows WHERE batch_id = {batch}").SingleAsync());
    }

    [PostgresFact]
    public async Task Existing_catalog_is_reconciled_without_resetting_local_cost_metadata_or_stock_settings()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var code = Guid.NewGuid().ToString("N"); var category = new BarProductCategory("Categoria " + code);
        db.Add(category);
        var product = new BarProduct("PV-" + code, "Água teste", "Água local", category.Id, "un", "cx", 24, 5, 4.99m, 12, false, true, 7);
        product.SetMetadata("789", "https://storage.test/agua.jpg", null); db.Add(product); await db.SaveChangesAsync();
        var version = product.Version;
        var batch = await Stage(db, code, category.Name);
        var service = new CatalogImportService(db, new NullAuditContext(), TimeProvider.System);
        var preview = await service.Preview(batch, default);
        Assert.Equal(1, preview.Matches); Assert.Equal(0, preview.Creates);
        await service.Apply(batch, preview.ConfirmationToken, default);
        await db.Entry(product).ReloadAsync();
        Assert.Equal(version, product.Version); Assert.Equal(4.99m, product.AverageCost);
        Assert.Equal("789", product.Barcode); Assert.Equal(24, product.ConversionFactor); Assert.False(product.ControlsStock);
    }

    [PostgresFact]
    public async Task Concurrent_catalog_change_invalidates_preview_and_keeps_batch_pending()
    {
        await using var db = Database(); await db.Database.MigrateAsync();
        var code = Guid.NewGuid().ToString("N"); var category = new BarProductCategory("Categoria " + code); db.Add(category); await db.SaveChangesAsync();
        var batch = await Stage(db, code, category.Name);
        var service = new CatalogImportService(db, new NullAuditContext(), TimeProvider.System);
        var preview = await service.Preview(batch, default);
        db.Add(new BarProduct("PV-" + code, "Água teste", "Água", category.Id, "un", "un", 1, 6, 0, 0, true, false, 0));
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<BarRuleException>(() => service.Apply(batch, preview.ConfirmationToken, default));
        Assert.Equal("NeedsReview", await db.Database.SqlQuery<string>($"SELECT status AS \"Value\" FROM import_batches WHERE id = {batch}").SingleAsync());
        Assert.False(await db.AuditLogs.AnyAsync(x => x.Action == "PagVendasCatalogApplied" && x.ResourceId == batch.ToString()));
    }

    private static async Task<Guid> Stage(LongBeachDbContext db, string code, string category)
    {
        var id = Guid.NewGuid(); var name = "produtos-teste-" + id + ".xlsx"; var hash = new string('a', 64);
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO import_batches(id,source_name,source_sha256,status,row_count,created_at_utc) VALUES({id},{name},{hash},'NeedsReview',1,{DateTimeOffset.UtcNow})");
        var payload = JsonSerializer.Serialize(new { entity = "bar-product", source = "PagVendas - Long Beach Arena Ltda", currency = "BRL", codigo_pagvendas = code,
            nome = "Água teste", categoria = category, preco_custo_centavos = 0, preco_venda_centavos = 500, codigo_barras = (string?)null });
        var row = Guid.NewGuid(); var externalId = "pagvendas:" + code;
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO import_rows(id,batch_id,source_sheet,source_row,record_type,external_id,payload,review_status) VALUES({row},{id},'Sheet1',2,'reference-data',{externalId},{payload}::jsonb,'NeedsReview')");
        return id;
    }

    private static LongBeachDbContext Database() => new(new DbContextOptionsBuilder<LongBeachDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")).Options, TimeProvider.System);
}
