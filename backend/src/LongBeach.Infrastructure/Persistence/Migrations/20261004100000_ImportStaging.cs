using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LongBeach.Infrastructure.Persistence.Migrations;

[DbContext(typeof(LongBeachDbContext))]
[Migration("20261004100000_ImportStaging")]
public sealed class ImportStaging : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE IF NOT EXISTS import_batches (
            id uuid PRIMARY KEY,
            source_name varchar(240) NOT NULL,
            source_sha256 char(64) NOT NULL,
            status varchar(24) NOT NULL,
            row_count integer NOT NULL,
            created_by uuid NULL,
            created_at_utc timestamptz NOT NULL,
            CONSTRAINT uq_import_batches_source_hash UNIQUE (source_name, source_sha256)
        );
        CREATE TABLE IF NOT EXISTS import_rows (
            id uuid PRIMARY KEY,
            batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
            source_sheet varchar(160) NOT NULL,
            source_row integer NOT NULL,
            record_type varchar(48) NOT NULL,
            external_id varchar(160) NULL,
            payload jsonb NOT NULL,
            review_status varchar(24) NOT NULL,
            CONSTRAINT uq_import_rows_source_row UNIQUE (batch_id, source_sheet, source_row)
        );
        CREATE INDEX IF NOT EXISTS ix_import_rows_batch_type ON import_rows (batch_id, record_type);
        """);

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Keep staged source data on rollback; these tables are intentionally retained.
    }
}
