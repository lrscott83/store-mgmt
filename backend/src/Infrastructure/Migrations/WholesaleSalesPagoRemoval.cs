namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL that removes the WholesaleSales capability (module 12, feature 39) from
    /// every store on the Pago plan (StorePlanId = 2). WholesaleSales is now reserved for
    /// Superior (3) and VIP (4) only (change wholesale-superior-vip-only, 2026-09-23).
    /// <para>
    /// Single source of truth: the EF migration, the VPS script (backend/scripts/21-*.sql),
    /// and the E2E cleanup tests use these exact statements.
    /// Order matters (FK): StoreRoleFeature rows must be deleted BEFORE StoreModule rows.
    /// The catalog row (PlanId=2, ModuleId=12) is removed by the migration's DeleteData,
    /// not by this SQL.
    /// </para>
    /// </summary>
    public static class WholesaleSalesPagoRemoval
    {
        public const int WholesaleSalesModuleId = 12;
        public const int WholesaleSalesFeatureId = 39;
        public const int PagoPlanId = 2;

        /// <summary>
        /// Soft state is not enough: a Pago store must not hold the module or the feature
        /// at all, active or soft-deleted. DELETE is naturally idempotent (re-running is
        /// a no-op). Superior/VIP stores are untouched.
        /// </summary>
        public const string CleanupSql = """
            DELETE FROM "StoreRoleFeature" srf
            WHERE srf."FeatureId" = 39
              AND srf."StoreId" IN (SELECT "Id" FROM "Store" WHERE "StorePlanId" = 2);

            DELETE FROM "StoreModule" sm
            WHERE sm."ModuleId" = 12
              AND sm."StoreId" IN (SELECT "Id" FROM "Store" WHERE "StorePlanId" = 2);
            """;

        /// <summary>
        /// Deliberate no-op: rolling back the catalog removal cannot resurrect the deleted
        /// per-store rows (the migration never records which Pago stores held module 12).
        /// The catalog DeleteData is reverted by EF's generated Down InsertData; per-store
        /// data loss is accepted and documented in wholesale-superior-vip-only.
        /// </summary>
        public const string DownSql = """
            -- Per-store cleanup is not reversible; the catalog row is restored by InsertData.
            SELECT 1;
            """;
    }
}