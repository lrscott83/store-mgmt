-- =====================================================
-- 31: Módulos nuevos "Pedidos WhatsApp" (19) y "Gestión de pedidos" (20)
--     Reparte en dos módulos lo que colgaba del Catálogo web (18) — modulos-pedidos-whatsapp-gestion,
--     decisiones M1–M6 del owner (2026-10-08). Sin cambio de negocio: es repartir lo que ya existe.
--       (a) CATÁLOGO por HasData (EF InsertData/UpdateData), NUNCA SQL a mano:
--           Module 19 "Pedidos WhatsApp"  (Order 150, Price=10, 50% desc → 5)
--           Module 20 "Gestión de pedidos" (Order 151, Price=10, 50% desc → 5)   [M5]
--           Feature 124 "Pedidos WhatsApp" (ModuleId 19, Order 252) — carrito + su CONFIGURACIÓN [M4]
--           Feature 123 "Pedidos online"   (ModuleId 18 → 20)                     [M3]
--           StorePlanModule: módulos 19/20 → planes Superior (3) y VIP (4)        [M6]
--       (b) BACKFILLED por SQL crudo — lo que EF no puede expresar desde el modelo: las filas
--           POR TIENDA. StoreModule 19/20 + StoreRoleFeature 124 (OwnerAdmin) y 123
--           (OwnerAdmin + StoreUser). Universo = tiendas ACTIVAS que ya tienen el módulo 18
--           (NO desde StorePlanId: una tienda puede tener el 18 por negociación).
--       (c) setval de los seriales "Module" y "Feature" — los INSERT con PK explícita no los mueven.
-- Migración EF: 20261008185523_Add-PedidosWhatsApp-GestionPedidos-Modules
-- Fecha: 2026-10-08
--
-- GENERADO con: dotnet ef migrations script 20261008021950_Add-StoreCatalogImages
--   (migración única: -From es la ANTERIOR y -To se omite, per la regla del repo)
--
-- Paridad: el cuerpo del script es EXACTAMENTE el que emitió EF. Los INSERT de Module 19/20,
--         Feature 124 y StorePlanModule, y el UPDATE del ModuleId de 123, son los InsertData/
--         UpdateData que EF genera desde HasData — el camino de seeds del repo, NO SQL a mano
--         (arreglo de higiene del 2026-10-06: una fila metida por SQL crudo queda fuera del
--         snapshot y diverge en el siguiente `database update`). Los INSERT de StoreModule y
--         StoreRoleFeature y los setval son el mismo texto de las constantes
--         Infrastructure.Migrations.PedidosModulesBackfill que ejecuta el Up() de la migración.
--         Requiere: scripts previos aplicados (hasta 20261008021950_Add-StoreCatalogImages), y
--         scripts 24 y 26 (módulo 18 en Superior y VIP) para que la parte por tienda tenga efecto.
--
-- NOTA — los setval aparecen DOS VECES cada uno: el primero es la constante
--   SequenceFixupsSql del Up() y el segundo lo emite el proveedor Npgsql al final de la migración
--   porque las filas del catálogo ahora son InsertData reales. Son la MISMA sentencia y el
--   resultado es idempotente (GREATEST(MAX+1, nextval) recalcula el mismo valor); se conserva la
--   de la migración porque AGENTS.md exige que el reset del serial viaje con ella.
--
-- ORDEN (FK Restrict): el script lo respeta porque así quedó en el Up() de la migración, tras
--   corregir el orden que emitió el scaffolder (ver los ORDER NOTE de la migración):
--   * Module 19/20 antes del UPDATE de la feature 123 (si no, FK_Feature_Module_ModuleId → 23503).
--   * Las filas por tienda después del catálogo al que apuntan por FK.
--   * El UPDATE de 123 es idempotente por naturaleza (mismo valor si se corre dos veces).
--
-- IDEMPOTENTE (desviaciones del texto de EF, todas documentadas, ninguna cambia la semántica):
--   * ON CONFLICT ("Id") DO NOTHING en los INSERT de "Module" y "Feature", y ON CONFLICT
--     ("ModuleId","PlanId") DO NOTHING en los de "StorePlanModule": EF emite los INSERT pelados y
--     correr el script dos veces —o aplicarlo sobre una base donde las filas ya existen— revienta
--     por PRIMARY KEY. Igual que el patch del script 29.
--   * ON CONFLICT ("MigrationId") DO NOTHING en __EFMigrationsHistory: EF emite el INSERT pelado.
-- =====================================================

