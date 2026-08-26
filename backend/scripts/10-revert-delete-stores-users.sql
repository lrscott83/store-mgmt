-- ============================================================
-- 10: Revert-Delete-Stores-Users
-- Restaura TODOS los datos eliminados por el script 09.
-- REQUIERE que se ejecute en la MISMA SESIÓN de conexión
-- que el script 09 (porque usa tablas temporales).
--
-- ⚠️ IMPORTANTE: Solo funciona dentro de la misma conexión
--    que ejecutó el script 09. Las tablas temporales
--    se eliminan automáticamente al cerrar la conexión.
-- ============================================================

BEGIN;

-- Verificar que existen las tablas de respaldo
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_bak_user') THEN
        RAISE EXCEPTION 'Las tablas de respaldo no existen. Ejecuta 09-delete-all-stores-users.sql primero en la MISMA conexión.';
    END IF;
END $$;

-- Verificar que hay datos en el respaldo
DO $$
DECLARE
    total BIGINT;
BEGIN
    SELECT COUNT(*) INTO total FROM _bak_user;
    IF total = 0 THEN
        RAISE EXCEPTION 'La tabla de respaldo está vacía. No hay datos que restaurar.';
    END IF;
END $$;

SELECT '=== RESTAURANDO DATOS ===' AS seccion;

-- Restaurar en orden de dependencias (padres primero)

-- Nivel 1: Tablas raíz
INSERT INTO "User"            SELECT * FROM _bak_user;
INSERT INTO "Tenant"          SELECT * FROM (SELECT * FROM "Tenant") t
                               WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t2 WHERE t2."Id" = t."Id");

-- Nivel 2: Dependientes de User/Tenant
INSERT INTO "Owner"           SELECT * FROM _bak_owner;
INSERT INTO "ReSeller"        SELECT * FROM _bak_re_seller;
INSERT INTO "UserRole"        SELECT * FROM _bak_user_role;

-- Nivel 3: Dependientes de User/Owner/ReSeller
INSERT INTO "StoreUser"       SELECT * FROM _bak_store_user;
INSERT INTO "ReSellerOwner"   SELECT * FROM _bak_re_seller_owner;
INSERT INTO "RefreshTokens"   SELECT * FROM _bak_refresh_tokens;

-- Nivel 4: Store y dependientes
INSERT INTO "Store"           SELECT * FROM _bak_store;
INSERT INTO "StoreModule"     SELECT * FROM _bak_store_module;
INSERT INTO "StoreRoleFeature" SELECT * FROM _bak_store_role_feature;
INSERT INTO "StorePayment"    SELECT * FROM _bak_store_payment;
INSERT INTO "StoreUsage"      SELECT * FROM _bak_store_usage;

-- Nivel 5: Productos y dependientes
INSERT INTO "ProductCategory"     SELECT * FROM _bak_product_category;
INSERT INTO "Product"             SELECT * FROM _bak_product;
INSERT INTO "InventoryEntry"      SELECT * FROM _bak_inventory_entry;
INSERT INTO "Order"               SELECT * FROM _bak_order;
INSERT INTO "OrderItem"           SELECT * FROM _bak_order_item;
INSERT INTO "InventoryEntryCost"  SELECT * FROM _bak_inventory_entry_cost;

-- OutboxMessage
INSERT INTO "OutboxMessage"  SELECT * FROM _bak_outbox_message;

-- Verificar restauración
SELECT '=== VERIFICACIÓN POST-RESTAURACIÓN ===' AS seccion;

SELECT 'User' AS tabla, COUNT(*) AS registros FROM "User"
UNION ALL SELECT 'Store', COUNT(*) FROM "Store"
UNION ALL SELECT 'Owner', COUNT(*) FROM "Owner"
UNION ALL SELECT 'UserRole', COUNT(*) FROM "UserRole"
UNION ALL SELECT 'StoreUser', COUNT(*) FROM "StoreUser"
UNION ALL SELECT 'ProductCategory', COUNT(*) FROM "ProductCategory"
UNION ALL SELECT 'Product', COUNT(*) FROM "Product"
UNION ALL SELECT 'OrderItem', COUNT(*) FROM "OrderItem"
UNION ALL SELECT '"Order"', COUNT(*) FROM "Order"
UNION ALL SELECT 'RefreshTokens', COUNT(*) FROM "RefreshTokens"
ORDER BY 1;

COMMIT;

SELECT '✅ RESTAURACIÓN COMPLETADA EXITOSAMENTE' AS resultado;

-- Limpiar tablas temporales
DROP TABLE IF EXISTS _bak_inventory_entry_cost;
DROP TABLE IF EXISTS _bak_inventory_entry;
DROP TABLE IF EXISTS _bak_order_item;
DROP TABLE IF EXISTS _bak_order;
DROP TABLE IF EXISTS _bak_product;
DROP TABLE IF EXISTS _bak_product_category;
DROP TABLE IF EXISTS _bak_store_usage;
DROP TABLE IF EXISTS _bak_store_payment;
DROP TABLE IF EXISTS _bak_re_seller_owner;
DROP TABLE IF EXISTS _bak_re_seller;
DROP TABLE IF EXISTS _bak_store_user;
DROP TABLE IF EXISTS _bak_store_role_feature;
DROP TABLE IF EXISTS _bak_store_module;
DROP TABLE IF EXISTS _bak_user_role;
DROP TABLE IF EXISTS _bak_store;
DROP TABLE IF EXISTS _bak_owner;
DROP TABLE IF EXISTS _bak_user;
DROP TABLE IF EXISTS _bak_refresh_tokens;
DROP TABLE IF EXISTS _bak_outbox_message;

SELECT 'Tablas de respaldo eliminadas.' AS limpieza;
