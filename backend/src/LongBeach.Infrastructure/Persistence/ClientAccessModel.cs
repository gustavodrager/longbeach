using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Persistence;

public static class ClientAccessModel
{
    public static void Configure(ModelBuilder model)
    {
        model.Entity<User>().Property(x => x.LocalPasswordEnabled).HasDefaultValue(true);
        model.Entity<User>().Property(x => x.CredentialVersion).HasDefaultValue(0).IsConcurrencyToken();
        model.Entity<RefreshToken>().Property(x => x.CredentialVersion).HasDefaultValue(0);
        var challenge = model.Entity<ClientAccessChallenge>();
        challenge.ToTable("client_access_challenges", table => table.HasCheckConstraint("CK_client_access_purpose", "\"Purpose\" IN ('Activation','Recovery') AND \"Version\" > 0"));
        challenge.HasKey(x => x.Id); challenge.Property(x => x.Id).ValueGeneratedNever();
        challenge.Property(x => x.Purpose).HasMaxLength(20).IsRequired();
        challenge.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
        challenge.Property(x => x.Version).IsConcurrencyToken();
        challenge.HasIndex(x => x.TokenHash).IsUnique();
        challenge.HasIndex(x => new { x.CustomerId, x.Purpose });
        challenge.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        challenge.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        challenge.HasOne<User>().WithMany().HasForeignKey(x => x.IssuedBy).OnDelete(DeleteBehavior.Restrict);
        var guardian = model.Entity<CustomerGuardianAccess>();
        guardian.ToTable("customer_guardian_access"); guardian.HasKey(x => x.Id); guardian.Property(x => x.Id).ValueGeneratedNever();
        guardian.Property(x => x.Version).IsConcurrencyToken();
        guardian.HasIndex(x => new { x.CustomerId, x.UserId }).IsUnique();
        guardian.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        guardian.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
