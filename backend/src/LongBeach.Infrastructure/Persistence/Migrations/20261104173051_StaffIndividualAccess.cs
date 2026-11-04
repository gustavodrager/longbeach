using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StaffIndividualAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PhoneLogin",
                table: "users",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresLocalPasswordChange",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "staff_access_operations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_staff_access_operations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_staff_access_operations_operational_records_TeamId",
                        column: x => x.TeamId,
                        principalTable: "operational_records",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_staff_access_operations_users_ActorId",
                        column: x => x.ActorId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "staff_access_types",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Role = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Menus = table.Column<string[]>(type: "text[]", nullable: false),
                    Actions = table.Column<string[]>(type: "text[]", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_staff_access_types", x => x.Id);
                    table.CheckConstraint("CK_staff_access_type", "\"Code\" IN ('bar','professor','atendente','gestor') AND \"Role\" IN ('Manager','Teacher','Operations') AND \"Version\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "staff_memberships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    AccessTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_staff_memberships", x => x.Id);
                    table.CheckConstraint("CK_staff_membership_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_staff_memberships_operational_records_TeamId",
                        column: x => x.TeamId,
                        principalTable: "operational_records",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_staff_memberships_staff_access_types_AccessTypeId",
                        column: x => x.AccessTypeId,
                        principalTable: "staff_access_types",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_staff_memberships_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "staff_access_types",
                columns: new[] { "Id", "Actions", "Code", "CreatedAtUtc", "Menus", "Name", "Role", "UpdatedAtUtc", "Version" },
                values: new object[,]
                {
                    { new Guid("671612c0-e086-4bc1-92ed-000000000001"), new[] { "bar.cash", "bar.orders", "bar.receive", "bar.sell", "bar.tabs" }, "bar", new DateTimeOffset(new DateTime(2026, 11, 4, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), new[] { "bar.cash", "bar.orders", "bar.receive", "bar.sell", "bar.tabs" }, "Bar", "Operations", null, 1 },
                    { new Guid("671612c0-e086-4bc1-92ed-000000000002"), new[] { "teaching.presence" }, "professor", new DateTimeOffset(new DateTime(2026, 11, 4, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), new[] { "teaching.attendance", "teaching.classes", "teaching.today" }, "Professor", "Teacher", null, 1 },
                    { new Guid("671612c0-e086-4bc1-92ed-000000000003"), new[] { "agenda.operate", "agenda.requests.operate", "bar.cash", "bar.orders", "bar.receive", "bar.sell", "bar.tabs", "classes.operate", "customers.operate", "enrollments.operate", "maintenance.operate", "materials.operate", "messaging.operate", "messaging.sends.operate", "presences.operate", "projects.operate", "recurring.operate", "students.operate" }, "atendente", new DateTimeOffset(new DateTime(2026, 11, 4, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), new[] { "agenda", "agenda.requests", "bar.cash", "bar.orders", "bar.receive", "bar.sell", "bar.tabs", "classes", "customers", "enrollments", "maintenance", "materials", "messaging", "messaging.sends", "overview", "presences", "projects", "recurring", "students" }, "Atendente", "Operations", null, 1 },
                    { new Guid("671612c0-e086-4bc1-92ed-000000000004"), new[] { "administration.operate", "agenda.operate", "agenda.requests.operate", "agenda.settings.operate", "bar.cash", "bar.orders", "bar.receive", "bar.refund", "bar.sell", "bar.supervise", "bar.tabs", "classes.operate", "customers.merge", "customers.operate", "enrollments.operate", "finance.operate", "maintenance.operate", "materials.adjust", "materials.operate", "messaging.automation.operate", "messaging.operate", "messaging.sends.operate", "presences.operate", "projects.operate", "recurring.operate", "stock.fiscal", "stock.operate", "students.operate", "teaching.presence" }, "gestor", new DateTimeOffset(new DateTime(2026, 11, 4, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), new[] { "administration", "agenda", "agenda.requests", "agenda.settings", "bar.cash", "bar.orders", "bar.receive", "bar.sell", "bar.tabs", "classes", "customers", "enrollments", "finance", "maintenance", "materials", "messaging", "messaging.automation", "messaging.sends", "overview", "presences", "projects", "recurring", "reports", "stock", "students", "teaching.attendance", "teaching.classes", "teaching.today" }, "Gestor", "Manager", null, 1 }
                });

            migrationBuilder.CreateIndex(
                name: "IX_users_PhoneLogin",
                table: "users",
                column: "PhoneLogin",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_staff_access_operations_ActorId",
                table: "staff_access_operations",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_staff_access_operations_TeamId",
                table: "staff_access_operations",
                column: "TeamId");

            migrationBuilder.CreateIndex(
                name: "IX_staff_access_types_Code",
                table: "staff_access_types",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_staff_memberships_AccessTypeId",
                table: "staff_memberships",
                column: "AccessTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_staff_memberships_TeamId",
                table: "staff_memberships",
                column: "TeamId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_staff_memberships_UserId",
                table: "staff_memberships",
                column: "UserId",
                unique: true);

            migrationBuilder.Sql("""
                DO $$ DECLARE tab text; role_name text; BEGIN
                    FOREACH tab IN ARRAY ARRAY['staff_access_types','staff_memberships','staff_access_operations'] LOOP
                        EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC', current_schema(), tab);
                        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='longbeach_runtime') THEN
                            EXECUTE format('GRANT SELECT, INSERT ON TABLE %I.%I TO longbeach_runtime', current_schema(), tab);
                            IF tab <> 'staff_access_operations' THEN
                                EXECUTE format('GRANT UPDATE ON TABLE %I.%I TO longbeach_runtime', current_schema(), tab);
                            ELSE
                                EXECUTE format('REVOKE UPDATE ON TABLE %I.%I FROM longbeach_runtime', current_schema(), tab);
                            END IF;
                            EXECUTE format('REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM longbeach_runtime', current_schema(), tab);
                        END IF;
                        FOREACH role_name IN ARRAY ARRAY['longbeach_whatsapp_runtime','longbeach_whatsapp_bridge'] LOOP
                            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
                                EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %I', current_schema(), tab, role_name);
                            END IF;
                        END LOOP;
                    END LOOP;
                END $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM staff_memberships) OR EXISTS (SELECT 1 FROM staff_access_operations)
                        OR EXISTS (SELECT 1 FROM users WHERE "PhoneLogin" IS NOT NULL OR "RequiresLocalPasswordChange")
                        OR EXISTS (SELECT 1 FROM staff_access_types WHERE "Version" <> 1)
                    THEN RAISE EXCEPTION 'Staff access is in use. Preserve scoped authorizations, account links and credentials; do not downgrade to broader legacy profiles.';
                    END IF;
                END $$;
                """);
            migrationBuilder.DropTable(
                name: "staff_access_operations");

            migrationBuilder.DropTable(
                name: "staff_memberships");

            migrationBuilder.DropTable(
                name: "staff_access_types");

            migrationBuilder.DropIndex(
                name: "IX_users_PhoneLogin",
                table: "users");

            migrationBuilder.DropColumn(
                name: "PhoneLogin",
                table: "users");

            migrationBuilder.DropColumn(
                name: "RequiresLocalPasswordChange",
                table: "users");
        }
    }
}
