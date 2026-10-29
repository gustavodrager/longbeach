using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UnifiedCustomers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CustomerId",
                table: "bar_tabs",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerId",
                table: "bar_sales",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "customer_operations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ResponseJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_operations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "customers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Phone = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    Origin = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Incomplete = table.Column<bool>(type: "boolean", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    MergedIntoId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customers", x => x.Id);
                    table.CheckConstraint("CK_customer_status", "\"Status\" IN ('Ativo','Inativo') AND \"Version\" > 0 AND (\"MergedIntoId\" IS NULL OR \"MergedIntoId\" <> \"Id\")");
                    table.ForeignKey(
                        name: "FK_customers_customers_MergedIntoId",
                        column: x => x.MergedIntoId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_customers_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customer_merges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    TransferredUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Undone = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_merges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customer_merges_customers_SourceId",
                        column: x => x.SourceId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_customer_merges_customers_TargetId",
                        column: x => x.TargetId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_customer_merges_users_TransferredUserId",
                        column: x => x.TransferredUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customer_source_links",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_source_links", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customer_source_links_customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customer_source_changes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LinkId = table.Column<Guid>(type: "uuid", nullable: false),
                    BeforeCustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    AfterCustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_source_changes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customer_source_changes_customer_source_links_LinkId",
                        column: x => x.LinkId,
                        principalTable: "customer_source_links",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_customer_source_changes_customers_AfterCustomerId",
                        column: x => x.AfterCustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_customer_source_changes_customers_BeforeCustomerId",
                        column: x => x.BeforeCustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_bar_tabs_CustomerId",
                table: "bar_tabs",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_sales_CustomerId",
                table: "bar_sales",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_merges_SourceId",
                table: "customer_merges",
                column: "SourceId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_merges_TargetId",
                table: "customer_merges",
                column: "TargetId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_merges_TransferredUserId",
                table: "customer_merges",
                column: "TransferredUserId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_source_changes_AfterCustomerId",
                table: "customer_source_changes",
                column: "AfterCustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_source_changes_BeforeCustomerId",
                table: "customer_source_changes",
                column: "BeforeCustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_source_changes_LinkId",
                table: "customer_source_changes",
                column: "LinkId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_source_links_CustomerId",
                table: "customer_source_links",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_source_links_Kind_SourceId_ParentId",
                table: "customer_source_links",
                columns: new[] { "Kind", "SourceId", "ParentId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_customers_MergedIntoId",
                table: "customers",
                column: "MergedIntoId");

            migrationBuilder.CreateIndex(
                name: "IX_customers_Name",
                table: "customers",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_customers_Phone",
                table: "customers",
                column: "Phone");

            migrationBuilder.CreateIndex(
                name: "IX_customers_UserId",
                table: "customers",
                column: "UserId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_bar_sales_customers_CustomerId",
                table: "bar_sales",
                column: "CustomerId",
                principalTable: "customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_bar_tabs_customers_CustomerId",
                table: "bar_tabs",
                column: "CustomerId",
                principalTable: "customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
            // Catalogue additions only: preserve all existing identities and grants.
            migrationBuilder.Sql("""
                INSERT INTO permissions ("Id", "Name", "Description", "CreatedAtUtc", "UpdatedAtUtc")
                SELECT value.id::uuid, value.name, NULL, CURRENT_TIMESTAMP, NULL
                FROM (VALUES
                    ('a995ef53-b1f3-4f7e-b886-67c75e968f01', 'customers:read'),
                    ('a995ef53-b1f3-4f7e-b886-67c75e968f02', 'customers:write'),
                    ('a995ef53-b1f3-4f7e-b886-67c75e968f03', 'customers:merge')
                ) AS value(id, name)
                ON CONFLICT ("Name") DO NOTHING;
                INSERT INTO role_permissions ("RoleId", "PermissionId")
                SELECT role."Id", permission."Id"
                FROM roles role CROSS JOIN permissions permission
                WHERE permission."Name" IN ('customers:read', 'customers:write', 'customers:merge')
                    AND (role."Name" IN ('Owner', 'Administrator', 'Manager')
                        OR role."Name" = 'Operations' AND permission."Name" IN ('customers:read', 'customers:write'))
                ON CONFLICT ("RoleId", "PermissionId") DO NOTHING;
                CREATE FUNCTION reject_customer_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'Customer history is immutable' USING ERRCODE = '55000'; END; $$;
                CREATE TRIGGER customer_operations_immutable BEFORE UPDATE OR DELETE ON customer_operations
                    FOR EACH ROW EXECUTE FUNCTION reject_customer_history_mutation();
                CREATE TRIGGER customer_source_changes_immutable BEFORE UPDATE OR DELETE ON customer_source_changes
                    FOR EACH ROW EXECUTE FUNCTION reject_customer_history_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM customers) OR EXISTS (SELECT 1 FROM customer_source_links)
                        OR EXISTS (SELECT 1 FROM customer_source_changes) OR EXISTS (SELECT 1 FROM customer_operations)
                        OR EXISTS (SELECT 1 FROM customer_merges) OR EXISTS (SELECT 1 FROM bar_tabs WHERE "CustomerId" IS NOT NULL)
                        OR EXISTS (SELECT 1 FROM bar_sales WHERE "CustomerId" IS NOT NULL)
                    THEN RAISE EXCEPTION 'Customer registry is already in use; publish a compatible version instead of dropping identity/history.' USING ERRCODE = '55000';
                    END IF;
                END; $$;
                """);
            migrationBuilder.Sql("DROP FUNCTION reject_customer_history_mutation() CASCADE;");
            // Permission catalogue entries/grants are retained; never revoke identities on rollback.
            migrationBuilder.DropForeignKey(
                name: "FK_bar_sales_customers_CustomerId",
                table: "bar_sales");

            migrationBuilder.DropForeignKey(
                name: "FK_bar_tabs_customers_CustomerId",
                table: "bar_tabs");

            migrationBuilder.DropTable(
                name: "customer_merges");

            migrationBuilder.DropTable(
                name: "customer_operations");

            migrationBuilder.DropTable(
                name: "customer_source_changes");

            migrationBuilder.DropTable(
                name: "customer_source_links");

            migrationBuilder.DropTable(
                name: "customers");

            migrationBuilder.DropIndex(
                name: "IX_bar_tabs_CustomerId",
                table: "bar_tabs");

            migrationBuilder.DropIndex(
                name: "IX_bar_sales_CustomerId",
                table: "bar_sales");

            migrationBuilder.DropColumn(
                name: "CustomerId",
                table: "bar_tabs");

            migrationBuilder.DropColumn(
                name: "CustomerId",
                table: "bar_sales");
        }
    }
}
