using LongBeach.Domain.Inventory;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Persistence;

public static class MaterialStockModel
{
    public static void Configure(ModelBuilder model)
    {
        var m = model.Entity<MaterialMovement>();
        m.ToTable("material_movements", table => table.HasCheckConstraint("CK_material_movement",
            "\"Before\" >= 0 AND \"After\" >= 0 AND \"After\" = \"Before\" + \"Quantity\" AND \"Quantity\" <> 0"));
        m.HasKey(x => x.Id); m.Property(x => x.Id).ValueGeneratedNever();
        m.Property(x => x.Kind).HasMaxLength(40);
        m.Property(x => x.Unit).HasMaxLength(20);
        m.Property(x => x.Location).HasMaxLength(160);
        m.Property(x => x.Reason).HasMaxLength(500);
        m.Property(x => x.Destination).HasMaxLength(160);
        m.Property(x => x.Before).HasPrecision(12, 3); m.Property(x => x.After).HasPrecision(12, 3);
        m.Property(x => x.Quantity).HasPrecision(12, 3); m.Property(x => x.RequestedQuantity).HasPrecision(12, 3);
        m.HasIndex(x => new { x.MaterialId, x.CreatedAtUtc });
        m.HasIndex(x => new { x.MaterialId, x.ExpectedVersion }).IsUnique();
        m.HasOne<OperationalRecord>().WithMany().HasForeignKey(x => x.MaterialId).OnDelete(DeleteBehavior.Restrict);
    }
}