START TRANSACTION;

-- Catálogo: Module 19 y 20 (InsertData de EF desde ModuleEntityTypeConfiguration.HasData).
-- ON CONFLICT DO NOTHING lo añade el patch de idempotencia (EF emite el INSERT pelado).
INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (19, TRUE, 0, TRUE, 'Pedidos WhatsApp', 150, 50, 10, FALSE)
ON CONFLICT ("Id") DO NOTHING;

INSERT INTO "Module" ("Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded")
VALUES (20, TRUE, 0, TRUE, 'Gestión de pedidos', 151, 50, 10, FALSE)
ON CONFLICT ("Id") DO NOTHING;

-- La feature 123 "Pedidos online" pasa del módulo 18 al 20: la que PERSISTE la orden y gestiona
-- las entregas es "Gestión de Pedidos" (M3). Va DESPUÉS del INSERT de Module 19/20 por la FK.
-- Idempotente por naturaleza: fijar el mismo ModuleId dos veces no cambia nada.
UPDATE "Feature" SET "ModuleId" = 20
WHERE "Id" = 123;

-- Catálogo: Feature 124 (InsertData de EF desde FeatureEntityTypeConfiguration.HasData).
INSERT INTO "Feature" ("Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order")
VALUES (124, TRUE, 'Funcionalidad para tomar pedidos por WhatsApp y configurar su envío', TRUE, 19, 'Pedidos WhatsApp', 252)
ON CONFLICT ("Id") DO NOTHING;

-- Catálogo: los dos módulos a Superior (3) y VIP (4) — igual que el Catálogo web (M6).
INSERT INTO "StorePlanModule" ("ModuleId", "PlanId")
VALUES (19, 3)
ON CONFLICT ("ModuleId", "PlanId") DO NOTHING;

INSERT INTO "StorePlanModule" ("ModuleId", "PlanId")
VALUES (20, 3)
ON CONFLICT ("ModuleId", "PlanId") DO NOTHING;

INSERT INTO "StorePlanModule" ("ModuleId", "PlanId")
VALUES (19, 4)
ON CONFLICT ("ModuleId", "PlanId") DO NOTHING;

INSERT INTO "StorePlanModule" ("ModuleId", "PlanId")
VALUES (20, 4)
ON CONFLICT ("ModuleId", "PlanId") DO NOTHING;

-- --- Por tienda: StoreModule 19/20 (mismo SQL que PedidosModulesBackfill.StoreModuleSql) ---
-- Precio espejado del catálogo: Price=10, 50% de descuento.
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

-- --- Por tienda: StoreRoleFeature 124 (OwnerAdmin) y 123 (OwnerAdmin + StoreUser) ---
-- (mismo SQL que PedidosModulesBackfill.StoreRoleFeatureSql). El predicado sm."ModuleId" = 18 es lo
-- que mantiene correcto el 123: esas filas las creó el script 29 para EXACTAMENTE este universo, así
-- que el ON CONFLICT las deja como estaban y esta sentencia solo rellena las que aquel se dejó.
-- Deliberadamente NO se ata al módulo 20: una tienda con solo el 19 no debe adquirir permisos de
-- gestión de pedidos (M2/M3).
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "TenantId",
                                "IsActive", "CreatedDate", "CreatedBy")
SELECT sm."StoreId", v."RoleId", v."FeatureId", s."TenantId", TRUE, NOW(),
       '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'
