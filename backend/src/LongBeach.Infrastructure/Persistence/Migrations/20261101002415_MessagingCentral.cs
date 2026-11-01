using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MessagingCentral : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "messaging_attachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Data = table.Column<byte[]>(type: "bytea", nullable: false),
                    FileName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    UploadedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messaging_attachments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "messaging_bridge_events",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Payload = table.Column<string>(type: "jsonb", nullable: false),
                    Processed = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messaging_bridge_events", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "messaging_conversations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExternalId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Phone = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    Name = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    IdentityVerified = table.Column<bool>(type: "boolean", nullable: false),
                    ConsentForReminders = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Mode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    AssignedUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UnreadCount = table.Column<int>(type: "integer", nullable: false),
                    LastMessage = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: true),
                    LastMessageAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messaging_conversations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_messaging_conversations_customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_messaging_conversations_users_AssignedUserId",
                        column: x => x.AssignedUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "messaging_faqs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Question = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Answer = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Approved = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messaging_faqs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "messaging_operations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ResourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messaging_operations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "messaging_settings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BotEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    ClassRemindersEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    RentalRemindersEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    ReminderTime = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messaging_settings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "messaging_aliases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExternalId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messaging_aliases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_messaging_aliases_messaging_conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalTable: "messaging_conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "messaging_messages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Direction = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    Origin = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    Text = table.Column<string>(type: "character varying(16000)", maxLength: 16000, nullable: false),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ExternalId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    AuthorUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    AuthorName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    AttachmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ContextKind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    ContextId = table.Column<Guid>(type: "uuid", nullable: true),
                    ContextDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ScheduledAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    FailureReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsHistory = table.Column<bool>(type: "boolean", nullable: false),
                    AutomationProcessed = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    AttemptedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messaging_messages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_messaging_messages_messaging_attachments_AttachmentId",
                        column: x => x.AttachmentId,
                        principalTable: "messaging_attachments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_messaging_messages_messaging_conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalTable: "messaging_conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_messaging_aliases_ConversationId",
                table: "messaging_aliases",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_messaging_aliases_ExternalId",
                table: "messaging_aliases",
                column: "ExternalId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_messaging_bridge_events_EventId",
                table: "messaging_bridge_events",
                column: "EventId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_messaging_conversations_AssignedUserId",
                table: "messaging_conversations",
                column: "AssignedUserId");

            migrationBuilder.CreateIndex(
                name: "IX_messaging_conversations_CustomerId",
                table: "messaging_conversations",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_messaging_conversations_ExternalId",
                table: "messaging_conversations",
                column: "ExternalId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_messaging_conversations_Phone",
                table: "messaging_conversations",
                column: "Phone");

            migrationBuilder.CreateIndex(
                name: "IX_messaging_conversations_Status_LastMessageAtUtc",
                table: "messaging_conversations",
                columns: new[] { "Status", "LastMessageAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_messaging_messages_AttachmentId",
                table: "messaging_messages",
                column: "AttachmentId");

            migrationBuilder.CreateIndex(
                name: "IX_messaging_messages_ConversationId_ExternalId",
                table: "messaging_messages",
                columns: new[] { "ConversationId", "ExternalId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_messaging_messages_ConversationId_OccurredAtUtc_Id",
                table: "messaging_messages",
                columns: new[] { "ConversationId", "OccurredAtUtc", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_messaging_messages_OperationId",
                table: "messaging_messages",
                column: "OperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_messaging_messages_State_ScheduledAtUtc",
                table: "messaging_messages",
                columns: new[] { "State", "ScheduledAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM messaging_conversations)
                        OR EXISTS (SELECT 1 FROM messaging_messages)
                        OR EXISTS (SELECT 1 FROM messaging_attachments)
                        OR EXISTS (SELECT 1 FROM messaging_aliases)
                        OR EXISTS (SELECT 1 FROM messaging_bridge_events)
                        OR EXISTS (SELECT 1 FROM messaging_operations)
                        OR EXISTS (SELECT 1 FROM messaging_settings)
                        OR EXISTS (SELECT 1 FROM messaging_faqs)
                    THEN RAISE EXCEPTION 'Communication history exists. Preserve messaging data and roll back the application artifact instead.';
                    END IF;
                END $$;
                """);
            migrationBuilder.DropTable(
                name: "messaging_aliases");

            migrationBuilder.DropTable(
                name: "messaging_bridge_events");

            migrationBuilder.DropTable(
                name: "messaging_faqs");

            migrationBuilder.DropTable(
                name: "messaging_messages");

            migrationBuilder.DropTable(
                name: "messaging_operations");

            migrationBuilder.DropTable(
                name: "messaging_settings");

            migrationBuilder.DropTable(
                name: "messaging_attachments");

            migrationBuilder.DropTable(
                name: "messaging_conversations");
        }
    }
}
