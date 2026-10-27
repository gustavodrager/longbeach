using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ExpenseAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "expense_attachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpenseId = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Content = table.Column<byte[]>(type: "bytea", nullable: false),
                    ContentHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    UploadedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_attachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_expense_attachments_operational_records_ExpenseId",
                        column: x => x.ExpenseId,
                        principalTable: "operational_records",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_expense_attachments_ExpenseId_CreatedAtUtc",
                table: "expense_attachments",
                columns: new[] { "ExpenseId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_expense_attachments_OperationId",
                table: "expense_attachments",
                column: "OperationId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "expense_attachments");
        }
    }
}