FROM "StoreModule" sm
JOIN "Store" s ON s."Id" = sm."StoreId"
JOIN (VALUES (2, 124), (2, 123), (3, 123)) AS v("RoleId", "FeatureId") ON TRUE
WHERE s."IsActive" = TRUE AND sm."ModuleId" = 18 AND sm."IsActive" = TRUE
ON CONFLICT ("StoreId", "RoleId", "FeatureId") DO NOTHING;

-- setval #1 y #2: la constante PedidosModulesBackfill.SequenceFixupsSql del Up(), y luego la que emite
-- el proveedor Npgsql al final (misma sentencia, mismo resultado: repetirla es inofensivo).
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

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008185523_Add-PedidosWhatsApp-GestionPedidos-Modules', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verificar ----------------------------------------------------------
-- 1) Migración registrada (debe listar 1 fila):
SELECT "MigrationId", "ProductVersion" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008185523_Add-PedidosWhatsApp-GestionPedidos-Modules';

-- 2) Los tres módulos del bloque del catálogo (debe listar 3: el 18 intacto, el 19 y el 20 con
--    Price=10 y 50% de descuento → 5):
SELECT "Id", "Name", "Order", "Price", "DiscountPrice", "PercentDiscountPrice",
       "PriceIncluded", "AvailableToStore", "IsActive"
FROM "Module" WHERE "Id" IN (18, 19, 20) ORDER BY "Id";

-- 3) Las tres features (debe listar 3: 122→18, 123→20 [se movió], 124→19):
SELECT "Id", "Name", "ModuleId", "Order", "AvailableToStore", "IsActive"
FROM "Feature" WHERE "Id" IN (122, 123, 124) ORDER BY "Id";

-- 4) Paridad seed <-> base: las 4 filas del bloque de catálogo con esos MISMOS valores (debe
--    listar 4: los módulos 19 y 20, la feature 123 ya movida a 20 y la feature 124). Se comprueba
--    cada fila por separado (UNION ALL): un JOIN entre "Module" y "Feature" contaría el producto
--    cartesiano de las dos tablas y no probaría nada. Si sale menos de 4, el seed de HasData no
--    coincide con lo que hay en la base — divergencia silenciosa, que es justo lo que el camino
--    HasData evita.
SELECT COUNT(*) AS catalog_rows_matching_seed
FROM (
    SELECT 1 FROM "Module"
    WHERE "Id" = 19 AND "Name" = 'Pedidos WhatsApp' AND "Order" = 150
      AND "Price" = 10 AND "PercentDiscountPrice" = 50 AND "PriceIncluded" = FALSE
      AND "AvailableToStore" = TRUE AND "IsActive" = TRUE
    UNION ALL
    SELECT 1 FROM "Module"
    WHERE "Id" = 20 AND "Name" = 'Gestión de pedidos' AND "Order" = 151
      AND "Price" = 10 AND "PercentDiscountPrice" = 50 AND "PriceIncluded" = FALSE
      AND "AvailableToStore" = TRUE AND "IsActive" = TRUE
    UNION ALL
    SELECT 1 FROM "Feature"
    WHERE "Id" = 123 AND "Name" = 'Pedidos online' AND "ModuleId" = 20 AND "Order" = 251
    UNION ALL
    SELECT 1 FROM "Feature"
    WHERE "Id" = 124 AND "Name" = 'Pedidos WhatsApp' AND "ModuleId" = 19 AND "Order" = 252
) AS seed_matches;

-- 5) Los dos módulos a Superior (3) y VIP (4) y SOLO a esos (debe listar 4 filas):
SELECT "PlanId", "ModuleId" FROM "StorePlanModule"
WHERE "ModuleId" IN (19, 20) ORDER BY "PlanId", "ModuleId";

-- 5b) Ningún otro plan los tiene (debe listar 0):
SELECT COUNT(*) AS modules_in_unexpected_plans
FROM "StorePlanModule" WHERE "ModuleId" IN (19, 20) AND "PlanId" NOT IN (3, 4);

