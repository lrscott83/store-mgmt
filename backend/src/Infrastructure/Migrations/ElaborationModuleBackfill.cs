namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL for the Elaboration module (id 16) assignment to existing stores on
    /// Superior (3) and VIP (4) plans — the plans that include the module.
    /// Single source of truth: the EF migration, the VPS script (backend/scripts/18-*.sql),
    /// and any future E2E assignment tests use these exact statements.
    /// Column shapes mirror StoreModule/StoreRoleFeature tables (AuditableEntity audit columns);
    /// CreatedBy is the seeded SuperAdmin user (DataUtils.SuperAdminUser.Id).
    /// Features 120 (Recipes) and 121 (Elaborations) are granted ONLY to OwnerAdmin (2).
    /// </summary>
    public static class ElaborationModuleBackfill
    {
        public const int ModuleId = 16;
        public const int RecipesFeatureId = 120;
        public const int ElaborationsFeatureId = 121;
        public const int OwnerAdminRoleId = 2;

        /// <summary>
        /// StoreModule rows for every existing ACTIVE store on Superior (3) / VIP (4).
        /// Mirrors the module catalog: Price=3, 100% percent discount.
        /// </summary>
        public const string StoreModuleSql = """
            INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                                       "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                                       "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", 16, FALSE, 3, 3, 0, 100, s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
            ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;
            """;

        /// <summary>
        /// StoreRoleFeature rows for features 120 (Recipes) and 121 (Elaborations) for the
        /// OwnerAdmin (2) role on every existing ACTIVE store on Superior (3) / VIP (4).
        /// </summary>
        public const string StoreRoleFeatureSql = """
            INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                           "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", 2, f."Id", s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            JOIN (VALUES (120), (121)) AS f("Id") ON TRUE
            WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
            ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;
            """;

        public const string DownSql = """
            DELETE FROM "StoreRoleFeature" srf
            WHERE srf."FeatureId" IN (120, 121) AND srf."StoreId" IN (SELECT "Id" FROM "Store");

            DELETE FROM "StoreModule" sm
            WHERE sm."ModuleId" = 16;
            """;
    }
}
