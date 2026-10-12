-- =====================================================
-- 33: Catalogo publico — elementos por fila en MOVIL
--     Add-StoreCatalogSettings-MobileColumns
--     Agrega la columna "MobileColumns" (integer NOT NULL DEFAULT 2)
--     a "StoreCatalogSettings": cuantos elementos por fila muestra la rejilla
--     del catalogo publico en movil (1 o 2). Solo la usa la plantilla "default";
--     "boutique" lo ignora. Las filas existentes quedan backfilleadas a 2 (el
--     comportamiento actual) por el DEFAULT de la columna, asi que ninguna tienda
--     "default" cambia de aspecto al migrar.
-- Migracion EF: 20261012143222_Add-StoreCatalogSettings-MobileColumns
-- Fecha: 2026-10-12
--
-- GENERADO con: dotnet ef migrations script 20261009182159_Add-StoreCatalogSettings-TemplateId
--   (migracion unica: -From es la ANTERIOR y -To se omite, per la regla del repo)
--
-- Paridad: el cuerpo del script sigue la migracion que emitio EF (ALTER que agrega la columna +
--         INSERT del historial). El ALTER va envuelto en un `DO $$ ... IF NOT EXISTS` para que el
--         script sea idempotente (mismo patron que el script 32), y el INSERT del historial lleva
--         `ON CONFLICT ("MigrationId") DO NOTHING`, mas este header y los SELECT de verificacion
--         posteriores al COMMIT. La sentencia ALTER es la de EF; el guardian de idempotencia no la
--         reescribe.
--         Requiere: script 32 (20261009182159_Add-StoreCatalogSettings-TemplateId) aplicado.
--
-- =====================================================

START TRANSACTION;

-- --- Add column StoreCatalogSettings.MobileColumns (si no existe) ---
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'StoreCatalogSettings' AND column_name = 'MobileColumns'
    ) THEN
        ALTER TABLE "StoreCatalogSettings" ADD "MobileColumns" integer NOT NULL DEFAULT 2;
    END IF;
END $$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261012143222_Add-StoreCatalogSettings-MobileColumns', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- =====================================================
-- Verificacion posterior (ejecutar a mano; no forma parte de la migracion).
-- Esperado:
--   * la columna existe, es integer, NOT NULL, default 2
--   * todas las filas preexistentes tienen 2
--   * la migracion quedo en el historial
-- =====================================================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'StoreCatalogSettings' AND column_name = 'MobileColumns';

SELECT "Id", "StoreId", "MobileColumns"
FROM "StoreCatalogSettings";

SELECT "MigrationId"
FROM "__EFMigrationsHistory"
WHERE "MigrationId" LIKE '%Add-StoreCatalogSettings-MobileColumns%';

-- =====================================================
-- ROLLBACK (manual, si hiciera falta revertir):
--   DELETE FROM "__EFMigrationsHistory"
--   WHERE "MigrationId" = '20261012143222_Add-StoreCatalogSettings-MobileColumns';
--   ALTER TABLE "StoreCatalogSettings" DROP COLUMN "MobileColumns";
-- =====================================================
