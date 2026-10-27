using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TabObservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "bar_tabs",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "bar_tab_items",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
            => throw new NotSupportedException("Reverta o aplicativo preservando as observações já registradas.");
    }
}
