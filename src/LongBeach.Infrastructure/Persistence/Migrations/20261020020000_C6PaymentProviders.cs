using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class C6PaymentProviders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_billing_payments_ChargeId",
                table: "billing_payments");

            migrationBuilder.DropIndex(
                name: "IX_billing_payments_ProviderId",
                table: "billing_payments");

            migrationBuilder.DropIndex(
                name: "IX_billing_orders_ProviderId",
                table: "billing_orders");

            migrationBuilder.AddColumn<string>(
                name: "Provider",
                table: "payment_provider_transactions",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "PagBank");

            migrationBuilder.AddColumn<string>(
                name: "Provider",
                table: "billing_subscriptions",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "PagBank");

            migrationBuilder.AddColumn<string>(
                name: "PixEndToEndId",
                table: "billing_payments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Provider",
                table: "billing_payments",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "PagBank");

            migrationBuilder.AddColumn<string>(
                name: "ProviderAccountId",
                table: "billing_payments",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderEnvironment",
                table: "billing_payments",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Provider",
                table: "billing_orders",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "PagBank");

            migrationBuilder.AddColumn<string>(
                name: "ProviderAccountId",
                table: "billing_orders",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderEnvironment",
                table: "billing_orders",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentProvider",
                table: "bar_tab_payments",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentProvider",
                table: "bar_payments",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            // Only remote Bar payments belong to PagBank; cash and manual card receipts have no API provider.
            migrationBuilder.Sql("""
                UPDATE bar_payments SET "PaymentProvider"='PagBank' WHERE "Method" IN ('Pix','CreditCard');
                UPDATE bar_tab_payments SET "PaymentProvider"='PagBank' WHERE "Method" IN ('Pix','CreditCard');
                """);

            migrationBuilder.CreateIndex(
                name: "IX_billing_payments_ChargeId",
                table: "billing_payments",
                column: "ChargeId",
                unique: true,
                filter: "\"Provider\" = 'PagBank'");

            migrationBuilder.CreateIndex(
                name: "IX_billing_payments_Provider_ProviderEnvironment_ProviderAcco~1",
                table: "billing_payments",
                columns: new[] { "Provider", "ProviderEnvironment", "ProviderAccountId", "ProviderId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_payments_Provider_ProviderEnvironment_ProviderAccou~",
                table: "billing_payments",
                columns: new[] { "Provider", "ProviderEnvironment", "ProviderAccountId", "PixEndToEndId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_payments_ProviderId",
                table: "billing_payments",
                column: "ProviderId",
                unique: true,
                filter: "\"Provider\" = 'PagBank'");

            migrationBuilder.CreateIndex(
                name: "IX_billing_orders_Provider_ProviderEnvironment_ProviderAccount~",
                table: "billing_orders",
                columns: new[] { "Provider", "ProviderEnvironment", "ProviderAccountId", "ProviderId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_orders_ProviderId",
                table: "billing_orders",
                column: "ProviderId",
                unique: true,
                filter: "\"Provider\" = 'PagBank'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder) =>
            throw new NotSupportedException("Reverta o aplicativo com C6 desabilitado; preserve a identidade bancária e o histórico dos pagamentos.");
    }
}
