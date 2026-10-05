using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Persistence;

public static class TabModel
{
    public static void Configure(ModelBuilder m)
    {
        m.HasSequence<long>("bar_tab_numbers");
        var t = m.Entity<BarTab>(); t.ToTable("bar_tabs"); t.HasKey(x => x.Id); t.Property(x => x.Id).ValueGeneratedNever();
        t.Property(x => x.Number).HasDefaultValueSql("nextval('bar_tab_numbers')").ValueGeneratedOnAdd(); t.HasIndex(x => x.Number).IsUnique();
        t.Property(x => x.Discount).HasPrecision(12, 2); t.Property(x => x.Name).HasMaxLength(80); t.Property(x => x.Mode).HasMaxLength(16); t.Property(x => x.State).HasMaxLength(16); t.Property(x => x.Version).IsConcurrencyToken();
        t.HasIndex(x => new { x.State, x.CreatedAtUtc }); t.HasOne<StockLocation>().WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
        var i = m.Entity<BarTabItem>(); i.ToTable("bar_tab_items"); i.HasKey(x => x.Id); i.Property(x => x.Id).ValueGeneratedNever();
        i.Property(x => x.Name).HasMaxLength(80); i.Property(x => x.Source).HasMaxLength(24); i.Property(x => x.State).HasMaxLength(16); i.Property(x => x.Reason).HasMaxLength(500);
        i.Property(x => x.Quantity).HasPrecision(12, 3); i.Property(x => x.UnitPrice).HasPrecision(12, 2); i.Property(x => x.Total).HasPrecision(12, 2); i.Property(x => x.UnitCost).HasPrecision(18, 6); i.Property(x => x.Version).IsConcurrencyToken();
        i.HasIndex(x => new { x.TabId, x.State }); i.HasIndex(x => x.AcceptedAtUtc); i.HasOne<BarTab>().WithMany().HasForeignKey(x => x.TabId).OnDelete(DeleteBehavior.Restrict); i.HasOne<BarProduct>().WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        var p = m.Entity<BarTabPayment>(); p.ToTable("bar_tab_payments"); p.HasKey(x => x.Id); p.Property(x => x.Id).ValueGeneratedNever();
        p.Property(x => x.Fingerprint).HasMaxLength(64); p.Property(x => x.Method).HasMaxLength(24); p.Property(x => x.State).HasMaxLength(16); p.Property(x => x.Authorization).HasMaxLength(100); p.Property(x => x.ProviderId).HasMaxLength(200);
        p.Property(x => x.Amount).HasPrecision(12, 2); p.Property(x => x.Tendered).HasPrecision(12, 2); p.Property(x => x.Refunded).HasPrecision(12, 2); p.Property(x => x.Fee).HasPrecision(12, 2); p.Property(x => x.Version).IsConcurrencyToken();
        p.HasIndex(x => x.OperationId).IsUnique(); p.HasIndex(x => x.ProviderId).IsUnique().HasFilter("\"ProviderId\" IS NOT NULL"); p.HasIndex(x => new { x.TabId, x.State }); p.HasIndex(x => x.ConfirmedAtUtc);
        p.HasOne<BarTab>().WithMany().HasForeignKey(x => x.TabId).OnDelete(DeleteBehavior.Restrict); p.HasOne<CashSession>().WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Restrict);
        var r = m.Entity<BarTabRefund>(); r.ToTable("bar_tab_refunds"); r.HasKey(x => x.Id); r.Property(x => x.Id).ValueGeneratedNever();
        r.Property(x => x.Fingerprint).HasMaxLength(64); r.Property(x => x.State).HasMaxLength(16); r.Property(x => x.Reason).HasMaxLength(500); r.Property(x => x.Amount).HasPrecision(12, 2); r.Property(x => x.Version).IsConcurrencyToken(); r.HasIndex(x => x.OperationId).IsUnique(); r.HasIndex(x => x.ConfirmedAtUtc);
        r.HasOne<BarTab>().WithMany().HasForeignKey(x => x.TabId).OnDelete(DeleteBehavior.Restrict); r.HasOne<BarTabPayment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
        var a = m.Entity<BarTabAccess>(); a.ToTable("bar_tab_access"); a.HasKey(x => x.Id); a.Property(x => x.Id).ValueGeneratedNever(); a.Property(x => x.TokenHash).HasMaxLength(64); a.Property(x => x.Version).IsConcurrencyToken(); a.HasIndex(x => x.TokenHash).IsUnique(); a.HasIndex(x => x.OperationId).IsUnique(); a.HasOne<BarTab>().WithMany().HasForeignKey(x => x.TabId).OnDelete(DeleteBehavior.Restrict);
        var o = m.Entity<BarTabOperation>(); o.ToTable("bar_tab_operations"); o.HasKey(x => x.Id); o.Property(x => x.Id).ValueGeneratedNever(); o.Property(x => x.Fingerprint).HasMaxLength(64); o.Property(x => x.ResponseJson).HasColumnType("jsonb");
        var h = m.Entity<BarTabHistory>(); h.ToTable("bar_tab_history"); h.HasKey(x => x.Id); h.Property(x => x.Id).ValueGeneratedNever(); h.Property(x => x.Kind).HasMaxLength(40); h.Property(x => x.Reason).HasMaxLength(500); h.Property(x => x.Amount).HasPrecision(12, 2); h.HasIndex(x => new { x.TabId, x.CreatedAtUtc }); h.HasOne<BarTab>().WithMany().HasForeignKey(x => x.TabId).OnDelete(DeleteBehavior.Restrict);
    }
}
