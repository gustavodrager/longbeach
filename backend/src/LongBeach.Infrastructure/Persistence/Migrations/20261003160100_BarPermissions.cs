using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace LongBeach.Infrastructure.Persistence.Migrations;
[DbContext(typeof(LongBeachDbContext))]
[Migration("20261003160100_BarPermissions")]
public sealed class BarPermissions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO permissions ("Id", "Name", "Description", "CreatedAtUtc") VALUES
            ('1d122263-9e4b-537c-a49f-0f9be06ae873', 'BarOperator', '', CURRENT_TIMESTAMP),
            ('eef94dae-3574-5e48-9698-41f55ea2f76b', 'BarSupervisor', '', CURRENT_TIMESTAMP),
            ('8664da84-10b6-5703-82d1-080580189e4f', 'BarFinance', '', CURRENT_TIMESTAMP),
            ('5f3becd6-6350-5333-af29-265bfbd73fe1', 'bar:stock:output', '', CURRENT_TIMESTAMP),
            ('4eb91cd9-c45a-5099-8d57-413d113232da', 'bar:stock:read', '', CURRENT_TIMESTAMP),
            ('9fa45d69-1d36-5841-811d-ea0703b84597', 'bar:stock:manage', '', CURRENT_TIMESTAMP),
            ('c4ab544c-c8f9-517b-ae0b-b8bd771424ca', 'bar:cash:operate', '', CURRENT_TIMESTAMP),
            ('91deb713-294f-542a-b450-b84cda7989a5', 'bar:supervise', '', CURRENT_TIMESTAMP),
            ('73eb0b29-6ee9-545e-a802-0e0d8b418f44', 'bar:sales:read', '', CURRENT_TIMESTAMP),
            ('0c12e64e-e50c-50e3-8503-8b19c351352f', 'bar:sales:operate', '', CURRENT_TIMESTAMP),
            ('ec7383d7-1dde-5402-98ee-d3ee7503710f', 'bar:finance:read', '', CURRENT_TIMESTAMP),
            ('fb0c2b45-d95e-5474-9e67-4bb5003b13ae', 'bar:purchases:manage', '', CURRENT_TIMESTAMP),
            ('24d20995-a1be-591a-bcd5-ba378a5ad627', 'bar:payments:reconcile', '', CURRENT_TIMESTAMP),
            ('7619f6a3-2737-5bd2-8bdf-38f7149eae0a', 'bar:catalog:read', '', CURRENT_TIMESTAMP),
            ('ab508c22-d1d3-5ecb-977f-11c555fd7e7f', 'bar:catalog:write', '', CURRENT_TIMESTAMP)
            ,
            ('201a06cc-bae7-52cf-b79a-e837d9d285c4', 'bar:refund:approve', '', CURRENT_TIMESTAMP)
            ON CONFLICT ("Name") DO NOTHING;
            INSERT INTO roles ("Id", "Name", "Description", "CreatedAtUtc") VALUES
            ('e61cf8d6-25ff-5840-a3f5-4e84de8f77fa', 'BarOperator', '', CURRENT_TIMESTAMP),
            ('120ac3c5-e23b-5e05-81e6-e4086cf34985', 'BarSupervisor', '', CURRENT_TIMESTAMP),
            ('60a8e314-b262-5981-a9fb-c4aba175f481', 'StockManager', '', CURRENT_TIMESTAMP),
            ('6a6c5535-ddc0-5d2e-9861-bdcdb9f7a71f', 'BarFinance', '', CURRENT_TIMESTAMP)
            ON CONFLICT ("Name") DO NOTHING;
            INSERT INTO role_permissions ("RoleId", "PermissionId") SELECT r."Id", p."Id" FROM roles r CROSS JOIN permissions p WHERE r."Name" = 'BarOperator' AND p."Name" IN ('bar:catalog:read','bar:stock:read','bar:stock:output','bar:cash:operate','bar:sales:read','bar:sales:operate') ON CONFLICT DO NOTHING;
            INSERT INTO role_permissions ("RoleId", "PermissionId") SELECT r."Id", p."Id" FROM roles r CROSS JOIN permissions p WHERE r."Name" = 'BarSupervisor' AND p."Name" IN ('bar:catalog:read','bar:stock:read','bar:stock:output','bar:stock:manage','bar:cash:operate','bar:sales:read','bar:sales:operate','bar:supervise','bar:refund:approve') ON CONFLICT DO NOTHING;
            INSERT INTO role_permissions ("RoleId", "PermissionId") SELECT r."Id", p."Id" FROM roles r CROSS JOIN permissions p WHERE r."Name" = 'StockManager' AND p."Name" IN ('bar:catalog:read','bar:catalog:write','bar:stock:read','bar:stock:manage','bar:stock:output','bar:purchases:manage') ON CONFLICT DO NOTHING;
            INSERT INTO role_permissions ("RoleId", "PermissionId") SELECT r."Id", p."Id" FROM roles r CROSS JOIN permissions p WHERE r."Name" = 'BarFinance' AND p."Name" IN ('bar:catalog:read','bar:stock:read','bar:sales:read','bar:finance:read','bar:payments:reconcile','bar:refund:approve') ON CONFLICT DO NOTHING;
            INSERT INTO role_permissions ("RoleId", "PermissionId") SELECT r."Id", p."Id" FROM roles r CROSS JOIN permissions p WHERE r."Name" = 'Owner' AND p."Name" IN ('BarOperator','BarSupervisor','BarFinance','bar:stock:output','bar:stock:read','bar:stock:manage','bar:cash:operate','bar:supervise','bar:sales:read','bar:sales:operate','bar:finance:read','bar:purchases:manage','bar:payments:reconcile','bar:catalog:read','bar:catalog:write','bar:refund:approve') ON CONFLICT DO NOTHING;
            INSERT INTO role_permissions ("RoleId", "PermissionId") SELECT r."Id", p."Id" FROM roles r CROSS JOIN permissions p WHERE r."Name" = 'Administrator' AND p."Name" IN ('BarOperator','BarSupervisor','BarFinance','bar:stock:output','bar:stock:read','bar:stock:manage','bar:cash:operate','bar:supervise','bar:sales:read','bar:sales:operate','bar:finance:read','bar:purchases:manage','bar:payments:reconcile','bar:catalog:read','bar:catalog:write','bar:refund:approve') ON CONFLICT DO NOTHING;
            INSERT INTO role_permissions ("RoleId", "PermissionId") SELECT r."Id", p."Id" FROM roles r CROSS JOIN permissions p WHERE r."Name" = 'Manager' AND p."Name" IN ('BarOperator','BarSupervisor','BarFinance','bar:stock:output','bar:stock:read','bar:stock:manage','bar:cash:operate','bar:supervise','bar:sales:read','bar:sales:operate','bar:finance:read','bar:purchases:manage','bar:payments:reconcile','bar:catalog:read','bar:catalog:write','bar:refund:approve') ON CONFLICT DO NOTHING;
            INSERT INTO role_permissions ("RoleId", "PermissionId") SELECT r."Id", p."Id" FROM roles r CROSS JOIN permissions p WHERE r."Name" = 'Operations' AND p."Name" IN ('bar:catalog:read','bar:stock:read','bar:stock:output','bar:cash:operate','bar:sales:read','bar:sales:operate') ON CONFLICT DO NOTHING;
            """);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Role definitions are retained so existing user assignments remain valid.
        migrationBuilder.Sql("""
            DELETE FROM role_permissions WHERE "PermissionId" IN (SELECT "Id" FROM permissions WHERE "Name" IN ('BarOperator','BarSupervisor','BarFinance','bar:stock:output','bar:stock:read','bar:stock:manage','bar:cash:operate','bar:supervise','bar:sales:read','bar:sales:operate','bar:finance:read','bar:purchases:manage','bar:payments:reconcile','bar:refund:approve','bar:catalog:read','bar:catalog:write'));
            DELETE FROM permissions WHERE "Name" IN ('BarOperator','BarSupervisor','BarFinance','bar:stock:output','bar:stock:read','bar:stock:manage','bar:cash:operate','bar:supervise','bar:sales:read','bar:sales:operate','bar:finance:read','bar:purchases:manage','bar:payments:reconcile','bar:refund:approve','bar:catalog:read','bar:catalog:write');
            """);
    }
}
