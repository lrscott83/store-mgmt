-- =====================================================
-- 31: Catalogo publico — PLANTILLA (vista) por tienda
--     Add-StoreCatalogSettings-TemplateId
--     Agrega la columna "TemplateId" (character varying(64) NOT NULL DEFAULT 'default')
--     a "StoreCatalogSettings". Es la vista/plantilla con la que el catalogo publico
--     pinta la tienda; por defecto la actual ("default"). NO es un color (eso es
--     "PaletteId", que sigue sin escribirse). Las filas existentes quedan backfilleadas
--     a 'default' por el DEFAULT de la columna.
-- Migracion EF: 20261009182159_Add-StoreCatalogSettings-TemplateId
-- Fecha: 2026-10-09
--
-- GENERADO con: dotnet ef migrations script 20261008021950_Add-StoreCatalogImages
--   (migracion unica: -From es la ANTERIOR y -To se omite, per la regla del repo)
--
-- Paridad: el cuerpo del script sigue la migracion que emitio EF (ALTER que agrega la columna +
--         INSERT del historial). El ALTER va envuelto en un `DO $$ ... IF NOT EXISTS` para que el
--         script sea idempotente (mismo patron que el script 16), y el INSERT del historial lleva
--         `ON CONFLICT ("MigrationId") DO NOTHING`, mas este header y los SELECT de verificacion
--         posteriores al COMMIT. La sentencia ALTER es la de EF; el guardian de idempotencia no la
--         reescribe.
--         Requiere: script 30 (20261008021950_Add-StoreCatalogImages) aplicado.
--
-- =====================================================

START TRANSACTION;

-- --- Add column StoreCatalogSettings.TemplateId (si no existe) ---
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'StoreCatalogSettings' AND column_name = 'TemplateId'
    ) THEN
        ALTER TABLE "StoreCatalogSettings" ADD "TemplateId" character varying(64) NOT NULL DEFAULT 'default';
    END IF;
END $$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261009182159_Add-StoreCatalogSettings-TemplateId', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- =====================================================
-- Verificacion posterior (ejecutar a mano; no forma parte de la migracion).
-- Esperado:
--   * la columna existe, es character varying(64), NOT NULL, default 'default'
--   * todas las filas preexistentes tienen 'default'
--   * la migracion quedo en el historial
-- =====================================================

SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'StoreCatalogSettings' AND column_name = 'TemplateId';

SELECT "Id", "StoreId", "TemplateId"
FROM "StoreCatalogSettings";

SELECT "MigrationId"
FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261009182159_Add-StoreCatalogSettings-TemplateId';

-- =====================================================
-- ROLLBACK (inverso de la migracion, ejecutar a mano solo si hace falta).
-- Mismo orden que el Down() de la migracion: primero la columna, luego la fila del historial.
--
-- BEGIN;
-- ALTER TABLE "StoreCatalogSettings" DROP COLUMN IF EXISTS "TemplateId";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261009182159_Add-StoreCatalogSettings-TemplateId';
-- COMMIT;
-- =====================================================
