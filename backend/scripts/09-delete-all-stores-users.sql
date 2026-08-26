-- ============================================================
-- 09: Delete-All-Stores-Users
-- Elimina TODAS las tiendas, sus owners y todos los usuarios.
-- Crea tablas de respaldo para rollback completo.
-- Seguro: respeta FK, usa transacción, verifica antes de borrar.
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 1: Auditoría inicial
-- ============================================================
SELECT '=== AUDITORÍA INICIAL ===' AS seccion;

SELECT 'User' AS tabla, COUNT(*) AS registros FROM "User"
UNION ALL SELECT 'Store', COUNT(*) FROM "Store"
UNION ALL SELECT 'Owner', COUNT(*) FROM "Owner"
UNION ALL SELECT 'UserRole', COUNT(*) FROM "UserRole"
UNION ALL SELECT 'StoreUser', COUNT(*) FROM "StoreUser"
UNION ALL SELECT 'StoreModule', COUNT(*) FROM "StoreModule"
UNION ALL SELECT 'StoreRoleFeature', COUNT(*) FROM "StoreRoleFeature"
UNION ALL SELECT 'ReSeller', COUNT(*) FROM "ReSeller"
UNION ALL SELECT 'ReSellerOwner', COUNT(*) FROM "ReSellerOwner"
UNION ALL SELECT 'StorePayment', COUNT(*) FROM "StorePayment"
UNION ALL SELECT 'StoreUsage', COUNT(*) FROM "StoreUsage"
UNION ALL SELECT 'ProductCategory', COUNT(*) FROM "ProductCategory"
UNION ALL SELECT 'Product', COUNT(*) FROM "Product"
UNION ALL SELECT 'OrderItem', COUNT(*) FROM "OrderItem"
UNION ALL SELECT '"Order"', COUNT(*) FROM "Order"
UNION ALL SELECT 'InventoryEntryCost', COUNT(*) FROM "InventoryEntryCost"
UNION ALL SELECT 'InventoryEntry', COUNT(*) FROM "InventoryEntry"
UNION ALL SELECT 'RefreshTokens', COUNT(*) FROM "RefreshTokens"
UNION ALL SELECT 'OutboxMessage', COUNT(*) FROM "OutboxMessage"
ORDER BY 1;

-- ============================================================
-- PASO 2: Respaldar tablas en tablas temporales (rollback)
-- ============================================================

-- Respaldar tablas de “hijo” primero
CREATE TEMP TABLE IF NOT EXISTS _bak_inventory_entry_cost AS SELECT * FROM "InventoryEntryCost" WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_inventory_entry    AS SELECT * FROM "InventoryEntry"    WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_order_item         AS SELECT * FROM "OrderItem"         WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_order              AS SELECT * FROM "Order"              WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_product            AS SELECT * FROM "Product"            WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_product_category   AS SELECT * FROM "ProductCategory"    WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_store_usage        AS SELECT * FROM "StoreUsage"         WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_store_payment      AS SELECT * FROM "StorePayment"       WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_re_seller_owner    AS SELECT * FROM "ReSellerOwner"      WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_re_seller          AS SELECT * FROM "ReSeller"           WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_store_user         AS SELECT * FROM "StoreUser"          WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_store_role_feature AS SELECT * FROM "StoreRoleFeature"    WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_store_module       AS SELECT * FROM "StoreModule"        WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_user_role          AS SELECT * FROM "UserRole"           WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_store              AS SELECT * FROM "Store"              WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_owner              AS SELECT * FROM "Owner"              WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_user               AS SELECT * FROM "User"               WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_refresh_tokens     AS SELECT * FROM "RefreshTokens"      WHERE false;
CREATE TEMP TABLE IF NOT EXISTS _bak_outbox_message     AS SELECT * FROM "OutboxMessage"      WHERE false;

-- Copiar datos
INSERT INTO _bak_inventory_entry_cost SELECT * FROM "InventoryEntryCost";
INSERT INTO _bak_inventory_entry      SELECT * FROM "InventoryEntry";
INSERT INTO _bak_order_item           SELECT * FROM "OrderItem";
INSERT INTO _bak_order                SELECT * FROM "Order";
INSERT INTO _bak_product              SELECT * FROM "Product";
INSERT INTO _bak_product_category     SELECT * FROM "ProductCategory";
INSERT INTO _bak_store_usage          SELECT * FROM "StoreUsage";
INSERT INTO _bak_store_payment        SELECT * FROM "StorePayment";
INSERT INTO _bak_re_seller_owner      SELECT * FROM "ReSellerOwner";
INSERT INTO _bak_re_seller            SELECT * FROM "ReSeller";
INSERT INTO _bak_store_user           SELECT * FROM "StoreUser";
INSERT INTO _bak_store_role_feature   SELECT * FROM "StoreRoleFeature";
INSERT INTO _bak_store_module         SELECT * FROM "StoreModule";
INSERT INTO _bak_user_role            SELECT * FROM "UserRole";
INSERT INTO _bak_store                SELECT * FROM "Store";
INSERT INTO _bak_owner                SELECT * FROM "Owner";
INSERT INTO _bak_user                 SELECT * FROM "User";
INSERT INTO _bak_refresh_tokens       SELECT * FROM "RefreshTokens";
INSERT INTO _bak_outbox_message       SELECT * FROM "OutboxMessage";

