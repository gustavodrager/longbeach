using LongBeach.Domain.Bar;
using LongBeach.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Persistence;
public static class StockModel
{
    public static readonly Guid Warehouse = Guid.Parse("b0000000-0000-0000-0000-000000000001");
    public static readonly Guid Bar = Guid.Parse("b0000000-0000-0000-0000-000000000002");
    public static void Configure(ModelBuilder m)
    {
        var l = m.Entity<StockLocation>(); l.ToTable("stock_locations"); l.HasKey(x => x.Id); l.Property(x => x.Id).ValueGeneratedNever();
        l.Property(x => x.Name).HasMaxLength(100); l.HasIndex(x => x.Name).IsUnique();
        l.HasData(new StockLocation("Almoxarifado", Warehouse), new StockLocation("Bar", Bar));
        var b = m.Entity<StockBalance>(); b.ToTable("stock_balances", t => t.HasCheckConstraint("CK_stock_balance", "\"Quantity\" >= \"Reserved\" AND \"Reserved\" >= 0"));
        b.HasKey(x => x.Id); b.Ignore(x => x.Available); b.Property(x => x.Id).ValueGeneratedNever();
        b.Property(x => x.Quantity).HasPrecision(12, 3); b.Property(x => x.Reserved).HasPrecision(12, 3); b.Property(x => x.Version).IsConcurrencyToken();
        b.HasIndex(x => new { x.ProductId, x.LocationId }).IsUnique();
        b.HasOne<BarProduct>().WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<StockLocation>().WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
        var s = m.Entity<StockMovement>(); s.ToTable("stock_movements"); s.HasKey(x => x.Id); s.Property(x => x.Id).ValueGeneratedNever();
        s.Property(x => x.Before).HasPrecision(12, 3); s.Property(x => x.After).HasPrecision(12, 3); s.Property(x => x.Quantity).HasPrecision(12, 3); s.Property(x => x.UnitCost).HasPrecision(18,6);
        s.Property(x => x.Kind).HasMaxLength(40); s.Property(x => x.Reason).HasMaxLength(500);
        s.HasIndex(x => new { x.OriginId, x.ProductId, x.LocationId, x.Kind }).IsUnique();
        s.HasOne<BarProduct>().WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        s.HasOne<StockLocation>().WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
        var c = m.Entity<InventoryCount>(); c.ToTable("inventory_counts"); c.HasKey(x => x.Id); c.Property(x => x.Id).ValueGeneratedNever(); c.Property(x => x.Version).IsConcurrencyToken();
        c.HasIndex(x => x.LocationId).IsUnique().HasFilter("\"State\" = 'Counting'");
        c.HasOne<StockLocation>().WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
        c.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.CountId).OnDelete(DeleteBehavior.Restrict);
        var i = m.Entity<InventoryCountItem>(); i.ToTable("inventory_count_items"); i.HasKey(x => x.Id); i.Property(x => x.Id).ValueGeneratedNever();
        i.HasIndex(x => new { x.CountId, x.ProductId }).IsUnique(); i.Property(x => x.Theoretical).HasPrecision(12, 3); i.Property(x => x.Counted).HasPrecision(12, 3); i.Property(x => x.UnitCost).HasPrecision(18,6);
        i.HasOne<BarProduct>().WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
    }
}
