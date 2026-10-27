using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BarCatalogMetadataDiscounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "DiscountAmount",
                table: "bar_sales",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "Barcode",
                table: "bar_products",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageUrl",
                table: "bar_products",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "MainSupplierId",
                table: "bar_products",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "bar_sale_discounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_sale_discounts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bar_sale_discounts_bar_sales_SaleId",
                        column: x => x.SaleId,
                        principalTable: "bar_sales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_bar_products_MainSupplierId",
                table: "bar_products",
                column: "MainSupplierId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_sale_discounts_SaleId",
                table: "bar_sale_discounts",
                column: "SaleId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_bar_products_suppliers_MainSupplierId",
                table: "bar_products",
                column: "MainSupplierId",
                principalTable: "suppliers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_bar_products_suppliers_MainSupplierId",
                table: "bar_products");

            migrationBuilder.DropTable(
                name: "bar_sale_discounts");

            migrationBuilder.DropIndex(
                name: "IX_bar_products_MainSupplierId",
                table: "bar_products");

            migrationBuilder.DropColumn(
                name: "DiscountAmount",
                table: "bar_sales");

            migrationBuilder.DropColumn(
                name: "Barcode",
                table: "bar_products");

            migrationBuilder.DropColumn(
                name: "ImageUrl",
                table: "bar_products");

            migrationBuilder.DropColumn(
                name: "MainSupplierId",
                table: "bar_products");
        }
    }
}
