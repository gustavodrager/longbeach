using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations;

[DbContext(typeof(LongBeachDbContext))]
[Migration("20261001000100_InitialCreate")]
public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "audit_logs",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                ActorUserId = table.Column<Guid>(type: "uuid", nullable: true),
                Action = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                Resource = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                ResourceId = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                MetadataJson = table.Column<string>(type: "jsonb", nullable: false),
                IpAddress = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                UserAgent = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                CorrelationId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table => table.PrimaryKey("PK_audit_logs", item => item.Id));

        migrationBuilder.CreateTable(
            name: "permissions",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                Name = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                Description = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table => table.PrimaryKey("PK_permissions", item => item.Id));

        migrationBuilder.CreateTable(
            name: "roles",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                Description = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table => table.PrimaryKey("PK_roles", item => item.Id));

        migrationBuilder.CreateTable(
            name: "users",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                NormalizedEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                PasswordHash = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                IsActive = table.Column<bool>(type: "boolean", nullable: false),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table => table.PrimaryKey("PK_users", item => item.Id));

        migrationBuilder.CreateTable(
            name: "role_permissions",
            columns: table => new
            {
                RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                PermissionId = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_role_permissions", item => new { item.RoleId, item.PermissionId });
                table.ForeignKey(
                    name: "FK_role_permissions_permissions_PermissionId",
                    column: item => item.PermissionId,
                    principalTable: "permissions",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_role_permissions_roles_RoleId",
                    column: item => item.RoleId,
                    principalTable: "roles",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "refresh_tokens",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                UserId = table.Column<Guid>(type: "uuid", nullable: false),
                FamilyId = table.Column<Guid>(type: "uuid", nullable: false),
                TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                CsrfTokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                CreatedByIp = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                RevokedByIp = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                ReplacedByTokenId = table.Column<Guid>(type: "uuid", nullable: true),
                RevocationReason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                Version = table.Column<int>(type: "integer", nullable: false),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_refresh_tokens", item => item.Id);
                table.ForeignKey(
                    name: "FK_refresh_tokens_users_UserId",
                    column: item => item.UserId,
                    principalTable: "users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "user_roles",
            columns: table => new
            {
                UserId = table.Column<Guid>(type: "uuid", nullable: false),
                RoleId = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_user_roles", item => new { item.UserId, item.RoleId });
                table.ForeignKey(
                    name: "FK_user_roles_roles_RoleId",
                    column: item => item.RoleId,
                    principalTable: "roles",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_user_roles_users_UserId",
                    column: item => item.UserId,
                    principalTable: "users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex("IX_audit_logs_ActorUserId", "audit_logs", "ActorUserId");
        migrationBuilder.CreateIndex("IX_audit_logs_OccurredAtUtc", "audit_logs", "OccurredAtUtc");
        migrationBuilder.CreateIndex("IX_permissions_Name", "permissions", "Name", unique: true);
        migrationBuilder.CreateIndex("IX_refresh_tokens_TokenHash", "refresh_tokens", "TokenHash", unique: true);
        migrationBuilder.CreateIndex("IX_refresh_tokens_FamilyId", "refresh_tokens", "FamilyId");
        migrationBuilder.CreateIndex("IX_refresh_tokens_UserId_ExpiresAtUtc", "refresh_tokens", new[] { "UserId", "ExpiresAtUtc" });
        migrationBuilder.CreateIndex("IX_role_permissions_PermissionId", "role_permissions", "PermissionId");
        migrationBuilder.CreateIndex("IX_roles_Name", "roles", "Name", unique: true);
        migrationBuilder.CreateIndex("IX_user_roles_RoleId", "user_roles", "RoleId");
        migrationBuilder.CreateIndex("IX_users_NormalizedEmail", "users", "NormalizedEmail", unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("audit_logs");
        migrationBuilder.DropTable("refresh_tokens");
        migrationBuilder.DropTable("role_permissions");
        migrationBuilder.DropTable("user_roles");
        migrationBuilder.DropTable("permissions");
        migrationBuilder.DropTable("roles");
        migrationBuilder.DropTable("users");
    }

    protected override void BuildTargetModel(Microsoft.EntityFrameworkCore.ModelBuilder modelBuilder) =>
        LongBeachDbContextModelSnapshot.ConfigureModel(modelBuilder);
}
