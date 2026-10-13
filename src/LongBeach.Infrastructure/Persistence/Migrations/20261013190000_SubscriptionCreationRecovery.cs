using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations;

public partial class SubscriptionCreationRecovery : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>("CreationAttempted", "billing_subscriptions", type: "boolean", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<bool>("UpdateExistingCustomerCard", "billing_subscriptions", type: "boolean", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<string>("FailureReason", "billing_subscriptions", type: "character varying(300)", maxLength: 300, nullable: true);
        // Previous releases did not record dispatch separately. Do not infer that
        // unbound legacy attempts were never sent, nor replay them with new cards.
        migrationBuilder.Sql("UPDATE billing_subscriptions SET \"CreationAttempted\" = TRUE");
        migrationBuilder.DropIndex("IX_billing_subscriptions_SourceKind_SourceId", "billing_subscriptions");
        migrationBuilder.CreateIndex("IX_billing_subscriptions_SourceKind_SourceId", "billing_subscriptions", new[] { "SourceKind", "SourceId" }, unique: true, filter: "\"State\" NOT IN ('CANCELED','EXPIRED','Rejected')");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => throw new NotSupportedException("Preserve o histórico de rejeições e autorizações; reverta por correção progressiva.");
}
