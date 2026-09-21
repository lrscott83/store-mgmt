namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL that backfills the missing StoreRoleFeature rows for the WholesaleSales
    /// (feature 39, module 12) and MultiStores (feature 38, module 14) capabilities on
    /// existing stores.
    /// <para>
    /// Modules 12/14 and features 38/39 already exist in the catalog (migration
    /// 20260908194626_Add-WholesaleSales-And-MultiStores-Modules). The gap was the enum:
    /// StoreRoleFeatures.cs had no entry mapping feature 39/38 to a module, so
    /// StoreRoleFeatureGenerator never produced these rows for any store. This backfill
    /// repairs existing ACTIVE stores that already hold the module.
    /// </para>
    /// Single source of truth: the EF migration, the VPS script (backend/scripts/20-*.sql),
    /// and any future E2E assignment tests use these exact statements.
    /// Column shapes mirror the StoreRoleFeature table (AuditableEntity audit columns);
    /// CreatedBy is the seeded SuperAdmin user (DataUtils.SuperAdminUser.Id).
    /// Roles mirror StoreRoleFeatures.cs: feature 39 → OwnerAdmin (2) + StoreUser (3),
    /// feature 38 → OwnerAdmin (2) only.
    /// </summary>
    public static class WholesaleSalesMultiStoresRoleFeatureBackfill
    {
        public const int WholesaleSalesModuleId = 12;
        public const int MultiStoresModuleId = 14;
        public const int WholesaleSalesFeatureId = 39;
        public const int OwnerStoresFeatureId = 38;
        public const int OwnerAdminRoleId = 2;
        public const int StoreUserRoleId = 3;

        /// <summary>
        /// StoreRoleFeature rows for every ACTIVE store whose module 12/14 StoreModule row is
        /// still active. Idempotent via ON CONFLICT DO NOTHING on the composite PK.
        /// </summary>
        public const string StoreRoleFeatureSql = """
            INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                            "IsActive", "CreatedDate", "CreatedBy")
            SELECT sm."StoreId", v."RoleId", v."FeatureId", s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "StoreModule" sm
            JOIN "Store" s ON s."Id" = sm."StoreId"
            JOIN (VALUES (12, 2, 39), (12, 3, 39), (14, 2, 38)) AS v("ModuleId", "RoleId", "FeatureId")
                ON v."ModuleId" = sm."ModuleId"
            WHERE s."IsActive" = TRUE AND sm."IsActive" = TRUE
            ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;
            """;

        /// <summary>
        /// No-op by design: this is an ADDITIVE data backfill. A blind rollback would delete
        /// every StoreRoleFeature row for features 38/39 across all stores — including rows
        /// created after this migration by StoreRoleFeatureGenerator for new stores or
        /// newly-assigned modules, and any row that already existed — causing real data loss
        /// and feature revocation. Reversing an additive backfill must therefore remove
        /// nothing; the idempotent INSERT above is safe to re-run if the migration is
        /// re-applied.
        /// </summary>
        public const string DownSql = """
            -- Additive backfill: intentionally no-op (rolling back must not revoke entitlements).
            SELECT 1;
            """;
    }
}
