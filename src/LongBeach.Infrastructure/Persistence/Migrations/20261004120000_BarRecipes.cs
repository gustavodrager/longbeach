using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LongBeach.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BarRecipes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RecipeId",
                table: "bar_tab_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "bar_recipe_versions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    YieldQuantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_recipe_versions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bar_recipe_versions_bar_products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "bar_products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "bar_recipe_ingredients",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipeId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    Unit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ConversionFactor = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    StockUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StockQuantity = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_recipe_ingredients", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bar_recipe_ingredients_bar_products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "bar_products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_bar_recipe_ingredients_bar_recipe_versions_RecipeId",
                        column: x => x.RecipeId,
                        principalTable: "bar_recipe_versions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "bar_tab_ingredients",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipeId = table.Column<Guid>(type: "uuid", nullable: false),
                    IngredientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    StockUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    UnitCost = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bar_tab_ingredients", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bar_tab_ingredients_bar_products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "bar_products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_bar_tab_ingredients_bar_recipe_ingredients_IngredientId",
                        column: x => x.IngredientId,
                        principalTable: "bar_recipe_ingredients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_bar_tab_ingredients_bar_recipe_versions_RecipeId",
                        column: x => x.RecipeId,
                        principalTable: "bar_recipe_versions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_bar_tab_ingredients_bar_tab_items_ItemId",
                        column: x => x.ItemId,
                        principalTable: "bar_tab_items",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_items_RecipeId",
                table: "bar_tab_items",
                column: "RecipeId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_recipe_ingredients_ProductId",
                table: "bar_recipe_ingredients",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_recipe_ingredients_RecipeId_ProductId",
                table: "bar_recipe_ingredients",
                columns: new[] { "RecipeId", "ProductId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bar_recipe_versions_ProductId_Version",
                table: "bar_recipe_versions",
                columns: new[] { "ProductId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_ingredients_IngredientId",
                table: "bar_tab_ingredients",
                column: "IngredientId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_ingredients_ItemId_ProductId",
                table: "bar_tab_ingredients",
                columns: new[] { "ItemId", "ProductId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_ingredients_ProductId",
                table: "bar_tab_ingredients",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_bar_tab_ingredients_RecipeId",
                table: "bar_tab_ingredients",
                column: "RecipeId");

            migrationBuilder.AddForeignKey(
                name: "FK_bar_tab_items_bar_recipe_versions_RecipeId",
                table: "bar_tab_items",
                column: "RecipeId",
                principalTable: "bar_recipe_versions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
            migrationBuilder.Sql("""
                ALTER TABLE bar_recipe_versions ADD CONSTRAINT "CK_bar_recipe_versions" CHECK ("Version" > 0 AND "YieldQuantity" > 0);
                ALTER TABLE bar_recipe_ingredients ADD CONSTRAINT "CK_bar_recipe_ingredients" CHECK ("Quantity" > 0 AND "ConversionFactor" > 0 AND "StockQuantity" > 0 AND "Unit" IN ('Sale','Purchase'));
                ALTER TABLE bar_tab_ingredients ADD CONSTRAINT "CK_bar_tab_ingredients" CHECK ("Quantity" > 0 AND "UnitCost" >= 0);
                CREATE TRIGGER bar_immutable_history BEFORE UPDATE OR DELETE ON bar_recipe_versions FOR EACH ROW EXECUTE FUNCTION bar_reject_history_update();
                CREATE TRIGGER bar_immutable_history BEFORE UPDATE OR DELETE ON bar_recipe_ingredients FOR EACH ROW EXECUTE FUNCTION bar_reject_history_update();
                CREATE TRIGGER bar_immutable_history BEFORE UPDATE OR DELETE ON bar_tab_ingredients FOR EACH ROW EXECUTE FUNCTION bar_reject_history_update();
                CREATE OR REPLACE FUNCTION bar_preserve_tab_item_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Consumption history cannot be deleted' USING ERRCODE = '55000'; END IF;
                    IF ROW(OLD."Id",OLD."TabId",OLD."ProductId",OLD."Name",OLD."Quantity",OLD."UnitPrice",OLD."Total",OLD."ControlsStock",OLD."Prepared",OLD."Source",OLD."ActorId",OLD."CreatedAtUtc")
                       IS DISTINCT FROM ROW(NEW."Id",NEW."TabId",NEW."ProductId",NEW."Name",NEW."Quantity",NEW."UnitPrice",NEW."Total",NEW."ControlsStock",NEW."Prepared",NEW."Source",NEW."ActorId",NEW."CreatedAtUtc") THEN
                        RAISE EXCEPTION 'Consumption snapshot is immutable: record a correction' USING ERRCODE = '55000';
                    END IF;
                    IF ROW(OLD."RecipeId",OLD."UnitCost") IS DISTINCT FROM ROW(NEW."RecipeId",NEW."UnitCost") AND NOT
                       (OLD."State" = 'Requested' AND NEW."State" = 'Accepted' AND OLD."RecipeId" IS NULL AND NEW."RecipeId" IS NOT NULL) THEN
                        RAISE EXCEPTION 'Recipe and cost snapshot can only be assigned during first acceptance' USING ERRCODE = '55000';
                    END IF;
                    RETURN NEW;
                END; $$;
                CREATE FUNCTION bar_validate_ingredient_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM bar_tab_items t JOIN bar_recipe_ingredients i ON i."Id" = NEW."IngredientId" JOIN bar_recipe_versions r ON r."Id" = i."RecipeId"
                        WHERE t."Id" = NEW."ItemId" AND t."RecipeId" = NEW."RecipeId" AND i."RecipeId" = NEW."RecipeId" AND i."ProductId" = NEW."ProductId" AND r."ProductId" = t."ProductId"
                        AND NEW."Quantity" = CEIL(i."StockQuantity" / r."YieldQuantity" * t."Quantity" * 1000) / 1000) THEN
                        RAISE EXCEPTION 'Ingredient snapshot does not match accepted recipe' USING ERRCODE = '23514';
                    END IF;
                    RETURN NEW;
                END; $$;
                CREATE CONSTRAINT TRIGGER bar_validate_ingredient_snapshot AFTER INSERT ON bar_tab_ingredients DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bar_validate_ingredient_snapshot();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS bar_validate_ingredient_snapshot ON bar_tab_ingredients; DROP FUNCTION IF EXISTS bar_validate_ingredient_snapshot();");
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION bar_preserve_tab_item_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Consumption history cannot be deleted' USING ERRCODE = '55000'; END IF;
                    IF ROW(OLD."Id",OLD."TabId",OLD."ProductId",OLD."Name",OLD."Quantity",OLD."UnitPrice",OLD."UnitCost",OLD."Total",OLD."ControlsStock",OLD."Prepared",OLD."Source",OLD."ActorId",OLD."CreatedAtUtc")
                       IS DISTINCT FROM ROW(NEW."Id",NEW."TabId",NEW."ProductId",NEW."Name",NEW."Quantity",NEW."UnitPrice",NEW."UnitCost",NEW."Total",NEW."ControlsStock",NEW."Prepared",NEW."Source",NEW."ActorId",NEW."CreatedAtUtc") THEN
                        RAISE EXCEPTION 'Consumption snapshot is immutable: record a correction' USING ERRCODE = '55000';
                    END IF;
                    RETURN NEW;
                END; $$;
                """);
            migrationBuilder.DropForeignKey(
                name: "FK_bar_tab_items_bar_recipe_versions_RecipeId",
                table: "bar_tab_items");

            migrationBuilder.DropTable(
                name: "bar_tab_ingredients");

            migrationBuilder.DropTable(
                name: "bar_recipe_ingredients");

            migrationBuilder.DropTable(
                name: "bar_recipe_versions");

            migrationBuilder.DropIndex(
                name: "IX_bar_tab_items_RecipeId",
                table: "bar_tab_items");

            migrationBuilder.DropColumn(
                name: "RecipeId",
                table: "bar_tab_items");
        }
    }
}
