namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL that removes the Warehouses capability (module 13, features 36 and 37)
    /// from every store whose plan is NOT Superior (3) or VIP (4) — i.e. Gratis (1) and
    /// Pago (2). Warehouses is reserved for Superior/VIP only
    /// (change remove-almacenes-from-gratis-pago, 2026-09-23).
    /// <para>
    /// Single source of truth: the EF migration, the VPS script (backend/scripts/22-*.sql)
    /// and any future cleanup tests use these exact statements.
    /// Order matters (FK): StoreRoleFeature rows must be deleted BEFORE StoreModule rows.
    /// There is no catalog row to remove: Warehouses was never seeded into the Gratis/Pago
    /// plan catalog (StorePlanModuleEntityTypeConfiguration says Superior/VIP only) — the
    /// leak is purely per-store rows created by the 2026-09-05 backfill
    /// (20260905224007_Add-Warehouses-Module) that ran before StorePlan existed.
    /// </para>
    /// </summary>
    public static class WarehousesPlanCleanup
    {
        public const int WarehousesModuleId = 13;
        public const int WarehousesCrudFeatureId = 36;
        public const int WarehouseStockMovementsFeatureId = 37;
        public const int GratisPlanId = 1;
        public const int PagoPlanId = 2;
        public const int SuperiorPlanId = 3;
        public const int VIPPlanId = 4;

        /// <summary>
        /// Soft state is not enough: a non-Superior/VIP store must not hold the module or the
        /// features at all, active or soft-deleted. DELETE is naturally idempotent (re-running
        /// is a no-op). Superior/VIP stores are untouched.
        /// </summary>
        public const string CleanupSql = """
            DELETE FROM "StoreRoleFeature" srf
            WHERE srf."FeatureId" IN (36, 37)
              AND srf."StoreId" IN (SELECT "Id" FROM "Store" WHERE "StorePlanId" NOT IN (3, 4));

            DELETE FROM "StoreModule" sm
            WHERE sm."ModuleId" = 13
              AND sm."StoreId" IN (SELECT "Id" FROM "Store" WHERE "StorePlanId" NOT IN (3, 4));
            """;

        /// <summary>
        /// Deliberate no-op: there is no catalog row to recover, and the migration never
        /// records which non-Superior/VIP stores held module 13, so per-store data loss is
        /// accepted and documented in remove-almacenes-from-gratis-pago.
        /// </summary>
        public const string DownSql = """
            -- Per-store cleanup is not reversible; there is no catalog row to restore.
            SELECT 1;
            """;
    }
}