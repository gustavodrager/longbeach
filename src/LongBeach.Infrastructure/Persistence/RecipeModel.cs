using LongBeach.Domain.Bar;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Persistence;
public static class RecipeModel
{
    public static void Configure(ModelBuilder m)
    {
        var r=m.Entity<BarRecipeVersion>();r.ToTable("bar_recipe_versions");r.HasKey(x=>x.Id);r.Property(x=>x.Id).ValueGeneratedNever();r.Property(x=>x.ProductName).HasMaxLength(160);r.Property(x=>x.Reason).HasMaxLength(500);r.Property(x=>x.YieldQuantity).HasPrecision(12,3);
        r.HasIndex(x=>new{x.ProductId,x.Version}).IsUnique();r.HasOne<BarProduct>().WithMany().HasForeignKey(x=>x.ProductId).OnDelete(DeleteBehavior.Restrict);r.HasMany(x=>x.Ingredients).WithOne().HasForeignKey(x=>x.RecipeId).OnDelete(DeleteBehavior.Restrict);
        var i=m.Entity<BarRecipeIngredient>();i.ToTable("bar_recipe_ingredients");i.HasKey(x=>x.Id);i.Property(x=>x.Id).ValueGeneratedNever();i.Property(x=>x.Name).HasMaxLength(160);i.Property(x=>x.StockUnit).HasMaxLength(20);i.Property(x=>x.Unit).HasMaxLength(16);i.Property(x=>x.Quantity).HasPrecision(12,3);i.Property(x=>x.ConversionFactor).HasPrecision(12,3);i.Property(x=>x.StockQuantity).HasPrecision(18,6);i.HasIndex(x=>new{x.RecipeId,x.ProductId}).IsUnique();i.HasOne<BarProduct>().WithMany().HasForeignKey(x=>x.ProductId).OnDelete(DeleteBehavior.Restrict);
        var s=m.Entity<BarTabIngredientSnapshot>();s.ToTable("bar_tab_ingredients");s.HasKey(x=>x.Id);s.Property(x=>x.Id).ValueGeneratedNever();s.Property(x=>x.Name).HasMaxLength(160);s.Property(x=>x.StockUnit).HasMaxLength(20);s.Property(x=>x.Quantity).HasPrecision(12,3);s.Property(x=>x.UnitCost).HasPrecision(18,6);s.HasIndex(x=>new{x.ItemId,x.ProductId}).IsUnique();s.HasOne<BarTabItem>().WithMany().HasForeignKey(x=>x.ItemId).OnDelete(DeleteBehavior.Restrict);s.HasOne<BarRecipeVersion>().WithMany().HasForeignKey(x=>x.RecipeId).OnDelete(DeleteBehavior.Restrict);s.HasOne<BarRecipeIngredient>().WithMany().HasForeignKey(x=>x.IngredientId).OnDelete(DeleteBehavior.Restrict);s.HasOne<BarProduct>().WithMany().HasForeignKey(x=>x.ProductId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<BarTabItem>().HasOne<BarRecipeVersion>().WithMany().HasForeignKey(x=>x.RecipeId).OnDelete(DeleteBehavior.Restrict);
    }
}
