using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Persistence;
public static class CashModel
{
    public static void Configure(ModelBuilder m)
    {
        var r = m.Entity<CashRegister>(); r.ToTable("cash_registers"); r.HasKey(x => x.Id); r.Property(x => x.Id).ValueGeneratedNever(); r.Property(x => x.Name).HasMaxLength(100); r.HasIndex(x => x.Name).IsUnique();
        var s = m.Entity<CashSession>(); s.ToTable("cash_sessions"); s.HasKey(x => x.Id); s.Property(x => x.Id).ValueGeneratedNever(); s.Property(x => x.Opening).HasPrecision(12,2); s.Property(x => x.Expected).HasPrecision(12,2); s.Property(x => x.Version).IsConcurrencyToken();
        s.HasIndex(x => x.RegisterId).IsUnique().HasFilter("\"State\" IN ('Open','Reopened')"); s.HasOne<CashRegister>().WithMany().HasForeignKey(x => x.RegisterId).OnDelete(DeleteBehavior.Restrict); s.HasOne<StockLocation>().WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
        var v = m.Entity<CashMovement>(); v.ToTable("cash_movements"); v.HasKey(x => x.Id); v.Property(x => x.Id).ValueGeneratedNever(); v.Property(x => x.Amount).HasPrecision(12,2); v.HasIndex(x => new {x.OriginId, x.Kind}).IsUnique(); v.HasOne<CashSession>().WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Restrict);
        var c = m.Entity<CashClosing>(); c.ToTable("cash_closings"); c.HasKey(x => x.Id); c.Property(x => x.Id).ValueGeneratedNever(); c.Property(x => x.Expected).HasPrecision(12,2); c.Property(x => x.Counted).HasPrecision(12,2); c.Property(x => x.Difference).HasPrecision(12,2); c.HasOne<CashSession>().WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Restrict);
    }
}
