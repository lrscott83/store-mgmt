-- ============================================================
-- 11: Verify-Cleanup
-- Verifica el estado actual de la base de datos.
-- Útil después de ejecutar 09 o 10 para confirmar resultados.
-- ============================================================

-- Estado actual de todas las tablas
SELECT '=== ESTADO ACTUAL DE TABLAS ===' AS seccion;

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
UNION ALL SELECT 'StorePaymentStatus', COUNT(*) FROM "StorePaymentStatus"
UNION ALL SELECT 'StoreUsage', COUNT(*) FROM "StoreUsage"
UNION ALL SELECT 'ProductCategory', COUNT(*) FROM "ProductCategory"
UNION ALL SELECT 'Product', COUNT(*) FROM "Product"
UNION ALL SELECT 'OrderItem', COUNT(*) FROM "OrderItem"
UNION ALL SELECT '"Order"', COUNT(*) FROM "Order"
UNION ALL SELECT 'InventoryEntry', COUNT(*) FROM "InventoryEntry"
UNION ALL SELECT 'InventoryEntryCost', COUNT(*) FROM "InventoryEntryCost"
UNION ALL SELECT 'RefreshTokens', COUNT(*) FROM "RefreshTokens"
UNION ALL SELECT 'Module', COUNT(*) FROM "Module"
UNION ALL SELECT 'Feature', COUNT(*) FROM "Feature"
UNION ALL SELECT 'Role', COUNT(*) FROM "Role"
UNION ALL SELECT 'Tenant', COUNT(*) FROM "Tenant"
UNION ALL SELECT 'SystemConfiguration', COUNT(*) FROM "SystemConfiguration"
UNION ALL SELECT 'OutboxMessage', COUNT(*) FROM "OutboxMessage"
ORDER BY 1;

-- Resumen de Seed Data (no debe ser afectado)
SELECT '=== SEED DATA (NO DEBE CAMBIAR) ===' AS seccion;

SELECT 'Module' AS tabla, COUNT(*) AS registros, COUNT(*) > 0 AS tiene_datos FROM "Module"
UNION ALL SELECT 'Role', COUNT(*), COUNT(*) > 0 FROM "Role"
UNION ALL SELECT 'Tenant', COUNT(*), COUNT(*) > 0 FROM "Tenant"
UNION ALL SELECT 'Feature', COUNT(*), COUNT(*) > 0 FROM "Feature"
UNION ALL SELECT 'StorePaymentStatus', COUNT(*), COUNT(*) > 0 FROM "StorePaymentStatus"
ORDER BY 1;

-- Verificar Admin seed
SELECT '=== USUARIO ADMIN ===' AS seccion;
SELECT "Id", "Login", "FullName", "Email", "SelectedStoreId", "TenantId", "IsActive"
FROM "User"
WHERE "Login" = 'admin';

-- Migraciones aplicadas
SELECT '=== MIGRACIONES ===' AS seccion;
SELECT COUNT(*) AS total_migraciones,
       MAX("MigrationId") AS ultima_migration
FROM "__EFMigrationsHistory";

-- Tablas de respaldo (solo existen si se ejecutó 09 en esta sesión)
SELECT '=== RESPALDOS TEMPORALES ===' AS seccion;
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_bak_user')
        THEN 'EXISTEN (se pueden restaurar con script 10)'
        ELSE 'NO EXISTEN (respaldo no disponible en esta sesión)'
    END AS estado_respaldo;

-- Espacio de disco de la BD
SELECT '=== TAMAÑO BD ===' AS seccion;
SELECT pg_size_pretty(pg_database_size('smca')) AS tamano_bd;
