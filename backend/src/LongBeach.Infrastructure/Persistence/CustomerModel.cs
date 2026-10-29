using LongBeach.Domain.Bar;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Persistence;

public static class CustomerModel
{
    public static void Configure(ModelBuilder model)
    {
        var customer = model.Entity<Customer>();
        customer.ToTable("customers", table => table.HasCheckConstraint("CK_customer_status", "\"Status\" IN ('Ativo','Inativo') AND \"Version\" > 0 AND (\"MergedIntoId\" IS NULL OR \"MergedIntoId\" <> \"Id\")"));
        customer.HasKey(x => x.Id); customer.Property(x => x.Id).ValueGeneratedNever();
        customer.Property(x => x.Name).HasMaxLength(240).IsRequired(); customer.Property(x => x.Phone).HasMaxLength(40).IsRequired();
        customer.Property(x => x.Email).HasMaxLength(320); customer.Property(x => x.Status).HasMaxLength(20).IsRequired();
        customer.Property(x => x.Origin).HasMaxLength(40).IsRequired(); customer.Property(x => x.Version).IsConcurrencyToken();
        customer.HasIndex(x => x.UserId).IsUnique(); customer.HasIndex(x => x.Name); customer.HasIndex(x => x.Phone);
        customer.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        customer.HasOne<Customer>().WithMany().HasForeignKey(x => x.MergedIntoId).OnDelete(DeleteBehavior.Restrict);
        var link = model.Entity<CustomerSourceLink>(); link.ToTable("customer_source_links"); link.HasKey(x => x.Id); link.Property(x => x.Id).ValueGeneratedNever();
        link.Property(x => x.Kind).HasMaxLength(24).IsRequired(); link.Property(x => x.Version).IsConcurrencyToken();
        link.HasIndex(x => new { x.Kind, x.SourceId, x.ParentId }).IsUnique();
        link.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        var change = model.Entity<CustomerSourceChange>(); change.ToTable("customer_source_changes"); change.HasKey(x => x.Id); change.Property(x => x.Id).ValueGeneratedNever();
        change.HasOne<CustomerSourceLink>().WithMany().HasForeignKey(x => x.LinkId).OnDelete(DeleteBehavior.Restrict);
        change.HasOne<Customer>().WithMany().HasForeignKey(x => x.BeforeCustomerId).OnDelete(DeleteBehavior.Restrict);
        change.HasOne<Customer>().WithMany().HasForeignKey(x => x.AfterCustomerId).OnDelete(DeleteBehavior.Restrict);
        var operation = model.Entity<CustomerOperation>(); operation.ToTable("customer_operations"); operation.HasKey(x => x.Id); operation.Property(x => x.Id).ValueGeneratedNever();
        operation.Property(x => x.Kind).HasMaxLength(40).IsRequired(); operation.Property(x => x.Fingerprint).HasMaxLength(64).IsRequired(); operation.Property(x => x.ResponseJson).HasColumnType("jsonb").IsRequired();
        var merge = model.Entity<CustomerMerge>(); merge.ToTable("customer_merges"); merge.HasKey(x => x.Id); merge.Property(x => x.Id).ValueGeneratedNever();
        merge.Property(x => x.Reason).HasMaxLength(500).IsRequired(); merge.Property(x => x.Undone).IsConcurrencyToken();
        merge.HasOne<Customer>().WithMany().HasForeignKey(x => x.SourceId).OnDelete(DeleteBehavior.Restrict);
        merge.HasOne<Customer>().WithMany().HasForeignKey(x => x.TargetId).OnDelete(DeleteBehavior.Restrict);
        merge.HasOne<User>().WithMany().HasForeignKey(x => x.TransferredUserId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<BarTab>().HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<BarSale>().HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
    }
}
