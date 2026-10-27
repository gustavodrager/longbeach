using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BarPaymentTendered : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Tendered",
                table: "bar_payments",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "Tendered",
                table: "bar_events",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Tendered",
                table: "bar_payments");

            migrationBuilder.DropColumn(
                name: "Tendered",
                table: "bar_events");
        }
    }
}
