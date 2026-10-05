using LongBeach.Domain.Auditing;
using LongBeach.Domain.Common;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Persistence;

public sealed class LongBeachDbContext(
    DbContextOptions<LongBeachDbContext> options,
    TimeProvider timeProvider) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<OperationalRecord> OperationalRecords => Set<OperationalRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        BarModel.Configure(modelBuilder);
        StockModel.Configure(modelBuilder);
        CashModel.Configure(modelBuilder);
        SalesModel.Configure(modelBuilder);
        PurchaseModel.Configure(modelBuilder);
        PaymentModel.Configure(modelBuilder);
        TabModel.Configure(modelBuilder);
        RecipeModel.Configure(modelBuilder);
        ConfigureUser(modelBuilder);
        ConfigureRole(modelBuilder);
        ConfigurePermission(modelBuilder);
        ConfigureRefreshToken(modelBuilder);
        ConfigureAuditLog(modelBuilder);
        ConfigureOperationalRecord(modelBuilder);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ProtectBarLedger();
        ApplyTimestamps();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess,
        CancellationToken cancellationToken = default)
    {
        ProtectBarLedger();
        ApplyTimestamps();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void ProtectBarLedger()
    {
        ChangeTracker.DetectChanges();
        foreach(var entry in ChangeTracker.Entries().Where(x=>x.State is EntityState.Modified or EntityState.Deleted))
            if(entry.Entity is LongBeach.Domain.Inventory.StockMovement or LongBeach.Domain.Cash.CashMovement or LongBeach.Domain.Cash.CashClosing
                or LongBeach.Domain.Bar.BarSaleItem or LongBeach.Domain.Bar.BarSaleDiscount or LongBeach.Domain.Purchases.PurchaseReceipt or LongBeach.Domain.Payments.PaymentReconciliation
                or LongBeach.Domain.Payments.PaymentWebhookInbox or LongBeach.Domain.Payments.PaymentProviderTransaction or LongBeach.Domain.Payments.BarEvent
                or LongBeach.Domain.Bar.BarTabOperation or LongBeach.Domain.Bar.BarTabHistory
                or LongBeach.Domain.Bar.BarRecipeVersion or LongBeach.Domain.Bar.BarRecipeIngredient or LongBeach.Domain.Bar.BarTabIngredientSnapshot)
                throw new LongBeach.Domain.Bar.BarRuleException("Registro histórico imutável. Registre uma reversão.");
    }
    private void ApplyTimestamps()
    {
        var now = timeProvider.GetUtcNow();
        foreach (var entry in ChangeTracker.Entries<Entity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.MarkCreated(now);
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.MarkUpdated(now);
            }
        }
    }

    private static void ConfigureUser(ModelBuilder modelBuilder)
    {
        var user = modelBuilder.Entity<User>();
        user.ToTable("users");
        user.HasKey(item => item.Id);
        user.Property(item => item.Id).ValueGeneratedNever();
        user.Property(item => item.Name).HasMaxLength(160).IsRequired();
        user.Property(item => item.Email).HasMaxLength(320).IsRequired();
        user.Property(item => item.NormalizedEmail).HasMaxLength(320).IsRequired();
        user.Property(item => item.PasswordHash).HasMaxLength(512).IsRequired();
        user.HasIndex(item => item.NormalizedEmail).IsUnique();
        user.HasMany(item => item.RefreshTokens)
            .WithOne(item => item.User)
            .HasForeignKey(item => item.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        user.HasMany(item => item.UserRoles)
            .WithOne(item => item.User)
            .HasForeignKey(item => item.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        var userRole = modelBuilder.Entity<UserRole>();
        userRole.ToTable("user_roles");
        userRole.HasKey(item => new { item.UserId, item.RoleId });
    }

    private static void ConfigureRole(ModelBuilder modelBuilder)
    {
        var role = modelBuilder.Entity<Role>();
        role.ToTable("roles");
        role.HasKey(item => item.Id);
        role.Property(item => item.Id).ValueGeneratedNever();
        role.Property(item => item.Name).HasMaxLength(100).IsRequired();
        role.Property(item => item.Description).HasMaxLength(300);
        role.HasIndex(item => item.Name).IsUnique();
        role.HasMany(item => item.RolePermissions)
            .WithOne(item => item.Role)
            .HasForeignKey(item => item.RoleId)
            .OnDelete(DeleteBehavior.Cascade);

        var rolePermission = modelBuilder.Entity<RolePermission>();
        rolePermission.ToTable("role_permissions");
        rolePermission.HasKey(item => new { item.RoleId, item.PermissionId });
    }

    private static void ConfigurePermission(ModelBuilder modelBuilder)
    {
        var permission = modelBuilder.Entity<Permission>();
        permission.ToTable("permissions");
        permission.HasKey(item => item.Id);
        permission.Property(item => item.Id).ValueGeneratedNever();
        permission.Property(item => item.Name).HasMaxLength(140).IsRequired();
        permission.Property(item => item.Description).HasMaxLength(300);
        permission.HasIndex(item => item.Name).IsUnique();
        permission.HasMany(item => item.RolePermissions)
            .WithOne(item => item.Permission)
            .HasForeignKey(item => item.PermissionId)
            .OnDelete(DeleteBehavior.Cascade);
    }

    private static void ConfigureRefreshToken(ModelBuilder modelBuilder)
    {
        var token = modelBuilder.Entity<RefreshToken>();
        token.ToTable("refresh_tokens");
        token.HasKey(item => item.Id);
        token.Property(item => item.Id).ValueGeneratedNever();
        token.Property(item => item.TokenHash).HasMaxLength(64).IsRequired();
        token.Property(item => item.CsrfTokenHash).HasMaxLength(64).IsRequired();
        token.Property(item => item.CreatedByIp).HasMaxLength(64);
        token.Property(item => item.RevokedByIp).HasMaxLength(64);
        token.Property(item => item.RevocationReason).HasMaxLength(200);
        token.HasIndex(item => item.TokenHash).IsUnique();
        token.HasIndex(item => item.FamilyId);
        token.HasIndex(item => new { item.UserId, item.ExpiresAtUtc });
        token.Property(item => item.Version).IsConcurrencyToken();
    }

    private static void ConfigureAuditLog(ModelBuilder modelBuilder)
    {
        var audit = modelBuilder.Entity<AuditLog>();
        audit.ToTable("audit_logs");
        audit.HasKey(item => item.Id);
        audit.Property(item => item.Id).ValueGeneratedNever();
        audit.Property(item => item.Action).HasMaxLength(40).IsRequired();
        audit.Property(item => item.Resource).HasMaxLength(160).IsRequired();
        audit.Property(item => item.ResourceId).HasMaxLength(160);
        audit.Property(item => item.MetadataJson).HasColumnType("jsonb").IsRequired();
        audit.Property(item => item.IpAddress).HasMaxLength(64);
        audit.Property(item => item.UserAgent).HasMaxLength(1024);
        audit.Property(item => item.CorrelationId).HasMaxLength(100).IsRequired();
        audit.HasIndex(item => item.OccurredAtUtc);
        audit.HasIndex(item => item.ActorUserId);
    }

    private static void ConfigureOperationalRecord(ModelBuilder modelBuilder)
    {
        var record = modelBuilder.Entity<OperationalRecord>();
        record.ToTable("operational_records");
        record.HasKey(item => item.Id);
        record.Property(item => item.Id).ValueGeneratedNever();
        record.Property(item => item.Kind).HasMaxLength(24).IsRequired();
        record.Property(item => item.Name).HasMaxLength(240).IsRequired();
        record.Property(item => item.Payload).HasColumnType("jsonb").IsRequired();
        record.HasIndex(item => new { item.Kind, item.Name });
    }
}
