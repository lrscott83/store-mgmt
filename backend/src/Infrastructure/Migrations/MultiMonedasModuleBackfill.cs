namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL for the MultiMonedas module (id 15) assignment to existing stores on
    /// Superior (3) and VIP (4) plans — the plans that include the module.
    /// Single source of truth: the EF migration, the VPS script (backend/scripts/17-*.sql),
    /// and any future E2E assignment tests use these exact statements.
    /// Column shapes mirror StoreModule/StoreRoleFeature tables (AuditableEntity audit columns);
    /// CreatedBy is the seeded SuperAdmin user (DataUtils.SuperAdminUser.Id).
    /// </summary>
    public static class MultiMonedasModuleBackfill
    {
        public const int ModuleId = 15;
        public const int FeatureId = 43;
        public const int OwnerAdminRoleId = 2;
        public const int StoreUserRoleId = 3;

        /// <summary>
        /// StoreModule rows for every existing ACTIVE store on Superior (3) / VIP (4).
        /// Mirrors the module catalog: Price=3, 100% percent discount.
        /// </summary>
        public const string StoreModuleSql = """
            INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                                       "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                                       "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", 15, FALSE, 3, 3, 0, 100, s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
            ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;
            """;

        /// <summary>
        /// StoreRoleFeature rows for feature 43 (MultiMonedas) for OwnerAdmin (2) and
        /// StoreUser (3) roles on every existing ACTIVE store on Superior (3) / VIP (4).
        /// </summary>
        public const string StoreRoleFeatureSql = """
            INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                           "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", r."Id", 43, s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            JOIN (VALUES (2), (3)) AS r("Id") ON TRUE
            WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)
            ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;
            """;

        public const string DownSql = """
            DELETE FROM "StoreRoleFeature" srf
            WHERE srf."FeatureId" = 43 AND srf."StoreId" IN (SELECT "Id" FROM "Store");

            DELETE FROM "StoreModule" sm
            WHERE sm."ModuleId" = 15;
            """;
    }
}
