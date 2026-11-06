using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations;

public partial class BarSalesWithoutStock : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(name: "CK_stock_balance", table: "stock_balances");
        migrationBuilder.AddCheckConstraint(name: "CK_stock_balance", table: "stock_balances",
            sql: "\"Quantity\" >= -99999999 AND \"Reserved\" >= 0");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $guard$
            BEGIN
                IF EXISTS (SELECT 1 FROM stock_balances WHERE "Quantity" < "Reserved") THEN
                    RAISE EXCEPTION 'Sales or reservations exceed recorded stock. Reconcile deficits before downgrading.';
                END IF;
            END $guard$;
            """);
        migrationBuilder.DropCheckConstraint(name: "CK_stock_balance", table: "stock_balances");
        migrationBuilder.AddCheckConstraint(name: "CK_stock_balance", table: "stock_balances",
            sql: "\"Quantity\" >= \"Reserved\" AND \"Reserved\" >= 0");
    }
}
