namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL that removes every StoreRoleFeature row for StorePayment (feature 91).
    /// StorePayment is a SuperAdmin/ReSeller-only capability (StoreRoleFeatures.StorePaymentAdmin):
    /// payments are recorded from the admin side, never from inside the store. With the feature
    /// no longer AvailableToStore (seed change + UpdateData in migration 20260926202919), the
    /// StoreRoleFeature generator stops materialising its SuperAdmin/ReSeller rows inside new
    /// stores — this cleanup deletes the rows already persisted (decisión del usuario 2026-09-26).
    /// <para>
    /// Single source of truth: the EF migration and the VPS script
    /// (backend/scripts/23-*.sql) use these exact statements.
    /// </para>
    /// </summary>
    public static class StorePaymentStoreScopeRemoval
    {
        public const int StorePaymentFeatureId = 91;

        /// <summary>
        /// The rows are dead weight (an OwnerAdmin never receives feature 91 in /me and no
        /// endpoint reads them — the ReSeller payment path resolves permissions from the enum).
        /// DELETE is naturally idempotent (re-running is a no-op).
        /// </summary>
        public const string CleanupSql = """
            DELETE FROM "StoreRoleFeature" srf
            WHERE srf."FeatureId" = 91;
            """;

        /// <summary>
        /// Deliberate no-op: rolling back the AvailableToStore flag cannot restore which rows
        /// existed (the migration never records them). The flag is reverted by the migration's
        /// Down UpdateData; the deleted rows are accepted loss, documented here.
        /// </summary>
        public const string DownSql = """
            -- Per-store cleanup is not reversible; the AvailableToStore flag is restored by UpdateData.
            SELECT 1;
            """;
    }
}