SELECT 'Respaldo completado en tablas temporales (_bak_*)' AS estado;

-- ============================================================
-- PASO 3: Eliminar datos (orden inverso de dependencias FK)
-- ============================================================

-- Nivel 1: Hojas (no referenciados por otros)
DELETE FROM "InventoryEntryCost";
DELETE FROM "OrderItem";
DELETE FROM "StoreUsage";
DELETE FROM "StorePayment";

-- Nivel 2: Dependientes de hojas
DELETE FROM "InventoryEntry";
DELETE FROM "Order";
DELETE FROM "Product";

-- Nivel 3: Dependientes de nivel 2
DELETE FROM "ProductCategory";

-- Nivel 4: Tablas intermedias Store-*
DELETE FROM "StoreModule";
DELETE FROM "StoreRoleFeature";
DELETE FROM "StoreUser";
DELETE FROM "ReSellerOwner";
DELETE FROM "RefreshTokens";
DELETE FROM "UserRole";

-- Nivel 5: ReSeller (depende de User)
DELETE FROM "ReSeller";

-- Nivel 6: Store (depende de Owner)
DELETE FROM "Store";

-- Nivel 7: Owner (depende de User)
DELETE FROM "Owner";

-- Nivel 8: User (depende de Tenant, Role — esos NO se borran)
DELETE FROM "User";

-- OutboxMessage (no depende de User/Store, pero limpiar por si acaso)
DELETE FROM "OutboxMessage";

-- ============================================================
-- PASO 4: Verificación post-eliminación
-- ============================================================
SELECT '=== VERIFICACIÓN POST-ELIMINACIÓN ===' AS seccion;

SELECT 'User' AS tabla, COUNT(*) AS registros FROM "User"
UNION ALL SELECT 'Store', COUNT(*) FROM "Store"
UNION ALL SELECT 'Owner', COUNT(*) FROM "Owner"
UNION ALL SELECT 'UserRole', COUNT(*) FROM "UserRole"
UNION ALL SELECT 'StoreUser', COUNT(*) FROM "StoreUser"
UNION ALL SELECT 'StoreModule', COUNT(*) FROM "StoreModule"
UNION ALL SELECT 'StoreRoleFeature', COUNT(*) FROM "StoreRoleFeature"
UNION ALL SELECT 'ReSeller', COUNT(*) FROM "ReSeller"
UNION ALL SELECT 'ReSellerOwner', COUNT(*) FROM "ReSellerOwner"
UNION ALL SELECT 'StorePayment', COUNT(*) FROM "StorePayment"
UNION ALL SELECT 'StoreUsage', COUNT(*) FROM "StoreUsage"
UNION ALL SELECT 'ProductCategory', COUNT(*) FROM "ProductCategory"
UNION ALL SELECT 'Product', COUNT(*) FROM "Product"
UNION ALL SELECT 'OrderItem', COUNT(*) FROM "OrderItem"
UNION ALL SELECT '"Order"', COUNT(*) FROM "Order"
UNION ALL SELECT 'InventoryEntryCost', COUNT(*) FROM "InventoryEntryCost"
UNION ALL SELECT 'InventoryEntry', COUNT(*) FROM "InventoryEntry"
UNION ALL SELECT 'RefreshTokens', COUNT(*) FROM "RefreshTokens"
UNION ALL SELECT 'OutboxMessage', COUNT(*) FROM "OutboxMessage"
ORDER BY 1;

-- Verificar que Module, Role, Tenant y Feature NO fueron eliminados
SELECT 'Module (debe conservar datos)' AS verifica,
       (SELECT COUNT(*) FROM "Module") AS registros
UNION ALL
SELECT 'Role (debe conservar datos)',
       (SELECT COUNT(*) FROM "Role")
UNION ALL
SELECT 'Tenant (debe conservar datos)',
       (SELECT COUNT(*) FROM "Tenant")
UNION ALL
SELECT 'Feature (debe conservar datos)',
       (SELECT COUNT(*) FROM "Feature");

-- Verificar que las tablas backup tienen datos
SELECT '=== RESGUARDO ===' AS seccion;

SELECT '_bak_user' AS tabla, COUNT(*) AS registros FROM _bak_user
UNION ALL SELECT '_bak_store', COUNT(*) FROM _bak_store
UNION ALL SELECT '_bak_owner', COUNT(*) FROM _bak_owner
UNION ALL SELECT '_bak_user_role', COUNT(*) FROM _bak_user_role
UNION ALL SELECT '_bak_store_user', COUNT(*) FROM _bak_store_user
UNION ALL SELECT '_bak_product', COUNT(*) FROM _bak_product
UNION ALL SELECT '_bak_order', COUNT(*) FROM _bak_order
UNION ALL SELECT '_bak_refresh_tokens', COUNT(*) FROM _bak_refresh_tokens
ORDER BY 1;

COMMIT;

SELECT '✅ ELIMINACIÓN COMPLETADA EXITOSAMENTE' AS resultado;
SELECT '⚠️  Los datos de respaldo están en tablas temporales (_bak_*).' AS nota;
SELECT '⚠️  Para revertir, ejecuta: backend/scripts/10-revert-delete-stores-users.sql' AS revertir;
SELECT '⚠️  IMPORTANTE: Las tablas temporales se eliminan al cerrar la conexión.' AS advertencia;
