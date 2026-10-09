namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL for the OnlineOrders management feature (feature 123, module 18): the per-store
    /// StoreRoleFeature backfill that hands the feature to the stores that already hold the WebCatalog
    /// module, plus the identity-sequence fix-up that the explicit primary key leaves behind.
    /// <para>
    /// Single source of truth: the EF migration (20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields),
    /// the VPS script (backend/scripts/29-*.sql), and any future assignment tests read these exact
    /// statements. Owner decision 2026-10-06: these rows travel in THIS migration, not in a separate one.
    /// </para>
    /// <para>
    /// What is NOT here: the feature 123 catalog row. It is seeded by the repository-native path —
    /// <c>FeatureEntityTypeConfiguration.HasData</c> — exactly like the other 43 catalog features, so EF
    /// emits it as an <c>InsertData</c> in this migration and keeps it in the model snapshot. That is the
    /// hygiene fix of 2026-10-06: an earlier draft of this migration inserted the row with raw SQL, which
    /// left the seed and the database free to drift (the row was in the DB but absent from the snapshot
    /// and from HasData, so a fresh <c>database update</c> on an existing deployment silently diverged).
    /// Only genuinely per-row, per-store data that EF cannot express from the model — the
    /// StoreRoleFeature backfill — stays raw SQL.
    /// </para>
    /// <para>
    /// Roles mirror StoreRoleFeatures.cs: <c>OnlineOrdersAdmin</c> carries
    /// <c>[HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]</c> (D15) — unlike WebCatalogAdmin, which
    /// is Owner-only, because attending an order is day-to-day work.
    /// </para>
    /// Column shapes mirror the StoreRoleFeature table (AuditableEntity audit columns); CreatedBy is the
    /// seeded SuperAdmin user (DataUtils.SuperAdminUser.Id).
    /// </summary>
    public static class OnlineOrdersRoleFeatureBackfill
    {
        public const int WebCatalogModuleId = 18;
        public const int OnlineOrdersFeatureId = 123;
        public const int OwnerAdminRoleId = 2;
        public const int StoreUserRoleId = 3;

        /// <summary>
        /// StoreRoleFeature rows for feature 123 (Pedidos online) for OwnerAdmin (2) and StoreUser (3)
        /// on every ACTIVE store whose module 18 StoreModule row is still active — the SAME universe
        /// WholesaleSalesMultiStoresRoleFeatureBackfill derives (from StoreModule, NOT from
        /// StorePlanId: a store can hold module 18 by plan OR by negotiation). Idempotent via
        /// ON CONFLICT DO NOTHING on the composite PK, so a re-run against a partially backfilled
        /// database inserts only what is missing.
        /// </summary>
        public const string StoreRoleFeatureSql = """
            INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                            "IsActive", "CreatedDate", "CreatedBy")
            SELECT sm."StoreId", v."RoleId", 123, s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "StoreModule" sm
            JOIN "Store" s ON s."Id" = sm."StoreId"
            JOIN (VALUES (2), (3)) AS v("RoleId") ON TRUE
            WHERE s."IsActive" = TRUE AND sm."ModuleId" = 18 AND sm."IsActive" = TRUE
            ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;
            """;

        /// <summary>
        /// Identity sequence fix-up for "Feature": HasData/InsertData writes an explicit primary key, so
        /// the serial is not advanced and the next EF-generated Feature would collide with 123.
        /// GREATEST(MAX+1, nextval) keeps it monotonic whether or not the catalog row already existed.
        /// Only "Feature" is touched — module 18 predates this migration, so its serial is not ours.
        /// <para>
        /// Observed 2026-10-06: since the catalog row became a real <c>InsertData</c>, the Npgsql provider
        /// ALSO emits its own equivalent setval at the END of the migration, so
        /// <c>scripts/29-*.sql</c> contains this statement twice. That duplication is the provider's, not
        /// ours — it is kept (and documented in the script header) instead of being silently dropped,
        /// because AGENTS.md requires the "Feature"/"Module" serial reset to travel with the migration and
        /// because the statement is idempotent: running it again recomputes the same value.
        /// </para>
        /// </summary>
        public const string SequenceFixupsSql = """
            SELECT setval(
                pg_get_serial_sequence('"Feature"', 'Id'),
                GREATEST(
                    (SELECT MAX("Id") FROM "Feature") + 1,
                    nextval(pg_get_serial_sequence('"Feature"', 'Id'))),
                false);
            """;

        /// <summary>
        /// Down() half of the backfill: remove ALL the StoreRoleFeature rows of feature 123 — which
        /// IS the set this migration owns. The generated Down also deletes the feature 123 catalog
        /// row, and <c>StoreRoleFeature.FeatureId</c> is <c>Restrict</c>, so no grant may survive;
        /// the migrations created after this one are reverted BEFORE it in the chain, so no later
        /// grant can still be present here. Scoping the DELETE would break the rollback.
        /// The feature 123 catalog row is EF's business — the generated <c>DeleteData(table: "Feature",
        /// keyValue: 123)</c> removes it, so this constant must not delete it too.
        /// <para>
        /// Ordering contract: the migration calls this BEFORE the generated DeleteData, because
        /// <c>StoreRoleFeature.FeatureId</c> is <c>Restrict</c>. Deleting the catalog row first would
        /// raise a foreign-key violation. Mirrors WebCatalogModuleBackfill.DownSql, whose rows the
        /// migration also owns, and NOT WholesaleSalesMultiStoresRoleFeatureBackfill.DownSql, which is
        /// a no-op because that backfill repaired rows it did not create.
        /// </para>
        /// </summary>
        public const string DownStoreRoleFeatureSql = """
            DELETE FROM "StoreRoleFeature"
            WHERE "FeatureId" = 123;
            """;
    }
}
