using LongBeach.Domain.Auditing;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations;

[DbContext(typeof(LongBeachDbContext))]
public partial class LongBeachDbContextModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder modelBuilder) => ConfigureModel(modelBuilder);

    internal static void ConfigureModel(ModelBuilder modelBuilder)
    {
        modelBuilder
            .HasAnnotation("ProductVersion", "10.0.0")
            .HasAnnotation("Relational:MaxIdentifierLength", 63);

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.ToTable("audit_logs");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnType("uuid").ValueGeneratedNever();
            entity.Property(item => item.ActorUserId).HasColumnType("uuid");
            entity.Property(item => item.Action).HasMaxLength(40).HasColumnType("character varying(40)").IsRequired();
            entity.Property(item => item.Resource).HasMaxLength(160).HasColumnType("character varying(160)").IsRequired();
            entity.Property(item => item.ResourceId).HasMaxLength(160).HasColumnType("character varying(160)");
            entity.Property(item => item.MetadataJson).HasColumnType("jsonb").IsRequired();
            entity.Property(item => item.IpAddress).HasMaxLength(64).HasColumnType("character varying(64)");
            entity.Property(item => item.UserAgent).HasMaxLength(1024).HasColumnType("character varying(1024)");
            entity.Property(item => item.CorrelationId).HasMaxLength(100).HasColumnType("character varying(100)").IsRequired();
            entity.Property(item => item.OccurredAtUtc).HasColumnType("timestamp with time zone");
            entity.Property(item => item.CreatedAtUtc).HasColumnType("timestamp with time zone");
            entity.Property(item => item.UpdatedAtUtc).HasColumnType("timestamp with time zone");
            entity.HasIndex(item => item.ActorUserId);
            entity.HasIndex(item => item.OccurredAtUtc);
        });

        modelBuilder.Entity<Permission>(entity =>
        {
            entity.ToTable("permissions");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnType("uuid").ValueGeneratedNever();
            entity.Property(item => item.Name).HasMaxLength(140).HasColumnType("character varying(140)").IsRequired();
            entity.Property(item => item.Description).HasMaxLength(300).HasColumnType("character varying(300)");
            entity.Property(item => item.CreatedAtUtc).HasColumnType("timestamp with time zone");
            entity.Property(item => item.UpdatedAtUtc).HasColumnType("timestamp with time zone");
            entity.HasIndex(item => item.Name).IsUnique();
        });

        modelBuilder.Entity<OperationalRecord>(entity =>
        {
            entity.ToTable("operational_records");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnType("uuid").ValueGeneratedNever();
            entity.Property(item => item.Kind).HasMaxLength(24).HasColumnType("character varying(24)").IsRequired();
            entity.Property(item => item.Name).HasMaxLength(240).HasColumnType("character varying(240)").IsRequired();
            entity.Property(item => item.Payload).HasColumnType("jsonb").IsRequired();
            entity.Property(item => item.CreatedAtUtc).HasColumnType("timestamp with time zone");
            entity.Property(item => item.UpdatedAtUtc).HasColumnType("timestamp with time zone");
            entity.HasIndex(item => new { item.Kind, item.Name });
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.ToTable("roles");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnType("uuid").ValueGeneratedNever();
            entity.Property(item => item.Name).HasMaxLength(100).HasColumnType("character varying(100)").IsRequired();
            entity.Property(item => item.Description).HasMaxLength(300).HasColumnType("character varying(300)");
            entity.Property(item => item.CreatedAtUtc).HasColumnType("timestamp with time zone");
            entity.Property(item => item.UpdatedAtUtc).HasColumnType("timestamp with time zone");
            entity.HasIndex(item => item.Name).IsUnique();
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnType("uuid").ValueGeneratedNever();
            entity.Property(item => item.Name).HasMaxLength(160).HasColumnType("character varying(160)").IsRequired();
            entity.Property(item => item.Email).HasMaxLength(320).HasColumnType("character varying(320)").IsRequired();
            entity.Property(item => item.NormalizedEmail).HasMaxLength(320).HasColumnType("character varying(320)").IsRequired();
            entity.Property(item => item.PasswordHash).HasMaxLength(512).HasColumnType("character varying(512)").IsRequired();
            entity.Property(item => item.IsActive).HasColumnType("boolean");
            entity.Property(item => item.CreatedAtUtc).HasColumnType("timestamp with time zone");
            entity.Property(item => item.UpdatedAtUtc).HasColumnType("timestamp with time zone");
            entity.HasIndex(item => item.NormalizedEmail).IsUnique();
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.ToTable("refresh_tokens");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnType("uuid").ValueGeneratedNever();
            entity.Property(item => item.UserId).HasColumnType("uuid");
            entity.Property(item => item.FamilyId).HasColumnType("uuid");
            entity.Property(item => item.TokenHash).HasMaxLength(64).HasColumnType("character varying(64)").IsRequired();
            entity.Property(item => item.CsrfTokenHash).HasMaxLength(64).HasColumnType("character varying(64)").IsRequired();
            entity.Property(item => item.ExpiresAtUtc).HasColumnType("timestamp with time zone");
            entity.Property(item => item.RevokedAtUtc).HasColumnType("timestamp with time zone");
            entity.Property(item => item.CreatedByIp).HasMaxLength(64).HasColumnType("character varying(64)");
            entity.Property(item => item.RevokedByIp).HasMaxLength(64).HasColumnType("character varying(64)");
            entity.Property(item => item.ReplacedByTokenId).HasColumnType("uuid");
            entity.Property(item => item.RevocationReason).HasMaxLength(200).HasColumnType("character varying(200)");
            entity.Property(item => item.Version).HasColumnType("integer").IsConcurrencyToken();
            entity.Property(item => item.CreatedAtUtc).HasColumnType("timestamp with time zone");
            entity.Property(item => item.UpdatedAtUtc).HasColumnType("timestamp with time zone");
            entity.HasIndex(item => item.TokenHash).IsUnique();
            entity.HasIndex(item => item.FamilyId);
            entity.HasIndex(item => new { item.UserId, item.ExpiresAtUtc });
        });

        modelBuilder.Entity<UserRole>(entity =>
        {
            entity.ToTable("user_roles");
            entity.HasKey(item => new { item.UserId, item.RoleId });
            entity.Property(item => item.UserId).HasColumnType("uuid");
            entity.Property(item => item.RoleId).HasColumnType("uuid");
            entity.HasIndex(item => item.RoleId);
        });

        modelBuilder.Entity<RolePermission>(entity =>
        {
            entity.ToTable("role_permissions");
            entity.HasKey(item => new { item.RoleId, item.PermissionId });
            entity.Property(item => item.RoleId).HasColumnType("uuid");
            entity.Property(item => item.PermissionId).HasColumnType("uuid");
            entity.HasIndex(item => item.PermissionId);
        });

        modelBuilder.Entity<RefreshToken>()
            .HasOne(item => item.User)
            .WithMany(item => item.RefreshTokens)
            .HasForeignKey(item => item.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<UserRole>()
            .HasOne(item => item.User)
            .WithMany(item => item.UserRoles)
            .HasForeignKey(item => item.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<UserRole>()
            .HasOne(item => item.Role)
            .WithMany(item => item.UserRoles)
            .HasForeignKey(item => item.RoleId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<RolePermission>()
            .HasOne(item => item.Role)
            .WithMany(item => item.RolePermissions)
            .HasForeignKey(item => item.RoleId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<RolePermission>()
            .HasOne(item => item.Permission)
            .WithMany(item => item.RolePermissions)
            .HasForeignKey(item => item.PermissionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
