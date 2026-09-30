namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL that makes the plan/module matrix and every store's granted modules and
    /// role features agree with the specification in
    /// <c>docs/contrains/plan-modulos-tiendas.md</c>.
    /// <para>
    /// Single source of truth: the EF migration, the VPS script
    /// (backend/scripts/27-20260930-Plan-Module-Convergence.sql) and any future coverage use
    /// these exact statements.
    /// <para/>
    /// What it does, in order:
    /// <list type="number">
    /// <item>Converges <c>StorePlanModule</c> to the cumulative matrix (own-plan &lt;= plan).</item>
    /// <item>Converges each store's active <c>StoreModule</c> set to its plan's universe.</item>
    /// <item>Converges each store's active <c>StoreRoleFeature</c> set to the features of
    /// those modules, with the fixed feature→role pairs.</item>
    /// </list>
    /// <para>
    /// The universe mirrors <c>ChangeStorePlanCommand.ApplyPlanModules</c> exactly: plan
    /// members UNION the <c>PriceIncluded</c> catalog base set. Because that base set is
    /// currently the whole Gratis plan, it is a no-op today, but honouring it keeps the
    /// migration correct if the plans are ever re-cut.
    /// <para/>
    /// Safety properties:
    /// <list type="bullet">
    /// <item>Fully idempotent — re-running is a no-op.</item>
    /// <item>Never hard-deletes. Extras are soft-deleted (IsActive = false) so the previous
    /// state stays recoverable.</item>
    /// <item>Never overwrites price columns on reactivation. Per-store negotiated pricing
    /// (UpdateStoreModulePricingCommand) is preserved; catalog prices are only written for
    /// genuinely new rows.</item>
    /// <item>Administración (module 1) is excluded by construction — the spec list omits it
    /// and every statement filters on <c>AvailableToStore</c>.</item>
    /// </list>
    /// </summary>
    public static class PlanModuleConvergenceSql
    {
        /// <summary>
        /// System actor used for the NOT NULL audit columns on generated rows. The same GUID
        /// is spelled literally inside the SQL below because a C# raw string literal cannot
        /// interpolate — keep the two in sync. It is the actor used by the earlier backfill
        /// <c>20260920120000_Backfill-WholesaleSales-MultiStores-RoleFeatures</c>.
        /// </summary>
        public const string SystemActorGuid = "38b96d85-bf75-41ca-bfd7-796e7fe0ebc8";

        public const int GratisPlanId = 1;
        public const int PagoPlanId = 2;
        public const int SuperiorPlanId = 3;
        public const int VIPPlanId = 4;

        public const int AdministrationModuleId = 1;
        public const int SalesModuleId = 2;
        public const int MultiPaymentsModuleId = 16;

        /// <summary>
        /// The specification expressed the way the user stated it: each module paired with
        /// the plan that first grants it. A plan P includes module m when m.own_plan &lt;= P,
        /// which makes the cumulative matrix a derived value rather than a hand-listed one.
        /// </summary>
        private const string SpecCte = """
            spec("OwnModuleId", "OwnPlanId") AS (
                -- Gratis (1)
                VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
                       -- Pago (2)
                       (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
                       -- Superior (3)
                       (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
                       -- VIP (4)
                       (16, 4)
            )
            """;

        /// <summary>Per-store module universe, mirroring ApplyPlanModules.</summary>
        private const string UniverseCte = """
            universo AS (
                SELECT s."Id"     AS "StoreId",
                       s."TenantId" AS "TenantId",
                       COALESCE((
                           SELECT array_agg(DISTINCT mod."Id")
                           FROM (
                               SELECT spec."OwnModuleId" AS "Id"
                               FROM spec
                               WHERE spec."OwnPlanId" <= COALESCE(s."StorePlanId", 0)
                                 AND EXISTS (SELECT 1
                                             FROM "Module" m
                                             WHERE m."Id" = spec."OwnModuleId"
                                               AND m."IsActive"
                                               AND m."AvailableToStore")
                               UNION
                               SELECT m."Id"
                               FROM "Module" m
                               WHERE m."IsActive"
                                 AND m."AvailableToStore"
                                 AND m."PriceIncluded"
                           ) mod
                       ), ARRAY[]::integer[]) AS "Modulos"
                FROM "Store" s
            )
            """;

        /// <summary>
        /// The (feature, role) pairs produced by <c>StoreRoleFeatureGenerator</c>. Verified
        /// entry by entry against the rows the application itself generated — see §4 of
        /// docs/contrains/plan-modulos-tiendas.md. Roles: OwnerAdmin = 2, StoreUser = 3,
        /// ReSeller = 4.
        /// </summary>
        private const string FeatureRoleCte = """
            feature_roles("FeatureId", "RoleId") AS (
                -- Ventas (2)
                VALUES (20, 2), (20, 3), (21, 2), (21, 3), (22, 2), (22, 3), (23, 2), (23, 3),
                       -- Inventario (3)
                       (30, 2), (31, 2), (33, 2), (32, 2), (32, 3), (34, 2), (34, 3), (35, 2),
                       -- Sincronización (4)
                       (40, 2), (40, 3), (41, 2), (41, 3), (42, 2), (42, 3),
                       -- Reportes (5) / Estadísticas (6)
                       (50, 2), (60, 2),
                       -- Gestión (7)
                       (70, 2), (70, 3), (70, 4), (72, 2), (73, 2), (74, 2),
                       -- Gastos (8) / Facturación (9)
                       (80, 2), (90, 2), (90, 3),
                       -- Historiales (10)
                       (100, 2), (100, 3), (101, 2), (102, 2), (103, 2), (103, 3),
                       -- Créditos (11)
                       (110, 2), (110, 3),
                       -- Ventas Mayoristas (12) / Almacenes (13) / Múltiples tiendas (14)
                       (39, 2), (39, 3), (36, 2), (37, 2), (38, 2),
                       -- Múltiples monedas (15) / Múltiples pagos (16)
                       (43, 2), (43, 3), (44, 2), (44, 3),
                       -- Elaboración (17) / Catálogo web (18)
                       (120, 2), (121, 2), (122, 2)
            )
            """;

        /// <summary>
        /// 1a. Drop plan/module pairs outside the specification. A row survives only if some
        /// plan includes it, so this also removes any plan row pointing at a module that is
        /// no longer store-available.
        /// </summary>
        public const string PlanCatalogCleanupSql = """
            WITH
            """ + SpecCte + """
            DELETE FROM "StorePlanModule" spm
            WHERE NOT EXISTS (
                SELECT 1
                FROM "StorePlan" p
                WHERE p."Id" = spm."PlanId"
                  AND EXISTS (SELECT 1
                              FROM spec
                              WHERE spec."OwnPlanId" <= p."Id"
                                AND spec."OwnModuleId" = spm."ModuleId"
                                AND EXISTS (SELECT 1
                                            FROM "Module" m
                                            WHERE m."Id" = spec."OwnModuleId"
                                              AND m."IsActive"
                                              AND m."AvailableToStore"))
            );
            """;

        /// <summary>1b. Add the plan/module pairs the specification requires.</summary>
        public const string PlanCatalogInsertSql = """
            WITH
            """ + SpecCte + """
            INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
            SELECT p."Id", spec."OwnModuleId"
            FROM "StorePlan" p
            CROSS JOIN spec
            WHERE spec."OwnPlanId" <= p."Id"
              AND EXISTS (SELECT 1
                          FROM "Module" m
                          WHERE m."Id" = spec."OwnModuleId"
                            AND m."IsActive"
                            AND m."AvailableToStore")
            ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;
            """;

        /// <summary>
        /// 2a. Soft-delete active modules a store's plan does not include. Mirrors the
        /// soft-delete half of ApplyPlanModules.
        /// </summary>
        public const string StoreModuleCleanupSql = """
            WITH
            """ + SpecCte + """
            ,
            """ + UniverseCte + """
            UPDATE "StoreModule" sm
            SET "IsActive"   = FALSE,
                "UpdatedDate" = NOW()
            FROM universo u
            WHERE sm."StoreId" = u."StoreId"
              AND sm."IsActive"
              AND NOT (sm."ModuleId" = ANY (u."Modulos"));
            """;

        /// <summary>
        /// 2b. Grant the missing modules and reactivate soft-deleted ones. The conflict
        /// action touches only IsActive/UpdatedDate so negotiated per-store pricing survives.
        /// </summary>
        public const string StoreModuleGrantSql = """
            WITH
            """ + SpecCte + """
            ,
            """ + UniverseCte + """
            INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price",
                                       "ModulePrice", "ModuleDiscountPrice",
                                       "ModulePercentDiscountPrice", "TenantId", "IsActive",
                                       "CreatedDate", "CreatedBy")
            SELECT u."StoreId", m."Id", m."PriceIncluded", m."Price",
                   m."Price", m."DiscountPrice", m."PercentDiscountPrice",
                   u."TenantId", TRUE, NOW(), '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'::uuid
            FROM universo u
            CROSS JOIN "Module" m
            WHERE m."Id" = ANY (u."Modulos")
              AND m."IsActive"
              AND m."AvailableToStore"
              AND NOT EXISTS (SELECT 1
                              FROM "StoreModule" sm
                              WHERE sm."StoreId" = u."StoreId"
                                AND sm."ModuleId" = m."Id"
                                AND sm."IsActive")
            ON CONFLICT ("StoreId", "ModuleId") DO UPDATE
                SET "IsActive"   = TRUE,
                    "UpdatedDate" = NOW();
            """;

        /// <summary>
        /// 3a. Soft-delete active role features whose module the store no longer holds.
        /// </summary>
        public const string StoreRoleFeatureCleanupSql = """
            WITH
            """ + SpecCte + """
            ,
            """ + UniverseCte + """
            ,
            """ + FeatureRoleCte + """
            UPDATE "StoreRoleFeature" srf
            SET "IsActive"   = FALSE,
                "UpdatedDate" = NOW()
            FROM universo u
            WHERE srf."StoreId" = u."StoreId"
              AND srf."IsActive"
              AND NOT EXISTS (
                  SELECT 1
                  FROM "Feature" f
                  JOIN feature_roles fr ON fr."FeatureId" = f."Id"
                  WHERE f."ModuleId" = ANY (u."Modulos")
                    AND f."IsActive"
                    AND f."AvailableToStore"
                    AND fr."FeatureId" = srf."FeatureId"
                    AND fr."RoleId"    = srf."RoleId");
            """;

        /// <summary>
        /// 3b. Grant the role features the store's active modules imply and reactivate
        /// soft-deleted ones, mirroring the regeneration ApplyPlanModules performs.
        /// </summary>
        public const string StoreRoleFeatureGrantSql = """
            WITH
            """ + SpecCte + """
            ,
            """ + UniverseCte + """
            ,
            """ + FeatureRoleCte + """
            , esperado AS (
                SELECT DISTINCT u."StoreId", fr."RoleId", fr."FeatureId", u."TenantId"
                FROM universo u
                JOIN "Feature" f
                  ON f."ModuleId" = ANY (u."Modulos")
                 AND f."IsActive"
                 AND f."AvailableToStore"
                JOIN feature_roles fr ON fr."FeatureId" = f."Id"
            )
            INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                            "IsActive", "CreatedDate", "CreatedBy")
            SELECT e."StoreId", e."RoleId", e."FeatureId", e."TenantId", TRUE, NOW(),
                   '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'::uuid
            FROM esperado e
            WHERE NOT EXISTS (SELECT 1
                              FROM "StoreRoleFeature" srf
                              WHERE srf."StoreId"   = e."StoreId"
                                AND srf."RoleId"    = e."RoleId"
                                AND srf."FeatureId" = e."FeatureId"
                                AND srf."IsActive")
            ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO UPDATE
                SET "IsActive"   = TRUE,
                    "UpdatedDate" = NOW();
            """;

        /// <summary>All convergence steps, in FK-safe order. Catalog → modules → features.</summary>
        public const string UpSql = PlanCatalogCleanupSql + "\n"
                                 + PlanCatalogInsertSql + "\n"
                                 + StoreModuleCleanupSql + "\n"
                                 + StoreModuleGrantSql + "\n"
                                 + StoreRoleFeatureCleanupSql + "\n"
                                 + StoreRoleFeatureGrantSql;

        /// <summary>
        /// Deliberate no-op. Every step is a convergence toward a specification held in code
        /// (this file) and in docs/contrains/plan-modulos-tiendas.md, not in data the
        /// migration captured. "Down" would have to guess which per-store rows were
        /// legitimately there before, and hard-deleting now-soft-deleted rows would destroy
        /// negotiated per-store pricing. Reversal is a forward re-convergence after changing
        /// the specification instead.
        /// </summary>
        public const string DownSql = """
            -- Convergence only: no reversible state is captured, so Down is a no-op by design.
            SELECT 1;
            """;
    }
}
