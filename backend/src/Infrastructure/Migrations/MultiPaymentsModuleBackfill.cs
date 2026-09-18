namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL for the MultiPayments module (id 16) assignment to existing stores on
    /// the VIP (4) plan — the only plan that includes the module.
    /// Single source of truth: the EF migration, the VPS script (backend/scripts/18-*.sql),
    /// and any future E2E assignment tests use these exact statements.
    /// Column shapes mirror StoreModule/StoreRoleFeature tables (AuditableEntity audit columns);
    /// CreatedBy is the seeded SuperAdmin user (DataUtils.SuperAdminUser.Id).
    /// </summary>
    public static class MultiPaymentsModuleBackfill
    {
        public const int ModuleId = 16;
        public const int FeatureId = 44;
        public const int OwnerAdminRoleId = 2;
        public const int StoreUserRoleId = 3;

        /// <summary>
        /// StoreModule rows for every existing ACTIVE store on the VIP (4) plan.
        /// Mirrors the module catalog: Price=10, 50% percent discount.
        /// </summary>
        public const string StoreModuleSql = """
            INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                                       "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                                       "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", 16, FALSE, 10, 10, 0, 50, s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            WHERE s."IsActive" = TRUE AND s."StorePlanId" = 4
            ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;
            """;

        /// <summary>
        /// StoreRoleFeature rows for feature 44 (MultiPayments) for OwnerAdmin (2) and
        /// StoreUser (3) roles on every existing ACTIVE store on the VIP (4) plan.
        /// </summary>
        public const string StoreRoleFeatureSql = """
            INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                           "IsActive", "CreatedDate", "CreatedBy")
            SELECT s."Id", r."Id", 44, s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "Store" s
            JOIN (VALUES (2), (3)) AS r("Id") ON TRUE
            WHERE s."IsActive" = TRUE AND s."StorePlanId" = 4
            ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;
            """;

        public const string DownSql = """
            DELETE FROM "StoreRoleFeature" srf
            WHERE srf."FeatureId" = 44 AND srf."StoreId" IN (SELECT "Id" FROM "Store");

            DELETE FROM "StoreModule" sm
            WHERE sm."ModuleId" = 16;
            """;

        /// <summary>
        /// Identity sequence fix-ups for Module/Feature: explicit-id catalog inserts do not
        /// advance the serials, so re-seed them exactly like the VPS script (backend/scripts/18-*.sql).
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
    }
}
