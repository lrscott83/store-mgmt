-- =====================================================
-- 27: Convergencia plan/modulos de tiendas
-- Migracion EF: 20260930090000_PlanModuleConvergence
--
-- GENERADO con: dotnet ef migrations script 20260928191227_Add-WebCatalog-Module-Vip
--   (el cuerpo siguiente es el UpSql de la migracion, verbatim, envuelto en transaccion
--    y con el INSERT de __EFMigrationsHistory que emite EF)
--
-- Converge el catalogo StorePlanModule y los modulos/features activos de cada tienda
-- a docs/contrains/plan-modulos-tiendas.md. Totalmente idempotente, sin borrados duros.
-- =====================================================

BEGIN;
WITH
spec("OwnModuleId", "OwnPlanId") AS (
    -- Gratis (1)
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           -- Pago (2)
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           -- Superior (3)
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           -- VIP (4)
           (16, 4)
)DELETE FROM "StorePlanModule" spm
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
WITH
spec("OwnModuleId", "OwnPlanId") AS (
    -- Gratis (1)
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           -- Pago (2)
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           -- Superior (3)
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           -- VIP (4)
           (16, 4)
)INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
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
WITH
spec("OwnModuleId", "OwnPlanId") AS (
    -- Gratis (1)
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           -- Pago (2)
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           -- Superior (3)
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           -- VIP (4)
           (16, 4)
),universo AS (
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
)UPDATE "StoreModule" sm
SET "IsActive"   = FALSE,
    "UpdatedDate" = NOW()
FROM universo u
WHERE sm."StoreId" = u."StoreId"
  AND sm."IsActive"
  AND NOT (sm."ModuleId" = ANY (u."Modulos"));
WITH
spec("OwnModuleId", "OwnPlanId") AS (
    -- Gratis (1)
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           -- Pago (2)
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           -- Superior (3)
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           -- VIP (4)
           (16, 4)
),universo AS (
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
)INSERT INTO "StoreModule" ("StoreId", "ModuleId", "ModulePriceIncluded", "Price",
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
WITH
spec("OwnModuleId", "OwnPlanId") AS (
    -- Gratis (1)
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           -- Pago (2)
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           -- Superior (3)
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           -- VIP (4)
           (16, 4)
),universo AS (
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
),feature_roles("FeatureId", "RoleId") AS (
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
           -- Elaboración (17) / Catálogo web (18) / Pedidos online (123, módulo 18).
           -- El 123 lleva OwnerAdmin + StoreUser (D15), no solo OwnerAdmin como el 122:
           -- OnlineOrdersAdmin declara ambos roles en StoreRoleFeatures.cs.
           (120, 2), (121, 2), (122, 2), (123, 2), (123, 3)
)UPDATE "StoreRoleFeature" srf
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
WITH
spec("OwnModuleId", "OwnPlanId") AS (
    -- Gratis (1)
    VALUES (2, 1), (3, 1), (4, 1), (5, 1), (7, 1),
           -- Pago (2)
           (6, 2), (8, 2), (9, 2), (10, 2), (11, 2),
           -- Superior (3)
           (12, 3), (13, 3), (14, 3), (15, 3), (17, 3), (18, 3),
           -- VIP (4)
           (16, 4)
),universo AS (
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
),feature_roles("FeatureId", "RoleId") AS (
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
           -- Elaboración (17) / Catálogo web (18) / Pedidos online (123, módulo 18).
           -- El 123 lleva OwnerAdmin + StoreUser (D15), no solo OwnerAdmin como el 122:
           -- OnlineOrdersAdmin declara ambos roles en StoreRoleFeatures.cs.
           (120, 2), (121, 2), (122, 2), (123, 2), (123, 3)
), esperado AS (
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

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260930090000_PlanModuleConvergence', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verificar ----------------------------------------------------------
-- 1) Catalogo por plan (debe ser 5/10/16/17):
SELECT "PlanId", COUNT(*) AS pares FROM "StorePlanModule" GROUP BY "PlanId" ORDER BY "PlanId";

-- 2) Modulos activos fuera del universo del plan (debe ser 0 filas):
SELECT sm."StoreId", sm."ModuleId"
FROM "StoreModule" sm JOIN "Store" s ON s."Id" = sm."StoreId"
WHERE sm."IsActive"
  AND NOT EXISTS (SELECT 1 FROM "StorePlanModule" spm
                  WHERE spm."PlanId" = s."StorePlanId" AND spm."ModuleId" = sm."ModuleId");

-- 3) Modulos del plan sin fila activa (debe ser 0 filas):
SELECT s."Id" AS store, spm."ModuleId"
FROM "Store" s JOIN "StorePlanModule" spm ON spm."PlanId" = s."StorePlanId"
WHERE NOT EXISTS (SELECT 1 FROM "StoreModule" sm
                  WHERE sm."StoreId" = s."Id" AND sm."ModuleId" = spm."ModuleId" AND sm."IsActive");

-- 4) Migracion registrada:
SELECT "MigrationId" FROM "__EFMigrationsHistory" WHERE "MigrationId" LIKE '20260930%';
