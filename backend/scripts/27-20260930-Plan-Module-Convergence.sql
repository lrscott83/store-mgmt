-- =====================================================
-- 27: Converge the plan/module matrix and every store's
--     granted modules and role features onto
--     docs/contrains/plan-modulos-tiendas.md
--
-- EF migration: 20260930090000_PlanModuleConvergence
-- Date: 2026-09-30
-- Parity: the SQL below is the SAME text as
--         Infrastructure.Migrations.PlanModuleConvergenceSql.UpSql
--         (SpecCte + UniverseCte + FeatureRoleCte inlined verbatim).
--
-- WHY: the plan catalog was already correct, but the STORES were not.
--   ChangeStorePlanCommand returns success BEFORE reconciling when the
--   store is already on the target plan (line 116), and Toggle/Update
--   store paths write StoreModule rows without building the universe.
--   In smca_test, 9 of 10 stores were missing most of their plan's
--   modules (6 had 1 active module, 3 had none).
--
-- SPEC (own module -> plan that first grants it; a plan P includes
--       module m when m.own_plan <= P):
--   Gratis (1)    : 2 Ventas, 3 Inventario, 4 Sincronización,
--                   5 Reportes, 7 Gestión
--   Pago (2)      : + 6 Estadísticas, 8 Gastos, 9 Facturación,
--                      10 Historiales, 11 Créditos            (10 total)
--   Superior (3)  : + 12 Ventas Mayoristas, 13 Almacenes,
--                      14 Múltiples tiendas, 15 Múltiples monedas,
--                      17 Elaboración, 18 Catálogo web        (16 total)
--   VIP (4)       : + 16 Múltiples pagos                    (17 total)
--   Administración (1) is AvailableToStore = false and is in NO plan.
--
-- SAFETY:
--   * Fully idempotent - re-running is a no-op.
--   * No hard deletes. Extras are soft-deleted so the prior state
--     stays recoverable.
--   * Reactivating a module does NOT touch its price columns, so
--     negotiated per-store pricing survives.
--   * A StoreRoleFeature alone grants nothing; AllowedFeaturesService
--     resolves FeatureIds only through that table. So step 3 is not
--     optional - without it a granted module is still unusable.
-- =====================================================

BEGIN;

-- =====================================================
-- STEP 1 - Converge StorePlanModule to the cumulative matrix
-- =====================================================

-- 1a. Drop plan/module pairs outside the specification.
WITH spec("OwnModuleId", "OwnPlanId") AS (
    -- Gratis (1)
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           -- Pago (2)
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           -- Superior (3)
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           -- VIP (4)
           (16, 4)
)
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

-- 1b. Add the pairs the specification requires.
WITH spec("OwnModuleId", "OwnPlanId") AS (
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           (16, 4)
)
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

-- =====================================================
-- STEP 2 - Converge each store's active StoreModule set
--          to its plan's universe
-- =====================================================

-- The universe mirrors ChangeStorePlanCommand.ApplyPlanModules exactly:
-- plan members UNION the PriceIncluded catalog base set.

