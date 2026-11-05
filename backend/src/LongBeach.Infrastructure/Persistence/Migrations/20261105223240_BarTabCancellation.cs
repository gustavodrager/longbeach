using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BarTabCancellation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(name: "CK_bar_tabs", table: "bar_tabs");
            migrationBuilder.AddCheckConstraint(name: "CK_bar_tabs", table: "bar_tabs",
                sql: "\"Discount\" >= 0 AND \"State\" IN ('Open','Closed','Cancelled') AND \"Mode\" IN ('Tab','Immediate')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $guard$
                BEGIN
                    IF EXISTS (SELECT 1 FROM bar_tabs WHERE "State" = 'Cancelled') THEN
                        RAISE EXCEPTION 'Cancelled tabs exist. Preserve cancellation history and do not downgrade to an API that does not recognize the terminal state.';
                    END IF;
                END $guard$;
                """);
            migrationBuilder.DropCheckConstraint(name: "CK_bar_tabs", table: "bar_tabs");
            migrationBuilder.AddCheckConstraint(name: "CK_bar_tabs", table: "bar_tabs",
                sql: "\"Discount\" >= 0 AND \"State\" IN ('Open','Closed') AND \"Mode\" IN ('Tab','Immediate')");
        }
    }
}
