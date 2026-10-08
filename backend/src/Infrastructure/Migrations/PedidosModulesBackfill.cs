namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL for the two modules split out of "Catálogo web" (18) on 2026-10-08 —
    /// "Pedidos WhatsApp" (module 19) and "Gestión de Pedidos" (module 20) — for the stores that
    /// ALREADY exist. Feature modulos-pedidos-whatsapp-gestion, owner decisions M1–M6.
    /// <para>
    /// Single source of truth: the EF migration (Add-PedidosWhatsApp-GestionPedidos-Modules), the
    /// VPS script (backend/scripts/31-*.sql), and any future assignment test read these exact
    /// statements.
    /// </para>
    /// <para>
    /// What is NOT here — the CATALOG. Module 19/20, feature 124, the ModuleId change of feature 123
    /// and the StorePlanModule rows (19/20 → planes 3 and 4) all travel through
    /// <c>HasData</c> in ModuleEntityTypeConfiguration / FeatureEntityTypeConfiguration /
    /// StorePlanModuleEntityTypeConfiguration, exactly like every other catalog row, so EF emits them
    /// as InsertData/UpdateData and keeps them in the model snapshot. Hand-writing those INSERTs as raw
    /// SQL was the hygiene bug fixed on 2026-10-06: the row ended up in the database but not in the
    /// snapshot, so a fresh <c>database update</c> on an existing deployment silently diverged. Only
    /// genuinely per-row, per-store data that EF cannot express from the model stays raw SQL, and that
    /// is exactly what this class is.
    /// </para>
    /// <para>
    /// The universe is derived from <c>StoreModule</c> (module 18), NOT from <c>Store.StorePlanId</c>:
    /// a store can hold module 18 by plan OR by negotiation, and a store can be on Superior without
    /// having module 18 activated. Same decision as OnlineOrdersRoleFeatureBackfill.
    /// </para>
    /// <para>
    /// Roles mirror StoreRoleFeatures.cs exactly: feature 124 → OwnerAdmin (2) only, because
    /// PedidosWhatsAppAdmin is Owner-only (M4 — the WhatsApp number, delivery types, fees, minimums,
    /// hours and zones are the owner's config); feature 123 → OwnerAdmin (2) + StoreUser (3), which
    /// is what OnlineOrdersAdmin has carried since D15.
    /// </para>
    /// Column shapes mirror the StoreModule/StoreRoleFeature tables (AuditableEntity audit columns);
    /// CreatedBy is the seeded SuperAdmin user (DataUtils.SuperAdminUser.Id).
    /// </summary>
    public static class PedidosModulesBackfill
    {
        public const int WebCatalogModuleId = 18;
        public const int PedidosWhatsAppModuleId = 19;
        public const int GestionPedidosModuleId = 20;
        public const int OnlineOrdersFeatureId = 123;
        public const int PedidosWhatsAppFeatureId = 124;
        public const int OwnerAdminRoleId = 2;
        public const int StoreUserRoleId = 3;

        /// <summary>
        /// StoreModule rows for modules 19 and 20 on every ACTIVE store whose module 18 StoreModule
        /// row is still active. Price mirrors the module catalog (M5): Price=10, 50% percent discount.
        /// The SELECT is driven by a VALUES join instead of the literal 19 twice so both module ids
        /// come from one source, and it is idempotent via ON CONFLICT DO NOTHING on (StoreId, ModuleId).
        /// </summary>
        public const string StoreModuleSql = """
            INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
                                       "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId",
                                       "IsActive", "CreatedDate", "CreatedBy")
            SELECT sm."StoreId", v."ModuleId", FALSE, 10, 10, 0, 50, s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "StoreModule" sm
            JOIN "Store" s ON s."Id" = sm."StoreId"
            JOIN (VALUES (19), (20)) AS v("ModuleId") ON TRUE
            WHERE s."IsActive" = TRUE AND sm."ModuleId" = 18 AND sm."IsActive" = TRUE
            ON CONFLICT ("StoreId", "ModuleId") DO NOTHING;
            """;

        /// <summary>
        /// StoreRoleFeature rows for feature 124 (OwnerAdmin only — it is the module 19 config and
        /// cart) and feature 123 (OwnerAdmin + StoreUser — it is the order management of module 20),
        /// on every ACTIVE store whose module 18 StoreModule row is still active.
        /// <para>
        /// The <c>sm."ModuleId" = 18</c> predicate is what keeps this correct for feature 123: its rows
        /// for exactly this universe were already created by 20261007021020_Add-StoreCatalogSettings-
        /// Drivers-OrderFields, so ON CONFLICT DO NOTHING makes this statement a no-op there and it
        /// only fills stores the earlier backfill missed. That is deliberate — the grant must not be
        /// tied to module 20, or a store with module 19 alone would silently acquire order-management
        /// permissions (M2/M3).
        /// </para>
        /// </summary>
        public const string StoreRoleFeatureSql = """
            INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                            "IsActive", "CreatedDate", "CreatedBy")
            SELECT sm."StoreId", v."RoleId", v."FeatureId", s."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
            FROM "StoreModule" sm
            JOIN "Store" s ON s."Id" = sm."StoreId"
            JOIN (VALUES (2, 124), (2, 123), (3, 123)) AS v("RoleId", "FeatureId") ON TRUE
            WHERE s."IsActive" = TRUE AND sm."ModuleId" = 18 AND sm."IsActive" = TRUE
            ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;
            """;

        /// <summary>
        /// Identity-sequence fix-up for BOTH "Module" and "Feature". HasData emits InsertData with an
        /// explicit primary key, and an explicit-PK insert never advances the serial — so without this
        /// the next EF-generated Module or Feature would collide with 19/20 or 124. GREATEST(MAX+1,
        /// nextval) keeps it monotonic whether or not the catalog row already existed, and makes the
        /// statement re-runnable (recomputing the same value).
        /// <para>
        /// Note: since the catalog rows became real InsertData, the Npgsql provider ALSO emits its own
        /// equivalent setval at the END of the migration, so scripts/31-*.sql contains these statements
        /// twice. That duplication is the provider's, not ours — it is kept and documented in the script
        /// header, exactly as in scripts/29-*.sql, because AGENTS.md requires the reset to travel with
        /// the migration and because the statement is idempotent.
        /// </para>
        /// </summary>
        public const string SequenceFixupsSql = """
            SELECT setval(
                pg_get_serial_sequence('"Module"', 'Id'),
                GREATEST(
                    (SELECT MAX("Id") FROM "Module") + 1,
                    nextval(pg_get_serial_sequence('"Module"', 'Id'))),
                false);

            SELECT setval(
                pg_get_serial_sequence('"Feature"', 'Id'),
                GREATEST(
                    (SELECT MAX("Id") FROM "Feature") + 1,
                    nextval(pg_get_serial_sequence('"Feature"', 'Id'))),
                false);
            """;

        /// <summary>
        /// Down() half of the backfill. Unlike the additive repair backfills (WholesaleSalesMultiStores…),
        /// this one removes what it created, because everything here is brand new: modules 19/20 did
        /// not exist before this migration, so no StoreModule or StoreRoleFeature row could predate it.
        /// Rolling back must therefore take the entitlements away with the modules.
        /// <para>
        /// Ordering contract — the migration calls this BEFORE the generated DeleteData, and it is
        /// internally FK-safe:
        /// <list type="bullet">
        /// <item>StoreRoleFeature first: FeatureId is Restrict, so leaving rows behind would make the
        /// generated DeleteData of Feature 124 raise a foreign-key violation.</item>
        /// <item>StoreModule second: ModuleId is Restrict, so leaving rows behind would make the
        /// generated DeleteData of Module 19/20 raise a foreign-key violation. It must also precede
        /// the generated DeleteData of StorePlanModule, which references the same modules.</item>
        /// </list>
        /// Feature 123 rows are NOT deleted: they are owned by 20261007021020_Add-StoreCatalogSettings-
        /// Drivers-OrderFields, which created them for this same universe. This migration only fills
        /// what that one missed, and dropping the whole set would revoke a grant this migration never
        /// made. EF restores feature 123's ModuleId to 18 with its own generated UpdateData.
        /// </summary>
        public const string DownSql = """
            DELETE FROM "StoreRoleFeature"
            WHERE "FeatureId" = 124;

            DELETE FROM "StoreModule"
            WHERE "ModuleId" IN (19, 20);
            """;
    }
}