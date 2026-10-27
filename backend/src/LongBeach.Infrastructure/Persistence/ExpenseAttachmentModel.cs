using LongBeach.Domain.Finance;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Persistence;

public static class ExpenseAttachmentModel
{
    public static void Configure(ModelBuilder model)
    {
        var entity = model.Entity<ExpenseAttachment>();
        entity.ToTable("expense_attachments");
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).ValueGeneratedNever();
        entity.Property(x => x.FileName).HasMaxLength(180).IsRequired();
        entity.Property(x => x.ContentType).HasMaxLength(40).IsRequired();
        entity.Property(x => x.ContentHash).HasMaxLength(64).IsRequired();
        entity.HasIndex(x => x.OperationId).IsUnique();
        entity.HasIndex(x => new { x.ExpenseId, x.CreatedAtUtc });
        entity.HasOne<OperationalRecord>().WithMany().HasForeignKey(x => x.ExpenseId).OnDelete(DeleteBehavior.Restrict);
    }
}
