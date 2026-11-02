using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ClientIndividualAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CredentialVersion",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "LocalPasswordEnabled",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "CredentialVersion",
                table: "refresh_tokens",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "client_access_challenges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Purpose = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IssuedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerVersion = table.Column<int>(type: "integer", nullable: false),
                    CredentialVersion = table.Column<int>(type: "integer", nullable: true),
                    ConsumedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_client_access_challenges", x => x.Id);
                    table.CheckConstraint("CK_client_access_purpose", "\"Purpose\" IN ('Activation','Recovery') AND \"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_client_access_challenges_customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_client_access_challenges_users_IssuedBy",
                        column: x => x.IssuedBy,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_client_access_challenges_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customer_guardian_access",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsGranted = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_guardian_access", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customer_guardian_access_customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_customer_guardian_access_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_client_access_challenges_CustomerId_Purpose",
                table: "client_access_challenges",
                columns: new[] { "CustomerId", "Purpose" });

            migrationBuilder.CreateIndex(
                name: "IX_client_access_challenges_IssuedBy",
                table: "client_access_challenges",
                column: "IssuedBy");

            migrationBuilder.CreateIndex(
                name: "IX_client_access_challenges_TokenHash",
                table: "client_access_challenges",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_client_access_challenges_UserId",
                table: "client_access_challenges",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_guardian_access_CustomerId_UserId",
                table: "customer_guardian_access",
                columns: new[] { "CustomerId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_customer_guardian_access_UserId",
                table: "customer_guardian_access",
                column: "UserId");

            migrationBuilder.Sql("""
                DO $$ DECLARE tab text; role_name text; BEGIN
                    FOREACH tab IN ARRAY ARRAY['client_access_challenges','customer_guardian_access'] LOOP
                        EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC', current_schema(), tab);
                        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='longbeach_runtime') THEN
                            EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE %I.%I TO longbeach_runtime', current_schema(), tab);
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
                    IF EXISTS (SELECT 1 FROM client_access_challenges)
                        OR EXISTS (SELECT 1 FROM customer_guardian_access)
                        OR EXISTS (SELECT 1 FROM users WHERE "CredentialVersion" <> 0 OR NOT "LocalPasswordEnabled")
                    THEN RAISE EXCEPTION 'Client access is in use. Preserve credentials, challenges and guardian authorizations; do not downgrade the schema.';
                    END IF;
                END $$;
                """);
            migrationBuilder.DropTable(
                name: "client_access_challenges");

            migrationBuilder.DropTable(
                name: "customer_guardian_access");

            migrationBuilder.DropColumn(
                name: "CredentialVersion",
                table: "users");

            migrationBuilder.DropColumn(
                name: "LocalPasswordEnabled",
                table: "users");

            migrationBuilder.DropColumn(
                name: "CredentialVersion",
                table: "refresh_tokens");
        }
    }
}
