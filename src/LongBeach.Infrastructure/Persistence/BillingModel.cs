using LongBeach.Domain.Billing;
using LongBeach.Domain.Identity;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Persistence;

public static class BillingModel
{
    public static void Configure(ModelBuilder m)
    {
        var o = m.Entity<BillingProviderOrder>(); o.ToTable("billing_orders"); o.HasKey(x => x.Id); o.Property(x => x.Amount).HasPrecision(12, 2); o.HasIndex(x => x.ProviderId).IsUnique(); o.HasIndex(x => x.PaymentId).IsUnique(); o.HasOne<BillingPayment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
        var a = m.Entity<BillingAccount>(); a.ToTable("billing_accounts"); a.HasKey(x => x.Id); a.Property(x => x.Kind).HasMaxLength(16); a.HasIndex(x => new { x.Kind, x.SourceId }).IsUnique(); a.HasIndex(x => x.UserId); a.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        var p = m.Entity<BillingPayment>(); p.ToTable("billing_payments"); p.HasKey(x => x.Id); p.Property(x => x.Version).IsConcurrencyToken(); p.Property(x => x.Amount).HasPrecision(12, 2); p.Property(x => x.Refunded).HasPrecision(12, 2); p.HasIndex(x => x.OperationId).IsUnique(); p.HasIndex(x => x.ProviderId).IsUnique(); p.HasIndex(x => x.ChargeId).IsUnique(); p.HasIndex(x => x.AccountId).IsUnique().HasFilter("\"State\" = 'Pending'"); p.HasOne<BillingAccount>().WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
        var r = m.Entity<BillingRefund>(); r.ToTable("billing_refunds"); r.HasKey(x => x.Id); r.HasIndex(x => x.OperationId).IsUnique(); r.HasIndex(x => x.PaymentId).IsUnique().HasFilter("\"State\" = 'Pending'"); r.Property(x => x.Amount).HasPrecision(12, 2); r.Property(x => x.Previous).HasPrecision(12, 2); r.HasOne<BillingPayment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
        var s = m.Entity<BillingSubscription>(); s.ToTable("billing_subscriptions"); s.HasKey(x => x.Id); s.Property(x => x.Amount).HasPrecision(12, 2); s.Property(x => x.Version).IsConcurrencyToken(); s.HasIndex(x => x.OperationId).IsUnique(); s.HasIndex(x => x.ProviderId).IsUnique(); s.HasIndex(x => new { x.SourceKind, x.SourceId }).IsUnique().HasFilter("\"State\" NOT IN ('CANCELED','EXPIRED')"); s.HasOne<BillingAccount>().WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
        var t = m.Entity<BillingSettlement>(); t.ToTable("billing_settlements"); t.HasKey(x => x.Id); t.Property(x => x.Gross).HasPrecision(12, 2); t.Property(x => x.Fee).HasPrecision(12, 2); t.Property(x => x.Net).HasPrecision(12, 2); t.HasIndex(x => x.PaymentId).IsUnique(); t.HasIndex(x => x.ExternalId).IsUnique(); t.HasOne<BillingAccount>().WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
    }
}
