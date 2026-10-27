namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL for the ONAT module (id 22, feature 126): Vector Fiscal y Configuraciones
    /// fiscales del Owner.
    ///
    /// Module 22 is catalogued with <c>IsActive = FALSE</c> ON PURPOSE: the feature ships dark and
    /// the owner flips that single flag later. Every StoreModule row it creates is ACTIVE, so the
    /// flip lights the module up at once for the stores on Superior (3) and VIP (4).
    ///
    /// Plans are SELF-CONTAINED (owner decision 2026-09-28): every module included in Superior is
    /// also included in VIP, so the module goes to both. Feature 126 (ONAT) is granted ONLY to
    /// OwnerAdmin (2) — both views are owner-scoped.
    ///
    /// Column shapes mirror the StoreModule/StoreRoleFeature tables (AuditableEntity audit
    /// columns); CreatedBy is the seeded SuperAdmin user (DataUtils.SuperAdminUser.Id).
    /// Single source of truth: the EF migration and the VPS script (backend/scripts/42-*.sql).
    /// </summary>
    public static class OnatModuleBackfill
    {
        public const int ModuleId = 22;
        public const int OnatFeatureId = 126;
        public const int OwnerAdminRoleId = 2;
        public const int SuperiorPlanId = 3;
        public const int VipPlanId = 4;

        /// <summary>
        /// Catalog rows: Module 22 (PriceIncluded, price 0, IsActive FALSE — ships dark),
        /// Feature 126 (active) and the StorePlanModule assignment for Superior (3) and VIP (4).
        /// Idempotent: re-running is a no-op.
        /// </summary>
        public const string CatalogSql = """
            INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
            VALUES (22, TRUE, 0, FALSE, 'ONAT', 161, 0, 0, TRUE)
            ON CONFLICT ("Id") DO NOTHING;

            INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
            VALUES (126, TRUE, 'Funcionalidad para el Vector Fiscal y las configuraciones fiscales del Owner', TRUE, 22, 'ONAT', 261)
            ON CONFLICT ("Id") DO NOTHING;

            INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
            VALUES (3, 22), (4, 22)
            ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;
            """;

        /// <summary>
        /// StoreModule rows for every existing ACTIVE store on Superior (3) or VIP (4). The rows are
        /// ACTIVE even though module 22 is not: the store is ready the moment the catalog flag flips.
        /// Price columns mirror module 22 (PriceIncluded, price 0, no discount).
        /// </summary>
        public const string StoreModuleSql = """
            INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                                       "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                                       "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", 22, TRUE, 0, 0, 0, 0, s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
            ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;
            """;

        /// <summary>
        /// StoreRoleFeature row for feature 126 (ONAT) for the OwnerAdmin (2) role on every existing
        /// ACTIVE store on Superior (3) or VIP (4).
        /// </summary>
        public const string StoreRoleFeatureSql = """
            INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                            "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", 2, f."Id", s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            JOIN (VALUES (126)) AS f("Id") ON TRUE
            WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
            ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;
            """;

        /// <summary>
        /// Explicit-PK inserts do not advance the serials, so the next EF-generated Module/Feature id
        /// would collide with 22/126.
        /// </summary>
        public const string SequenceFixupsSql = """
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

        /// <summary>
        /// One text for the migration: catalog first (StoreModule/StoreRoleFeature reference it),
        /// then the per-store rows, then the serial fix-up. Explicit "\n" instead of a raw string
        /// literal so no trailing-newline trap glues the statements together.
        /// </summary>
        public const string UpSql =
            CatalogSql + "\n" + StoreModuleSql + "\n" + StoreRoleFeatureSql + "\n" + SequenceFixupsSql;

        /// <summary>
        /// Reverses exactly what <see cref="UpSql"/> inserted. FK order matters: the per-store rows
        /// first, then the plan assignment, then feature and module.
        /// </summary>
        public const string DownSql = """
            DELETE FROM "StoreRoleFeature" WHERE "FeatureId" = 126;
            DELETE FROM "StoreModule" WHERE "ModuleId" = 22;
            DELETE FROM "StorePlanModule" WHERE "ModuleId" = 22;
            DELETE FROM "Feature" WHERE "Id" = 126;
            DELETE FROM "Module" WHERE "Id" = 22;
            """;
    }
}
