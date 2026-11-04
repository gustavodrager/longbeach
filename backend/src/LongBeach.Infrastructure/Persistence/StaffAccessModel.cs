using LongBeach.Application.Staff;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Persistence;

public static class StaffAccessModel
{
    public static void Configure(ModelBuilder model)
    {
        model.Entity<User>().Property(x=>x.PhoneLogin).HasMaxLength(16);
        model.Entity<User>().HasIndex(x=>x.PhoneLogin).IsUnique();
        model.Entity<User>().Property(x=>x.RequiresLocalPasswordChange).HasDefaultValue(false);
        var types=model.Entity<StaffAccessType>();types.ToTable("staff_access_types",t=>t.HasCheckConstraint("CK_staff_access_type", "\"Code\" IN ('bar','professor','atendente','gestor') AND \"Role\" IN ('Manager','Teacher','Operations') AND \"Version\" > 0"));
        types.HasKey(x=>x.Id);types.Property(x=>x.Id).ValueGeneratedNever();types.Property(x=>x.Code).HasMaxLength(24).IsRequired();types.HasIndex(x=>x.Code).IsUnique();
        types.Property(x=>x.Name).HasMaxLength(80).IsRequired();types.Property(x=>x.Role).HasMaxLength(24).IsRequired();
        types.Property(x=>x.Menus).HasColumnType("text[]").IsRequired();types.Property(x=>x.Actions).HasColumnType("text[]").IsRequired();types.Property(x=>x.Version).IsConcurrencyToken();
        foreach(var code in StaffAccessCatalog.TypeIds)
        {
            var type=StaffAccessCatalog.Default(code);type.MarkCreated(new DateTimeOffset(2026,11,4,0,0,0,TimeSpan.Zero));types.HasData(type);
        }
        var members=model.Entity<StaffMembership>();members.ToTable("staff_memberships",t=>t.HasCheckConstraint("CK_staff_membership_version","\"Version\" > 0"));
        members.HasKey(x=>x.Id);members.Property(x=>x.Id).ValueGeneratedNever();members.Property(x=>x.Version).IsConcurrencyToken();
        members.HasIndex(x=>x.UserId).IsUnique();members.HasIndex(x=>x.TeamId).IsUnique();
        model.Entity<User>().HasOne(x=>x.StaffMembership).WithOne().HasForeignKey<StaffMembership>(x=>x.UserId).OnDelete(DeleteBehavior.Restrict);
        members.HasOne(x=>x.AccessType).WithMany().HasForeignKey(x=>x.AccessTypeId).OnDelete(DeleteBehavior.Restrict);
        members.HasOne<OperationalRecord>().WithMany().HasForeignKey(x=>x.TeamId).OnDelete(DeleteBehavior.Restrict);
        var operations=model.Entity<StaffAccessOperation>();operations.ToTable("staff_access_operations");operations.HasKey(x=>x.Id);operations.Property(x=>x.Id).ValueGeneratedNever();
        operations.Property(x=>x.Kind).HasMaxLength(24).IsRequired();operations.Property(x=>x.RequestHash).HasMaxLength(64).IsRequired();
        operations.HasOne<User>().WithMany().HasForeignKey(x=>x.ActorId).OnDelete(DeleteBehavior.Restrict);
        operations.HasOne<OperationalRecord>().WithMany().HasForeignKey(x=>x.TeamId).OnDelete(DeleteBehavior.Restrict);
    }
}
