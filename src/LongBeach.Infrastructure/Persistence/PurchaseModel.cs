using LongBeach.Domain.Bar;
using LongBeach.Domain.Purchases;
using LongBeach.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Persistence;
public static class PurchaseModel
{
    public static void Configure(ModelBuilder m)
    {
        var s=m.Entity<Supplier>(); s.ToTable("suppliers"); s.HasKey(x=>x.Id); s.Property(x=>x.Id).ValueGeneratedNever(); s.Property(x=>x.Name).HasMaxLength(160); s.HasIndex(x=>x.Name).IsUnique();
        var p=m.Entity<Purchase>(); p.ToTable("purchases"); p.HasKey(x=>x.Id); p.Property(x=>x.Id).ValueGeneratedNever(); p.Property(x=>x.Freight).HasPrecision(12,2);p.Property(x=>x.Discount).HasPrecision(12,2);p.Property(x=>x.Total).HasPrecision(12,2);p.Property(x=>x.Version).IsConcurrencyToken();p.HasIndex(x=>new{x.SupplierId,x.Document}).IsUnique(); p.HasOne<Supplier>().WithMany().HasForeignKey(x=>x.SupplierId).OnDelete(DeleteBehavior.Restrict); p.HasMany(x=>x.Items).WithOne().HasForeignKey(x=>x.PurchaseId).OnDelete(DeleteBehavior.Restrict);
        var i=m.Entity<PurchaseItem>(); i.ToTable("purchase_items"); i.HasKey(x=>x.Id); i.Property(x=>x.Id).ValueGeneratedNever(); i.Property(x=>x.Quantity).HasPrecision(12,3); i.Property(x=>x.Received).HasPrecision(12,3); i.Property(x=>x.Conversion).HasPrecision(12,3); i.Property(x=>x.PurchaseCost).HasPrecision(12,2);i.Property(x=>x.LandedTotal).HasPrecision(12,2);i.Property(x=>x.CostReceived).HasPrecision(12,2); i.HasIndex(x=>new{x.PurchaseId,x.ProductId}).IsUnique(); i.HasOne<BarProduct>().WithMany().HasForeignKey(x=>x.ProductId).OnDelete(DeleteBehavior.Restrict);
        var r=m.Entity<PurchaseReceipt>(); r.ToTable("purchase_receipts"); r.HasKey(x=>x.Id); r.Property(x=>x.Id).ValueGeneratedNever(); r.HasIndex(x=>x.OperationId).IsUnique(); r.HasOne<Purchase>().WithMany().HasForeignKey(x=>x.PurchaseId).OnDelete(DeleteBehavior.Restrict); r.HasOne<StockLocation>().WithMany().HasForeignKey(x=>x.LocationId).OnDelete(DeleteBehavior.Restrict);
    }
}
