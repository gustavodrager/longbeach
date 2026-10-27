using System.Text.Json.Nodes;
using System.Text.Json;
using LongBeach.Application.Inventory;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LongBeach.UnitTests;

public sealed class MaterialStockRulesTests
{
    [Theory]
    [InlineData("Receipt", 1.125, 3.625)]
    [InlineData("Consumption", 0.125, 2.375)]
    [InlineData("Loss", 2.5, 0)]
    [InlineData("Count", 0, 0)]
    public void Movements_preserve_fractional_quantities_and_before_after(string kind, double input, double after)
    {
        var m = Movement(kind, (decimal)input);
        Assert.Equal(2.5m, m.Before); Assert.Equal((decimal)after, m.After);
        Assert.Equal(m.Before + m.Quantity, m.After);
    }

    [Theory]
    [InlineData("Consumption", 3)]
    [InlineData("Loss", -1)]
    [InlineData("Receipt", 0)]
    [InlineData("Receipt", 0.0001)]
    [InlineData("Count", 2.5)]
    [InlineData("Unknown", 1)]
    public void Invalid_operations_are_rejected(string kind, double amount) => Assert.Throws<InventoryRuleException>(() => Movement(kind, (decimal)amount));

    [Fact]
    public void Metadata_cannot_rewrite_stock_or_history_and_new_records_start_empty()
    {
        var original = JsonNode.Parse("""{"quantity":2,"minimum":1,"unit":"litro","location":"Depósito","movements":[{"kind":"Baixa","quantity":1}]}""")!.AsObject();
        foreach (var key in new[] { "quantity", "unit", "movements" })
        {
            var changed = original.DeepClone().AsObject();
            changed[key] = key switch { "quantity" => JsonValue.Create(9), "unit" => JsonValue.Create("caixa"), _ => new JsonArray() };
            Assert.Throws<InventoryRuleException>(() => MaterialRecordRules.GuardMetadata(changed, original.ToJsonString()));
        }
        Assert.Throws<InventoryRuleException>(() => MaterialRecordRules.GuardMetadata(original, null));
        var metadata = original.DeepClone().AsObject(); metadata["minimum"] = 1.125m;
        MaterialRecordRules.GuardMetadata(metadata, original.ToJsonString());
        Assert.Equal("Unclassified", metadata["nature"]!.GetValue<string>());
        Assert.True(JsonNode.DeepEquals(original["movements"], metadata["movements"]));
    }
    [Fact]
    public void Omitted_legacy_history_and_financial_fields_are_preserved_without_reclassifying_legacy_items()
    {
        var original = JsonNode.Parse("""{"quantity":2,"minimum":1,"unit":" litro ","location":"Depósito","unitCost":9,"paymentMethod":"Pix","movements":[{"kind":"Entrada","quantity":2}]}""")!.AsObject();
        var metadata = original.DeepClone().AsObject();
        metadata.Remove("movements"); metadata.Remove("unitCost"); metadata.Remove("paymentMethod");
        MaterialRecordRules.GuardMetadata(metadata, original.ToJsonString());
        Assert.Equal("Unclassified", metadata["nature"]!.GetValue<string>());
        Assert.Equal("litro", metadata["unit"]!.GetValue<string>());
        Assert.Equal(9, metadata["unitCost"]!.GetValue<int>());
        Assert.Equal("Pix", metadata["paymentMethod"]!.GetValue<string>());
        Assert.True(JsonNode.DeepEquals(original["movements"], metadata["movements"]));
    }

    [Fact]
    public void New_materials_begin_empty_and_fractional_limits_are_enforced()
    {
        var material = JsonNode.Parse("""{"quantity":0,"minimum":0.125,"unit":"litro","location":"Depósito"}""")!.AsObject();
        MaterialRecordRules.GuardMetadata(material, null);
        Assert.Equal("Consumable", material["nature"]!.GetValue<string>());
        material["movements"] = JsonNode.Parse("""[{"kind":"Entrada","quantity":1}]""");
        Assert.Throws<InventoryRuleException>(() => MaterialRecordRules.GuardMetadata(material, null));
        Assert.Throws<InventoryRuleException>(() => StockQuantity.Validate(0.0001m, true));
        Assert.Throws<InventoryRuleException>(() => StockQuantity.Move(99999999m, 1));
        Assert.Throws<InventoryRuleException>(() => StockQuantity.Move(1, -2));
    }

    [Fact]
    public void Only_management_profiles_receive_adjust_and_current_model_matches_additive_migration()
    {
        foreach (var role in new[] { SystemRoles.Owner, SystemRoles.Administrator, SystemRoles.Manager })
            Assert.Contains(SystemPermissions.InventoryAdjust, ProfileAccess.Permissions([role], []));
        Assert.DoesNotContain(SystemPermissions.InventoryAdjust, ProfileAccess.Permissions([SystemRoles.Operations], SystemPermissions.All));
        using var db = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>()
            .UseNpgsql("Host=localhost;Port=1;Database=longbeach_migrations_test;Username=test;Password=test").Options, TimeProvider.System);
        Assert.False(db.Database.HasPendingModelChanges());
        var sql = db.GetService<IMigrator>().GenerateScript("20261021154910_ExpenseAttachments");
        Assert.Contains("CREATE TABLE material_movements", sql);
        Assert.Contains("BEFORE UPDATE OR DELETE ON material_movements", sql);
        Assert.DoesNotContain("UPDATE operational_records", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DELETE FROM operational_records", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("INSERT INTO material_movements", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(28, db.Database.GetMigrations().Count());
    }

    [Theory]
    [InlineData(null, 0, false, false, true)]
    [InlineData("", 0, false, false, true)]
    [InlineData("  ", 0, false, false, true)]
    [InlineData(null, 1, false, false, false)]
    [InlineData(null, 0, true, false, false)]
    [InlineData(null, 0, false, true, false)]
    [InlineData("un", 0, false, false, false)]
    public void A_missing_legacy_unit_requires_explicit_first_definition_without_balance_or_any_history(
        string? savedUnit, int quantity, bool legacyHistory, bool ledgerHistory, bool allowed)
    {
        var original = JsonNode.Parse(JsonSerializer.Serialize(new { quantity, minimum = 0, unit = savedUnit, location = "Depósito" }))!.AsObject();
        if (savedUnit is null) original.Remove("unit");
        if (legacyHistory) original["movements"] = JsonNode.Parse("""[{"kind":"Entrada","quantity":1}]""");
        var incoming = original.DeepClone().AsObject();
        if (string.IsNullOrWhiteSpace(savedUnit))
            Assert.Throws<InventoryRuleException>(() => MaterialRecordRules.GuardMetadata(incoming, original.ToJsonString(), ledgerHistory));
        incoming["unit"] = " litro ";
        if (allowed)
        {
            MaterialRecordRules.GuardMetadata(incoming, original.ToJsonString(), ledgerHistory);
            Assert.Equal("litro", incoming["unit"]!.GetValue<string>());
            var changed = incoming.DeepClone().AsObject(); changed["unit"] = "caixa";
            Assert.Throws<InventoryRuleException>(() => MaterialRecordRules.GuardMetadata(changed, incoming.ToJsonString()));
        }
        else Assert.Throws<InventoryRuleException>(() => MaterialRecordRules.GuardMetadata(incoming, original.ToJsonString(), ledgerHistory));
    }

    private static MaterialMovement Movement(string kind, decimal quantity) => new(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), 1, kind, quantity, 2.5m, "litro", "Depósito", "Conferência", "Limpeza");
}
