using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UnifiedBilling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE bar_tab_payments DROP CONSTRAINT "CK_bar_tab_payments";
                ALTER TABLE bar_tab_payments ADD CONSTRAINT "CK_bar_tab_payments" CHECK ("Amount" > 0 AND "Tendered" >= 0 AND "Refunded" BETWEEN 0 AND "Amount" AND "Fee" BETWEEN 0 AND "Amount" AND "State" IN ('Pending','Approved','Declined') AND "Method" IN ('Cash','CardManual','Pix','CreditCard') AND ("Method" <> 'Cash' OR "SessionId" IS NOT NULL));
                """);

            migrationBuilder.CreateTable(
                name: "billing_accounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssignedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_accounts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_billing_accounts_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "billing_payments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Method = table.Column<string>(type: "text", nullable: false),
                    State = table.Column<string>(type: "text", nullable: false),
                    ProviderId = table.Column<string>(type: "text", nullable: true),
                    ChargeId = table.Column<string>(type: "text", nullable: true),
                    PixText = table.Column<string>(type: "text", nullable: true),
                    QrImageUrl = table.Column<string>(type: "text", nullable: true),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PaidAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Refunded = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_payments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_billing_payments_billing_accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "billing_accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "billing_settlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExternalId = table.Column<string>(type: "text", nullable: false),
                    Gross = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Fee = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Net = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_settlements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_billing_settlements_billing_accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "billing_accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "billing_subscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceKind = table.Column<string>(type: "text", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    FirstDue = table.Column<DateOnly>(type: "date", nullable: false),
                    ConsentAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    State = table.Column<string>(type: "text", nullable: false),
                    ProviderId = table.Column<string>(type: "text", nullable: true),
                    PlanId = table.Column<string>(type: "text", nullable: true),
                    CancelOperationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_subscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_billing_subscriptions_billing_accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "billing_accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "billing_refunds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Previous = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    State = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_refunds", x => x.Id);
                    table.ForeignKey(
                        name: "FK_billing_refunds_billing_payments_PaymentId",
                        column: x => x.PaymentId,
                        principalTable: "billing_payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_billing_accounts_Kind_SourceId",
                table: "billing_accounts",
                columns: new[] { "Kind", "SourceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_accounts_UserId",
                table: "billing_accounts",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_billing_payments_AccountId",
                table: "billing_payments",
                column: "AccountId",
                unique: true,
                filter: "\"State\" = 'Pending'");

            migrationBuilder.CreateIndex(
                name: "IX_billing_payments_ChargeId",
                table: "billing_payments",
                column: "ChargeId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_payments_OperationId",
                table: "billing_payments",
                column: "OperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_payments_ProviderId",
                table: "billing_payments",
                column: "ProviderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_refunds_OperationId",
                table: "billing_refunds",
                column: "OperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_refunds_PaymentId",
                table: "billing_refunds",
                column: "PaymentId",
                unique: true,
                filter: "\"State\" = 'Pending'");

            migrationBuilder.CreateIndex(
                name: "IX_billing_settlements_AccountId",
                table: "billing_settlements",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_billing_settlements_ExternalId",
                table: "billing_settlements",
                column: "ExternalId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_settlements_PaymentId",
                table: "billing_settlements",
                column: "PaymentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_subscriptions_AccountId",
                table: "billing_subscriptions",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_billing_subscriptions_OperationId",
                table: "billing_subscriptions",
                column: "OperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_subscriptions_ProviderId",
                table: "billing_subscriptions",
                column: "ProviderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_subscriptions_SourceKind_SourceId",
                table: "billing_subscriptions",
                columns: new[] { "SourceKind", "SourceId" },
                unique: true,
                filter: "\"State\" NOT IN ('CANCELED','EXPIRED')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Do not remove CreditCard from the existing ledger constraint: historical receipts remain readable.

            migrationBuilder.DropTable(
                name: "billing_refunds");

            migrationBuilder.DropTable(
                name: "billing_settlements");

            migrationBuilder.DropTable(
                name: "billing_subscriptions");

            migrationBuilder.DropTable(
                name: "billing_payments");

            migrationBuilder.DropTable(
                name: "billing_accounts");
        }
    }
}
