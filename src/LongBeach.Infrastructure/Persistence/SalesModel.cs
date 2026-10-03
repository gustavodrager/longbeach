using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Payments;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Persistence;
public static class SalesModel
{
    public static void Configure(ModelBuilder m)
    {
        var s = m.Entity<BarSale>(); s.ToTable("bar_sales"); s.HasKey(x => x.Id); s.Property(x => x.Id).ValueGeneratedNever(); s.Property(x => x.Total).HasPrecision(12,2); s.Property(x => x.Cost).HasPrecision(18,6); s.Property(x=>x.DiscountAmount).HasPrecision(12,2); s.Property(x => x.Version).IsConcurrencyToken();
        s.HasOne<CashSession>().WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Restrict); s.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.SaleId).OnDelete(DeleteBehavior.Restrict);
        var d=m.Entity<BarSaleDiscount>();d.ToTable("bar_sale_discounts");d.HasKey(x=>x.Id);d.Property(x=>x.Id).ValueGeneratedNever();d.Property(x=>x.Amount).HasPrecision(12,2);d.HasIndex(x=>x.SaleId).IsUnique();d.HasOne<BarSale>().WithMany().HasForeignKey(x=>x.SaleId).OnDelete(DeleteBehavior.Restrict);
        var i = m.Entity<BarSaleItem>(); i.ToTable("bar_sale_items"); i.HasKey(x => x.Id); i.Property(x => x.Id).ValueGeneratedNever(); i.Property(x => x.Quantity).HasPrecision(12,3); i.Property(x => x.UnitPrice).HasPrecision(12,2); i.Property(x => x.UnitCost).HasPrecision(18,6); i.Property(x => x.Total).HasPrecision(12,2); i.HasIndex(x => new {x.SaleId,x.ProductId}).IsUnique(); i.HasOne<BarProduct>().WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        var p = m.Entity<BarPayment>(); p.ToTable("bar_payments"); p.HasKey(x => x.Id); p.Property(x => x.Id).ValueGeneratedNever(); p.Property(x => x.Amount).HasPrecision(12,2); p.Property(x => x.Tendered).HasPrecision(12,2); p.Property(x => x.Version).IsConcurrencyToken(); p.HasIndex(x => x.OperationId).IsUnique(); p.HasIndex(x => x.SaleId).IsUnique(); p.HasIndex(x => x.ProviderId).IsUnique(); p.HasOne<BarSale>().WithMany().HasForeignKey(x => x.SaleId).OnDelete(DeleteBehavior.Restrict);
        var e = m.Entity<BarEvent>(); e.ToTable("bar_events"); e.HasKey(x => x.Id); e.Property(x => x.Id).ValueGeneratedNever(); e.Property(x => x.Amount).HasPrecision(12,2); e.HasIndex(x => new {x.Name,x.OriginId}).IsUnique();
    }
}
