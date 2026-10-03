using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace LongBeach.Infrastructure.Persistence.Migrations;
[DbContext(typeof(LongBeachDbContext))]
[Migration("20261003160000_BarLedgerIntegrity")]
public sealed class BarLedgerIntegrity : Migration
{
    private static readonly string[] Tables = ["stock_movements","cash_movements","cash_closings","bar_sale_items","bar_sale_discounts","purchase_receipts","payment_reconciliations","payment_webhook_inbox","payment_provider_transactions","bar_events"];
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE FUNCTION bar_reject_history_update() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Immutable Bar history: record a reversal' USING ERRCODE = '55000'; END; $$;
            """);
        foreach(var table in Tables) migrationBuilder.Sql($"CREATE TRIGGER bar_immutable_history BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION bar_reject_history_update();");
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        foreach(var table in Tables) migrationBuilder.Sql($"DROP TRIGGER IF EXISTS bar_immutable_history ON {table};");
        migrationBuilder.Sql("DROP FUNCTION IF EXISTS bar_reject_history_update();");
    }
}
