using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BarProductSaleAvailability : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AvailableForSale",
                table: "bar_products",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $guard$
                BEGIN
                    IF EXISTS (SELECT 1 FROM bar_products WHERE NOT "AvailableForSale") THEN
                        RAISE EXCEPTION 'Sale visibility is in use. Preserve product availability; do not downgrade to an API that can sell hidden products.';
                    END IF;
                END $guard$;
                """);
            migrationBuilder.DropColumn(
                name: "AvailableForSale",
                table: "bar_products");
        }
    }
}
