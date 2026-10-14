using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ReceivedInvoices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TaxId",
                table: "suppliers",
                type: "character varying(14)",
                maxLength: 14,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "received_invoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AccessKey = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: false),
                    RecipientTaxId = table.Column<string>(type: "character varying(14)", maxLength: 14, nullable: false),
                    Number = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    SupplierName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    IssuedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Total = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    FileName = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    OriginalXml = table.Column<byte[]>(type: "bytea", nullable: false),
                    ContentHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DataJson = table.Column<string>(type: "jsonb", nullable: false),
                    ImportedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    PurchaseId = table.Column<Guid>(type: "uuid", nullable: true),
                    PurchaseRequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Purpose = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "Unclassified"),
                    ReviewVersion = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_received_invoices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_received_invoices_purchases_PurchaseId",
                        column: x => x.PurchaseId,
                        principalTable: "purchases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_suppliers_TaxId",
                table: "suppliers",
                column: "TaxId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_received_invoices_AccessKey",
                table: "received_invoices",
                column: "AccessKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_received_invoices_PurchaseId",
                table: "received_invoices",
                column: "PurchaseId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_received_invoices_RecipientTaxId_CreatedAtUtc",
                table: "received_invoices",
                columns: new[] { "RecipientTaxId", "CreatedAtUtc" });
            migrationBuilder.Sql("""
                CREATE FUNCTION invoice_protect_document() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Fiscal original is immutable' USING ERRCODE = '55000'; END IF;
                    IF (to_jsonb(NEW) - 'PurchaseId' - 'PurchaseRequestHash' - 'UpdatedAtUtc' - 'Purpose' - 'ReviewVersion') IS DISTINCT FROM
                       (to_jsonb(OLD) - 'PurchaseId' - 'PurchaseRequestHash' - 'UpdatedAtUtc' - 'Purpose' - 'ReviewVersion')
                       OR (OLD."PurchaseId" IS NOT NULL AND (NEW."PurchaseId" IS DISTINCT FROM OLD."PurchaseId" OR NEW."PurchaseRequestHash" IS DISTINCT FROM OLD."PurchaseRequestHash" OR NEW."Purpose" IS DISTINCT FROM OLD."Purpose"))
                    OR (NEW."PurchaseId" IS NOT NULL AND NEW."Purpose" <> 'Bar')
                    THEN RAISE EXCEPTION 'Fiscal original is immutable' USING ERRCODE = '55000'; END IF;
                    RETURN NEW;
                END; $$;
                CREATE TRIGGER invoice_immutable_document BEFORE UPDATE OR DELETE ON received_invoices
                FOR EACH ROW EXECUTE FUNCTION invoice_protect_document();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER invoice_immutable_document ON received_invoices; DROP FUNCTION invoice_protect_document();");
            migrationBuilder.DropTable(
                name: "received_invoices");

            migrationBuilder.DropIndex(
                name: "IX_suppliers_TaxId",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "TaxId",
                table: "suppliers");
        }
    }
}
