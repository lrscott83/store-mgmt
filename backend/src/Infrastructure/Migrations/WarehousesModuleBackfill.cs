namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL for the Warehouses module (id 13) assignment to existing active stores.
    /// Single source of truth: the EF migration, the VPS script (backend/scripts/11-*.sql),
    /// and the E2E assignment tests all use these exact statements.
    /// Column shapes mirror StoreModule/StoreRoleFeature tables (AuditableEntity audit columns);
    /// CreatedBy is the seeded SuperAdmin user (DataUtils.SuperAdminUser.Id).
    /// </summary>
    public static class WarehousesModuleBackfill
    {
        public const int ModuleId = 13;
        public const int WarehouseCrudFeatureId = 36;
        public const int WarehouseMovementsFeatureId = 37;
        public const int OwnerAdminRoleId = 2;

        public const string StoreModuleSql =
            """
            INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                                       "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                                       "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", 13, FALSE, 2, 2, 0, 100, s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            WHERE s."IsActive" = TRUE
            ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;
            """;

        public const string StoreRoleFeatureSql =
            """
            INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                           "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", 2, v."Id", s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            JOIN (VALUES (36), (37)) AS v("Id") ON TRUE
            WHERE s."IsActive" = TRUE
            ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;
            """;

        public const string DownSql =
            """
            DELETE FROM "StoreRoleFeature" srf
            WHERE srf."FeatureId" IN (36, 37) AND srf."StoreId" IN (SELECT "Id" FROM "Store");

            DELETE FROM "StoreModule" sm
            WHERE sm."ModuleId" = 13;
            """;
    }
}
