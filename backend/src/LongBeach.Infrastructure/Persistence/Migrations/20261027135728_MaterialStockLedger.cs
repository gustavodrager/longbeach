using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MaterialStockLedger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "material_movements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MaterialId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpectedVersion = table.Column<int>(type: "integer", nullable: false),
                    Kind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    RequestedQuantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    Before = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    After = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    Unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Location = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Destination = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_material_movements", x => x.Id);
                    table.CheckConstraint("CK_material_movement", "\"Before\" >= 0 AND \"After\" >= 0 AND \"After\" = \"Before\" + \"Quantity\" AND \"Quantity\" <> 0");
                    table.ForeignKey(
                        name: "FK_material_movements_operational_records_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "operational_records",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_material_movements_MaterialId_CreatedAtUtc",
                table: "material_movements",
                columns: new[] { "MaterialId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_material_movements_MaterialId_ExpectedVersion",
                table: "material_movements",
                columns: new[] { "MaterialId", "ExpectedVersion" },
                unique: true);
            // Only new receipts are appendable; existing JSON and balances are deliberately untouched.
            migrationBuilder.Sql("""
                CREATE FUNCTION material_reject_history_update() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'Immutable material history: record a correction' USING ERRCODE = '55000'; END; $$;
                CREATE TRIGGER material_immutable_history BEFORE UPDATE OR DELETE ON material_movements
                FOR EACH ROW EXECUTE FUNCTION material_reject_history_update();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "material_movements");
            migrationBuilder.Sql("DROP FUNCTION material_reject_history_update();");
        }
    }
}
