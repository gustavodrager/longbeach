using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace LongBeach.Infrastructure.Persistence.Migrations;

[DbContext(typeof(LongBeachDbContext))]
[Migration("20261020010000_C6Banking")]
public sealed class C6Banking : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE c6_finance_documents (
            id uuid PRIMARY KEY, environment varchar(16) NOT NULL, account_id varchar(80) NOT NULL,
            kind varchar(20) NOT NULL, period_from date NOT NULL, period_through date NOT NULL,
            source_sha256 char(64) NOT NULL, payload jsonb NOT NULL, collected_at_utc timestamptz NOT NULL,
            CONSTRAINT uq_c6_finance_document UNIQUE(environment,account_id,kind,period_from,period_through,source_sha256),
            CONSTRAINT ck_c6_finance_environment CHECK(environment IN ('Sandbox','Production')),
            CONSTRAINT ck_c6_finance_period CHECK(period_through>=period_from)
        );
        CREATE TABLE c6_statement_entries (
            id uuid PRIMARY KEY, environment varchar(16) NOT NULL, account_id varchar(80) NOT NULL,
            entry_id varchar(200) NOT NULL, booked_date date NOT NULL, amount_cents bigint NOT NULL,
            title varchar(500) NOT NULL, description varchar(2000) NOT NULL, operation_type varchar(20) NOT NULL,
            transaction_type varchar(100) NOT NULL, end_to_end_id varchar(100) NULL,
            document_id uuid NOT NULL REFERENCES c6_finance_documents(id) ON DELETE RESTRICT,
            CONSTRAINT uq_c6_statement_entry UNIQUE(environment,account_id,entry_id)
        );
        CREATE INDEX ix_c6_statement_date ON c6_statement_entries(environment,account_id,booked_date DESC,entry_id);
        CREATE TABLE c6_balance_snapshots (
            id uuid PRIMARY KEY, environment varchar(16) NOT NULL, account_id varchar(80) NOT NULL,
            amount_cents bigint NOT NULL, source_date date NOT NULL, collected_at_utc timestamptz NOT NULL,
            document_id uuid NOT NULL REFERENCES c6_finance_documents(id) ON DELETE RESTRICT,
            CONSTRAINT uq_c6_balance_read UNIQUE(environment,account_id,collected_at_utc)
        );
        CREATE INDEX ix_c6_balance_latest ON c6_balance_snapshots(environment,account_id,collected_at_utc DESC);
        CREATE TABLE c6_sync_state (
            environment varchar(16) NOT NULL, account_id varchar(80) NOT NULL,
            complete_through date NULL, last_success_utc timestamptz NULL, last_attempt_utc timestamptz NULL,
            failure_code varchar(80) NULL, failure_count integer NOT NULL DEFAULT 0,
            PRIMARY KEY(environment,account_id)
        );
        """);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        throw new NotSupportedException("Reverta o aplicativo; preserve documentos e histórico C6.");
}
