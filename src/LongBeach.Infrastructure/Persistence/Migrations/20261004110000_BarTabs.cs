using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BarTabs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Do not silently close historical tills. Fail before modifying the schema.
            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM cash_sessions WHERE "State" IN ('Open','Reopened') GROUP BY "OpenedBy" HAVING COUNT(*) > 1) THEN
                        RAISE EXCEPTION 'Multiple open cash sessions for an actor: reconcile and close explicitly before BarTabs migration';
                    END IF;
                END $$;
                """);
            migrationBuilder.CreateSequence(
                name: "bar_tab_numbers");

            migrationBuilder.AddColumn<bool>(
                name: "Prepared",
                table: "bar_products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "bar_tab_operations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ResponseJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_tab_operations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "bar_tabs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Discount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Number = table.Column<long>(type: "bigint", nullable: false, defaultValueSql: "nextval('bar_tab_numbers')"),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Mode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ClosedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_tabs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bar_tabs_stock_locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "stock_locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "bar_tab_access",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TabId = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Revoked = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_tab_access", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bar_tab_access_bar_tabs_TabId",
                        column: x => x.TabId,
                        principalTable: "bar_tabs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "bar_tab_history",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TabId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: true),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_tab_history", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bar_tab_history_bar_tabs_TabId",
                        column: x => x.TabId,
                        principalTable: "bar_tabs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "bar_tab_items",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TabId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    UnitCost = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    Total = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    ControlsStock = table.Column<bool>(type: "boolean", nullable: false),
                    Prepared = table.Column<bool>(type: "boolean", nullable: false),
                    Source = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: true),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    AcceptedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    FulfilledAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_tab_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bar_tab_items_bar_products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "bar_products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_bar_tab_items_bar_tabs_TabId",
                        column: x => x.TabId,
                        principalTable: "bar_tabs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "bar_tab_payments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TabId = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Method = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Tendered = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Authorization = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: true),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ProviderId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PixText = table.Column<string>(type: "text", nullable: true),
                    QrImageUrl = table.Column<string>(type: "text", nullable: true),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ConfirmedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Refunded = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Fee = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    FeeConfirmedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_tab_payments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bar_tab_payments_bar_tabs_TabId",
                        column: x => x.TabId,
                        principalTable: "bar_tabs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_bar_tab_payments_cash_sessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "cash_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "bar_tab_refunds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TabId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ConfirmedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_tab_refunds", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bar_tab_refunds_bar_tab_payments_PaymentId",
                        column: x => x.PaymentId,
                        principalTable: "bar_tab_payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_bar_tab_refunds_bar_tabs_TabId",
                        column: x => x.TabId,
                        principalTable: "bar_tabs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_cash_sessions_OpenedBy",
                table: "cash_sessions",
                column: "OpenedBy",
                unique: true,
                filter: "\"State\" IN ('Open','Reopened')");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_access_OperationId",
                table: "bar_tab_access",
                column: "OperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_access_TabId",
                table: "bar_tab_access",
                column: "TabId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_access_TokenHash",
                table: "bar_tab_access",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_history_TabId_CreatedAtUtc",
                table: "bar_tab_history",
                columns: new[] { "TabId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_items_AcceptedAtUtc",
                table: "bar_tab_items",
                column: "AcceptedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_items_ProductId",
                table: "bar_tab_items",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_items_TabId_State",
                table: "bar_tab_items",
                columns: new[] { "TabId", "State" });

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_payments_ConfirmedAtUtc",
                table: "bar_tab_payments",
                column: "ConfirmedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_payments_OperationId",
                table: "bar_tab_payments",
                column: "OperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_payments_ProviderId",
                table: "bar_tab_payments",
                column: "ProviderId",
                unique: true,
                filter: "\"ProviderId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_payments_SessionId",
                table: "bar_tab_payments",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_payments_TabId_State",
                table: "bar_tab_payments",
                columns: new[] { "TabId", "State" });

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_refunds_ConfirmedAtUtc",
                table: "bar_tab_refunds",
                column: "ConfirmedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_refunds_OperationId",
                table: "bar_tab_refunds",
                column: "OperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_refunds_PaymentId",
                table: "bar_tab_refunds",
                column: "PaymentId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_refunds_TabId",
                table: "bar_tab_refunds",
                column: "TabId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tabs_LocationId",
                table: "bar_tabs",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tabs_Number",
                table: "bar_tabs",
                column: "Number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bar_tabs_State_CreatedAtUtc",
                table: "bar_tabs",
                columns: new[] { "State", "CreatedAtUtc" });
            migrationBuilder.Sql("""
                ALTER TABLE bar_tabs ADD CONSTRAINT "CK_bar_tabs" CHECK ("Discount" >= 0 AND "State" IN ('Open','Closed') AND "Mode" IN ('Tab','Immediate'));
                ALTER TABLE bar_tab_items ADD CONSTRAINT "CK_bar_tab_items" CHECK ("Quantity" > 0 AND "UnitPrice" >= 0 AND "Total" >= 0 AND "UnitCost" >= 0 AND "State" IN ('Requested','Accepted','Fulfilled','Rejected','Reversed') AND "Source" IN ('Attendant','Selfservice'));
                ALTER TABLE bar_tab_payments ADD CONSTRAINT "CK_bar_tab_payments" CHECK ("Amount" > 0 AND "Tendered" >= 0 AND "Refunded" BETWEEN 0 AND "Amount" AND "Fee" BETWEEN 0 AND "Amount" AND "State" IN ('Pending','Approved','Declined') AND "Method" IN ('Cash','CardManual','Pix') AND ("Method" <> 'Cash' OR "SessionId" IS NOT NULL));
                ALTER TABLE bar_tab_refunds ADD CONSTRAINT "CK_bar_tab_refunds" CHECK ("Amount" > 0 AND "State" IN ('Pending','Confirmed'));
                CREATE TRIGGER bar_immutable_history BEFORE UPDATE OR DELETE ON bar_tab_operations FOR EACH ROW EXECUTE FUNCTION bar_reject_history_update();
                CREATE TRIGGER bar_immutable_history BEFORE UPDATE OR DELETE ON bar_tab_history FOR EACH ROW EXECUTE FUNCTION bar_reject_history_update();
                CREATE FUNCTION bar_preserve_tab_item_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Consumption history cannot be deleted' USING ERRCODE = '55000'; END IF;
                    IF ROW(OLD."Id",OLD."TabId",OLD."ProductId",OLD."Name",OLD."Quantity",OLD."UnitPrice",OLD."UnitCost",OLD."Total",OLD."ControlsStock",OLD."Prepared",OLD."Source",OLD."ActorId",OLD."CreatedAtUtc")
                       IS DISTINCT FROM ROW(NEW."Id",NEW."TabId",NEW."ProductId",NEW."Name",NEW."Quantity",NEW."UnitPrice",NEW."UnitCost",NEW."Total",NEW."ControlsStock",NEW."Prepared",NEW."Source",NEW."ActorId",NEW."CreatedAtUtc") THEN
                        RAISE EXCEPTION 'Consumption snapshot is immutable: record a correction' USING ERRCODE = '55000';
                    END IF;
                    RETURN NEW;
                END; $$;
                CREATE TRIGGER bar_tab_item_snapshot BEFORE UPDATE OR DELETE ON bar_tab_items FOR EACH ROW EXECUTE FUNCTION bar_preserve_tab_item_snapshot();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS bar_tab_item_snapshot ON bar_tab_items; DROP FUNCTION IF EXISTS bar_preserve_tab_item_snapshot();");
            migrationBuilder.DropTable(
                name: "bar_tab_access");

            migrationBuilder.DropTable(
                name: "bar_tab_history");

            migrationBuilder.DropTable(
                name: "bar_tab_items");

            migrationBuilder.DropTable(
                name: "bar_tab_operations");

            migrationBuilder.DropTable(
                name: "bar_tab_refunds");

            migrationBuilder.DropTable(
                name: "bar_tab_payments");

            migrationBuilder.DropTable(
                name: "bar_tabs");

            migrationBuilder.DropIndex(
                name: "IX_cash_sessions_OpenedBy",
                table: "cash_sessions");

            migrationBuilder.DropColumn(
                name: "Prepared",
                table: "bar_products");

            migrationBuilder.DropSequence(
                name: "bar_tab_numbers");
        }
    }
}