-- 6) StoreModule por módulo (los de 19/20 deben igualar el de 18: mismo universo):
SELECT sm."ModuleId", m."Name", COUNT(*) AS stores
FROM "StoreModule" sm
JOIN "Module" m ON m."Id" = sm."ModuleId"
WHERE sm."ModuleId" IN (18, 19, 20) AND sm."IsActive" = TRUE
GROUP BY sm."ModuleId", m."Name" ORDER BY sm."ModuleId";

-- 7) StoreRoleFeature por feature/rol (debe listar 3: 124→OwnerAdmin(2) SOLO; 123→2 y 3):
SELECT srf."FeatureId", f."Name", srf."RoleId", COUNT(*) AS rows
FROM "StoreRoleFeature" srf
JOIN "Feature" f ON f."Id" = srf."FeatureId"
WHERE srf."FeatureId" IN (123, 124)
GROUP BY srf."FeatureId", f."Name", srf."RoleId"
ORDER BY srf."FeatureId", srf."RoleId";

-- 7b) El permiso de gestión de pedidos (123) NO aparece en el StoreUser de una tienda que solo tenga
--     el módulo 19 (debe listar 0): el grant va atado al módulo 18, no al 20 (M2/M3).
SELECT COUNT(*) AS leaked_123_grants
FROM "StoreRoleFeature" srf
JOIN "StoreModule" sm ON sm."StoreId" = srf."StoreId" AND sm."ModuleId" = 20
WHERE srf."FeatureId" = 123
  AND NOT EXISTS (SELECT 1 FROM "StoreModule" sm18
                  WHERE sm18."StoreId" = srf."StoreId" AND sm18."ModuleId" = 18 AND sm18."IsActive" = TRUE);

-- 8) Universo real: cuántas tiendas activas tienen el módulo 18 (el FROM de los puntos 6 y 7):
SELECT COUNT(*) AS active_stores_with_webcatalog
FROM "StoreModule" sm
JOIN "Store" s ON s."Id" = sm."StoreId"
WHERE sm."ModuleId" = 18 AND sm."IsActive" = TRUE AND s."IsActive" = TRUE;

-- 9) Los seriales quedaron por encima del máximo (los INSERT con PK explícito no los mueven):
SELECT last_value, is_called FROM "Module_Id_seq";
SELECT last_value, is_called FROM "Feature_Id_seq";

-- =====================================================
-- ROLLBACK (inverso de la migración, ejecutar a mano solo si hace falta).
-- Mismo orden que el Down() de la migración, que a su vez corrige el orden del scaffolder:
--   1) StoreRoleFeature 124 ANTES que Feature 124 (FK Restrict).
--   2) StoreModule 19/20 ANTES que Module 19/20 y que StorePlanModule (FK Restrict).
--   3) La feature 123 vuelve al módulo 18 ANTES de borrar el módulo 20 (FK Restrict) — por eso no
--      está agrupada con el resto de las feature 123 que ya existían.
-- NO borra las filas de StoreRoleFeature de la feature 123: son del script 29, no de este.
-- NO toca el módulo 18 ni sus StoreModule: son anteriores a esta migración.
--
-- BEGIN;
-- DELETE FROM "StoreRoleFeature" WHERE "FeatureId" = 124;
-- DELETE FROM "StoreModule" WHERE "ModuleId" IN (19, 20);
-- UPDATE "Feature" SET "ModuleId" = 18 WHERE "Id" = 123;
-- DELETE FROM "StorePlanModule" WHERE "ModuleId" IN (19, 20);
-- DELETE FROM "Feature" WHERE "Id" = 124;
-- DELETE FROM "Module" WHERE "Id" IN (19, 20);
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261008185523_Add-PedidosWhatsApp-GestionPedidos-Modules';
-- COMMIT;
-- =====================================================