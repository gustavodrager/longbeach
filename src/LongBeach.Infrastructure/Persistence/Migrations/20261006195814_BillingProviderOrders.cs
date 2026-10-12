using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BillingProviderOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "billing_orders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProviderId = table.Column<string>(type: "text", nullable: false),
                    Reference = table.Column<string>(type: "text", nullable: false),
                    Kind = table.Column<string>(type: "text", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_orders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_billing_orders_billing_payments_PaymentId",
                        column: x => x.PaymentId,
                        principalTable: "billing_payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_billing_orders_PaymentId",
                table: "billing_orders",
                column: "PaymentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_orders_ProviderId",
                table: "billing_orders",
                column: "ProviderId",
                unique: true);
            migrationBuilder.Sql("""
                CREATE TRIGGER billing_order_immutable BEFORE UPDATE OR DELETE ON billing_orders FOR EACH ROW EXECUTE FUNCTION bar_reject_history_update();
                CREATE TRIGGER billing_settlement_immutable BEFORE UPDATE OR DELETE ON billing_settlements FOR EACH ROW EXECUTE FUNCTION bar_reject_history_update();
                ALTER TABLE billing_payments ADD CONSTRAINT "CK_billing_payments" CHECK ("Amount">0 AND "Refunded" BETWEEN 0 AND "Amount" AND "State" IN ('Pending','Approved','Canceled','Refunded') AND "Method" IN ('Pix','CreditCard','Subscription'));
                ALTER TABLE billing_refunds ADD CONSTRAINT "CK_billing_refunds" CHECK ("Amount">0 AND "Previous">=0 AND "State" IN ('Pending','Confirmed'));
                ALTER TABLE billing_settlements ADD CONSTRAINT "CK_billing_settlements" CHECK ("Gross">0 AND "Fee">=0 AND "Net">=0 AND "Gross"="Fee"+"Net");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER billing_settlement_immutable ON billing_settlements;
                ALTER TABLE billing_payments DROP CONSTRAINT "CK_billing_payments";
                ALTER TABLE billing_refunds DROP CONSTRAINT "CK_billing_refunds";
                ALTER TABLE billing_settlements DROP CONSTRAINT "CK_billing_settlements";
                """);
            migrationBuilder.DropTable(
                name: "billing_orders");
        }
    }
}
