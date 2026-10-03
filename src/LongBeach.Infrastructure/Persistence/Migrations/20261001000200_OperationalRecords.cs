using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations;

[DbContext(typeof(LongBeachDbContext))]
[Migration("20261001000200_OperationalRecords")]
public partial class OperationalRecords : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "operational_records",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                Kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                Name = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                Payload = table.Column<string>(type: "jsonb", nullable: false),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table => table.PrimaryKey("PK_operational_records", item => item.Id));
        migrationBuilder.CreateIndex("IX_operational_records_Kind_Name", "operational_records", new[] { "Kind", "Name" });
    }

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable("operational_records");

    protected override void BuildTargetModel(Microsoft.EntityFrameworkCore.ModelBuilder modelBuilder) =>
        LongBeachDbContextModelSnapshot.ConfigureModel(modelBuilder);
}
