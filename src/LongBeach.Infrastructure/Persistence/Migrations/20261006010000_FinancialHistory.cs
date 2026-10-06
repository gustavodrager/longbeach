using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace LongBeach.Infrastructure.Persistence.Migrations;

[DbContext(typeof(LongBeachDbContext))]
[Migration("20261006010000_FinancialHistory")]
public sealed class FinancialHistory : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE financial_observations (
            id uuid PRIMARY KEY, batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
            source_sha256 char(64) NOT NULL, source_cell varchar(160) NOT NULL,
            series varchar(80) NOT NULL, metric varchar(80) NOT NULL, state varchar(80) NOT NULL,
            period_start date NOT NULL, period_end date NOT NULL, amount_cents bigint NOT NULL,
            payload jsonb NOT NULL, created_at_utc timestamptz NOT NULL,
            CONSTRAINT uq_financial_observation_source UNIQUE(source_sha256, source_cell),
            CONSTRAINT ck_financial_period CHECK(period_end >= period_start)
        );
        CREATE INDEX ix_financial_observations_period ON financial_observations(period_start,period_end,series,metric);
        CREATE TABLE provider_sync_state (
            provider varchar(80) PRIMARY KEY, complete_through date NULL, last_success_utc timestamptz NULL,
            last_attempt_utc timestamptz NULL, failure_code varchar(80) NULL, failure_count integer NOT NULL DEFAULT 0
        );
        CREATE TABLE provider_documents (
            id uuid PRIMARY KEY, provider varchar(80) NOT NULL, movement varchar(40) NOT NULL,
            movement_date date NOT NULL, page_number integer NOT NULL, source_sha256 char(64) NOT NULL,
            payload jsonb NOT NULL, validated boolean NOT NULL, fetched_at_utc timestamptz NOT NULL,
            CONSTRAINT uq_provider_document UNIQUE(provider,movement,movement_date,page_number,source_sha256)
        );
        CREATE INDEX ix_provider_documents_latest ON provider_documents(provider,movement_date,movement,fetched_at_utc DESC);
        """);
    protected override void Down(MigrationBuilder migrationBuilder) => throw new NotSupportedException("Reverta somente a versão do aplicativo; o histórico financeiro deve ser preservado.");
}
