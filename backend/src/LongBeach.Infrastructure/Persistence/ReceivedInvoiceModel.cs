using LongBeach.Domain.Fiscal;
using LongBeach.Domain.Purchases;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Persistence;
public static class ReceivedInvoiceModel
{
    public static void Configure(ModelBuilder model)
    {
        var entity = model.Entity<ReceivedInvoice>();
        entity.ToTable("received_invoices"); entity.HasKey(x => x.Id); entity.Property(x => x.Id).ValueGeneratedNever();
        entity.Property(x => x.AccessKey).HasMaxLength(44); entity.HasIndex(x => x.AccessKey).IsUnique();
        entity.Property(x => x.RecipientTaxId).HasMaxLength(14); entity.Property(x => x.Number).HasMaxLength(9);
        entity.Property(x => x.SupplierName).HasMaxLength(160); entity.Property(x => x.FileName).HasMaxLength(180);
        entity.Property(x => x.ContentHash).HasMaxLength(64); entity.Property(x => x.PurchaseRequestHash).HasMaxLength(64);
        entity.Property(x => x.Purpose).HasMaxLength(20).HasDefaultValue("Unclassified");
        entity.Property(x => x.ReviewVersion).HasDefaultValue(1).IsConcurrencyToken();
        entity.Property(x => x.Total).HasPrecision(12, 2); entity.Property(x => x.DataJson).HasColumnType("jsonb");
        entity.Property(x => x.PurchaseId).IsConcurrencyToken(); entity.HasIndex(x => x.PurchaseId).IsUnique();
        entity.HasOne<Purchase>().WithMany().HasForeignKey(x => x.PurchaseId).OnDelete(DeleteBehavior.Restrict);
        entity.HasIndex(x => new { x.RecipientTaxId, x.CreatedAtUtc });
    }
}
