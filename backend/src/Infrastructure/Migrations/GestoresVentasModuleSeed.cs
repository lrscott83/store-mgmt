namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL for the Gestores de ventas module (id 21, feature 125, role 5).
    ///
    /// Catalog rows + Superior (3) / VIP (4) plan assignment + the Owner-level role.
    /// Deliberately NO "StoreModule" and NO "StoreRoleFeature" rows: the module is opt-in and
    /// the product decision is that no existing store receives it by default. When a store
    /// activates the module, the existing generator materializes the OwnerAdmin feature from
    /// <c>StoreRoleFeatures.GestoresVentasAdmin</c>.
    ///
    /// Single source of truth: the EF migration and the VPS script (backend/scripts/38-*.sql).
    /// </summary>
    public static class GestoresVentasModuleSeed
    {
        public const int ModuleId = 21;
        public const int FeatureId = 125;
        public const int RoleId = 5;
        public const int OwnerAdminRoleId = 2;
        public const int SuperiorPlanId = 3;
        public const int VipPlanId = 4;

        public const string UpSql = """
            INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
            VALUES (21, TRUE, 0, TRUE, 'Gestores de ventas', 160, 50, 20, FALSE)
            ON CONFLICT ("Id") DO NOTHING;

            INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
            VALUES (125, TRUE, 'Funcionalidad para gestionar los gestores de ventas y sus comisiones', TRUE, 21, 'Gestores de ventas', 260)
            ON CONFLICT ("Id") DO NOTHING;

            INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
            VALUES (3, 21), (4, 21)
            ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

            INSERT INTO "Role" ("Id", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "UpdatedBy", "UpdatedDate")
            VALUES (5, '00000000-0000-0000-0000-000000000000', NOW(), 'Este Role permitirá acceder a sus pedidos, sus comisiones y al catálogo web de las tiendas de su Owner.', TRUE, 'Gestor de ventas', NULL, NULL)
            ON CONFLICT ("Id") DO NOTHING;

            SELECT setval(
                pg_get_serial_sequence('"Feature"', 'Id'),
                GREATEST(
                    (SELECT MAX("Id") FROM "Feature") + 1,
                    nextval(pg_get_serial_sequence('"Feature"', 'Id'))),
                false);
            SELECT setval(
                pg_get_serial_sequence('"Module"', 'Id'),
                GREATEST(
                    (SELECT MAX("Id") FROM "Module") + 1,
                    nextval(pg_get_serial_sequence('"Module"', 'Id'))),
                false);
            """;

        public const string DownSql = """
            DELETE FROM "StoreRoleFeature" WHERE "FeatureId" = 125;
            DELETE FROM "StoreModule" WHERE "ModuleId" = 21;
            DELETE FROM "StorePlanModule" WHERE "ModuleId" = 21;
            DELETE FROM "Feature" WHERE "Id" = 125;
            DELETE FROM "Module" WHERE "Id" = 21;
            -- Role 5 is Restrict-referenced by UserRole: clear the assignments first.
            DELETE FROM "UserRole" WHERE "RoleId" = 5;
            DELETE FROM "Role" WHERE "Id" = 5;
            """;
    }
}
