namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL for the WebCatalog module (id 18) assignment to existing stores on the
    /// Superior (3) and VIP (4) plans — plans are SELF-CONTAINED (owner decision 2026-09-28):
    /// every module included in Superior is also included in VIP, so the module goes to both.
    /// (Amends D5, 2026-09-27, which had excluded VIP.)
    /// Single source of truth: the EF migration, the VPS script (backend/scripts/26-*.sql),
    /// and any future E2E assignment tests use these exact statements.
    /// Column shapes mirror StoreModule/StoreRoleFeature tables (AuditableEntity audit columns);
    /// CreatedBy is the seeded SuperAdmin user (DataUtils.SuperAdminUser.Id).
    /// Feature 122 (Catálogo web) is granted ONLY to OwnerAdmin (2) — the view is Owner-only.
    /// </summary>
    public static class WebCatalogModuleBackfill
    {
        public const int ModuleId = 18;
        public const int WebCatalogFeatureId = 122;
        public const int OwnerAdminRoleId = 2;

        /// <summary>
        /// StoreModule rows for every existing ACTIVE store on Superior (3) or VIP (4).
        /// Mirrors the module catalog: Price=5, 100% percent discount.
        /// </summary>
        public const string StoreModuleSql = """
            INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                                       "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                                       "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", 18, FALSE, 5, 5, 0, 100, s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
            ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;
            """;

        /// <summary>
        /// StoreRoleFeature row for feature 122 (Catálogo web) for the OwnerAdmin (2) role on
        /// every existing ACTIVE store on Superior (3) or VIP (4).
        /// </summary>
        public const string StoreRoleFeatureSql = """
            INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                           "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", 2, f."Id", s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            JOIN (VALUES (122)) AS f("Id") ON TRUE
            WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
            ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;
            """;

        public const string DownSql = """
            DELETE FROM "StoreRoleFeature" srf
            WHERE srf."FeatureId" = 122 AND srf."StoreId" IN (SELECT "Id" FROM "Store");

            DELETE FROM "StoreModule" sm
            WHERE sm."ModuleId" = 18;
            """;
    }
}
