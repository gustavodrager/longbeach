using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BarTerminalManual : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TerminalType",
                table: "bar_tab_payments",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);
            migrationBuilder.Sql("""
ALTER TABLE bar_tab_payments DROP CONSTRAINT "CK_bar_tab_payments";
ALTER TABLE bar_tab_payments ADD CONSTRAINT "CK_bar_tab_payments" CHECK ("Amount" > 0 AND "Tendered" >= 0 AND "Refunded" BETWEEN 0 AND "Amount" AND "Fee" BETWEEN 0 AND "Amount" AND "State" IN ('Pending','Approved','Declined') AND "Method" IN ('Cash','CardManual','Pix','CreditCard','TerminalManual') AND ("Method" <> 'Cash' OR "SessionId" IS NOT NULL ) AND (("Method" = 'TerminalManual' AND "TerminalType" IS NOT NULL AND "TerminalType" IN ('Debit','Credit','Pix') AND "ActorId" IS NOT NULL) OR ("Method" <> 'TerminalManual' AND "TerminalType" IS NULL)));
""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
ALTER TABLE bar_tab_payments DROP CONSTRAINT "CK_bar_tab_payments";
ALTER TABLE bar_tab_payments ADD CONSTRAINT "CK_bar_tab_payments" CHECK ("Amount" > 0 AND "Tendered" >= 0 AND "Refunded" BETWEEN 0 AND "Amount" AND "Fee" BETWEEN 0 AND "Amount" AND "State" IN ('Pending','Approved','Declined') AND "Method" IN ('Cash','CardManual','Pix','CreditCard') AND ("Method" <> 'Cash' OR "SessionId" IS NOT NULL));
""");
            migrationBuilder.DropColumn(
                name: "TerminalType",
                table: "bar_tab_payments");
        }
    }
}
