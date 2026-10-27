using LongBeach.Domain.Bar;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Persistence;
public static class BarModel
{
    public static void Configure(ModelBuilder model)
    {
        var category = model.Entity<BarProductCategory>();
        category.ToTable("bar_categories"); category.HasKey(x => x.Id);
        category.Property(x => x.Id).ValueGeneratedNever();
        category.Property(x => x.Name).HasMaxLength(100); category.HasIndex(x => x.Name).IsUnique();
        var product = model.Entity<BarProduct>();
        product.ToTable("bar_products"); product.HasKey(x => x.Id); product.Property(x => x.Id).ValueGeneratedNever();
        product.Property(x=>x.Barcode).HasMaxLength(80);product.Property(x=>x.ImageUrl).HasMaxLength(1000);
        product.HasOne<LongBeach.Domain.Purchases.Supplier>().WithMany().HasForeignKey(x=>x.MainSupplierId).OnDelete(DeleteBehavior.Restrict);
        product.Property(x => x.Code).HasMaxLength(40); product.HasIndex(x => x.Code).IsUnique();
        product.Property(x => x.Name).HasMaxLength(160); product.Property(x => x.ShortName).HasMaxLength(80);
        product.Property(x => x.SaleUnit).HasMaxLength(20); product.Property(x => x.PurchaseUnit).HasMaxLength(20);
        product.Property(x => x.SalePrice).HasPrecision(12, 2); product.Property(x => x.AverageCost).HasPrecision(18,6);
        product.Property(x => x.LastCost).HasPrecision(18,6); product.Property(x => x.ConversionFactor).HasPrecision(12, 3);
        product.Property(x => x.MinimumStock).HasPrecision(12, 3); product.Property(x => x.Version).IsConcurrencyToken();
        product.HasOne<BarProductCategory>().WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
    }
}