-- 2a. Soft-delete modules the plan does not include.
WITH spec("OwnModuleId", "OwnPlanId") AS (
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           (16, 4)
)
, universo AS (
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
UPDATE "StoreModule" sm
SET "IsActive"   = FALSE,
    "UpdatedDate" = NOW()
FROM universo u
WHERE sm."StoreId" = u."StoreId"
  AND sm."IsActive"
  AND NOT (sm."ModuleId" = ANY (u."Modulos"));

-- 2b. Grant the missing modules and reactivate soft-deleted ones.
--     The conflict action touches only IsActive/UpdatedDate so
--     negotiated per-store pricing is preserved.
WITH spec("OwnModuleId", "OwnPlanId") AS (
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           (16, 4)
)
, universo AS (
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

-- =====================================================
-- STEP 3 - Converge each store's active StoreRoleFeature set
--          to the features of its active modules
-- =====================================================

-- feature_roles mirrors StoreRoleFeatureGenerator, verified entry by
-- entry against the rows the application itself generated.
-- Roles: OwnerAdmin = 2, StoreUser = 3, ReSeller = 4.

-- 3a. Soft-delete role features whose module the store no longer holds.
WITH spec("OwnModuleId", "OwnPlanId") AS (
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           (16, 4)
)
, universo AS (
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
, feature_roles("FeatureId", "RoleId") AS (
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

-- 3b. Grant the role features the store's active modules imply and
--     reactivate soft-deleted ones.
WITH spec("OwnModuleId", "OwnPlanId") AS (
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           (16, 4)
)
, universo AS (
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
, feature_roles("FeatureId", "RoleId") AS (
    VALUES (20, 2), (20, 3), (21, 2), (21, 3), (22, 2), (22, 3), (23, 2), (23, 3),
           (30, 2), (31, 2), (33, 2), (32, 2), (32, 3), (34, 2), (34, 3), (35, 2),
           (40, 2), (40, 3), (41, 2), (41, 3), (42, 2), (42, 3),
           (50, 2), (60, 2),
           (70, 2), (70, 3), (70, 4), (72, 2), (73, 2), (74, 2),
           (80, 2), (90, 2), (90, 3),
           (100, 2), (100, 3), (101, 2), (102, 2), (103, 2), (103, 3),
           (110, 2), (110, 3),
           (39, 2), (39, 3), (36, 2), (37, 2), (38, 2),
           (43, 2), (43, 3), (44, 2), (44, 3),
           (120, 2), (121, 2), (122, 2)
)
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

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260930090000_PlanModuleConvergence', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- =====================================================
-- VERIFICATION - every query below must report zero rows
--              (or the counts shown in the comments)
-- =====================================================

-- 1) Plan matrix: expect Gratis 5, Pago 10, Superior 16, VIP 17.
SELECT p."Name" AS plan, count(*) AS modules
FROM "StorePlan" p
LEFT JOIN "StorePlanModule" spm ON spm."PlanId" = p."Id"
GROUP BY p."Name" ORDER BY p."Name";

-- 2) NO plan may reference a module that is not store-available.
--    Must return ZERO rows.
SELECT spm."PlanId", m."Id", m."Name"
FROM "StorePlanModule" spm
JOIN "Module" m ON m."Id" = spm."ModuleId"
WHERE NOT m."AvailableToStore";

-- 3) NO store may hold a module its plan does not grant.
--    Must return ZERO rows.
SELECT s."Name" AS tienda, sp."Name" AS plan, m."Name" AS modulo_invalido
FROM "StoreModule" sm
JOIN "Store" s     ON s."Id" = sm."StoreId"
JOIN "StorePlan" sp ON sp."Id" = s."StorePlanId"
JOIN "Module" m    ON m."Id" = sm."ModuleId"
WHERE sm."IsActive"
  AND NOT (m."Id" = ANY (
      SELECT spec."OwnModuleId"
      FROM (VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
                   (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
                   (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
                   (16, 4)) AS spec("OwnModuleId", "OwnPlanId")
      WHERE spec."OwnPlanId" <= s."StorePlanId"));

-- 4) Every store's active module count must equal its plan's module count.
--    Must return ZERO rows.
SELECT s."Name" AS tienda, sp."Name" AS plan,
       count(*) FILTER (WHERE sm."IsActive") AS tiene,
       (SELECT count(*) FROM "StorePlanModule" x WHERE x."PlanId" = s."StorePlanId") AS debe
FROM "Store" s
LEFT JOIN "StoreModule" sm ON sm."StoreId" = s."Id"
JOIN "StorePlan" sp ON sp."Id" = s."StorePlanId"
GROUP BY s."Id", s."Name", sp."Name", s."StorePlanId"
HAVING count(*) FILTER (WHERE sm."IsActive")
       <> (SELECT count(*) FROM "StorePlanModule" x WHERE x."PlanId" = s."StorePlanId");

-- 5) Role features granted per store (informational - shows the backfill landed).
SELECT count(*) AS role_features_activas, count(DISTINCT "StoreId") AS tiendas
FROM "StoreRoleFeature" WHERE "IsActive";
