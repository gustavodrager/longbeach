using LongBeach.Domain.Bar;
using LongBeach.Domain.Payments;
using LongBeach.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Persistence;
public static class PaymentModel
{
    public static void Configure(ModelBuilder m)
    {
        var r=m.Entity<StockReservation>();r.ToTable("stock_reservations");r.HasKey(x=>x.Id);r.Property(x=>x.Id).ValueGeneratedNever();r.Property(x=>x.Quantity).HasPrecision(12,3);r.HasIndex(x=>new{x.SaleId,x.ProductId}).IsUnique();r.HasOne<BarSale>().WithMany().HasForeignKey(x=>x.SaleId).OnDelete(DeleteBehavior.Restrict);r.HasOne<BarProduct>().WithMany().HasForeignKey(x=>x.ProductId).OnDelete(DeleteBehavior.Restrict);r.HasOne<StockLocation>().WithMany().HasForeignKey(x=>x.LocationId).OnDelete(DeleteBehavior.Restrict);
        var w=m.Entity<PaymentWebhookInbox>();w.ToTable("payment_webhook_inbox");w.HasKey(x=>x.Id);w.Property(x=>x.Id).ValueGeneratedNever();w.Property(x=>x.PayloadHash).HasMaxLength(64);w.HasIndex(x=>x.PayloadHash).IsUnique();
        var t=m.Entity<PaymentProviderTransaction>();t.ToTable("payment_provider_transactions");t.HasKey(x=>x.Id);t.Property(x=>x.Id).ValueGeneratedNever();t.HasOne<BarPayment>().WithMany().HasForeignKey(x=>x.PaymentId).OnDelete(DeleteBehavior.Restrict);
        var c=m.Entity<PaymentReconciliation>();c.ToTable("payment_reconciliations");c.HasKey(x=>x.Id);c.Property(x=>x.Id).ValueGeneratedNever();c.Property(x=>x.Fee).HasPrecision(12,2);c.Property(x=>x.Net).HasPrecision(12,2);c.HasIndex(x=>x.PaymentId).IsUnique();c.HasOne<BarPayment>().WithMany().HasForeignKey(x=>x.PaymentId).OnDelete(DeleteBehavior.Restrict);
    }
}
