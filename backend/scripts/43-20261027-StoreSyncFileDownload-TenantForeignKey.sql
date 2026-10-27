-- 43-20261027-StoreSyncFileDownload-TenantForeignKey.sql
-- EF migration: 20261027183707_StoreSyncFileDownload-TenantForeignKey
-- Date: 2026-10-27
-- Endurece el aislamiento entre tenants de las marcas de descarga del repositorio de ficheros de
-- sincronización del POS (hallazgo R1 del review del esquema):
--   * StoreSyncFile gana la clave alterna (Id, TenantId).
--   * StoreSyncFileDownload ata su TenantId al del fichero con una FK COMPUESTA
--     (StoreSyncFileId, TenantId) -> (Id, TenantId), en lugar de confiar en que cada handler copie
--     la columna desde el contexto correcto. Una marca no puede quedar en un tenant distinto al de
--     su fichero ni por error ni por una escritura futura.
-- La FK simple anterior (solo StoreSyncFileId) se sustituye por la compuesta: no se pierde ninguna
-- garantía, se añade una.
-- Prerequisites: 20261027154811_Add-StoreSyncFiles applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261027154811_Add-StoreSyncFiles
-- (single new migration -> -From the PREVIOUS one, no -To). Only this header, the
-- __EFMigrationsHistory guard, the manual ROLLBACK note and the verification queries were
-- added by hand. The DDL body is EF's output, unchanged.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   ALTER TABLE "StoreSyncFileDownload" DROP CONSTRAINT "FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId_TenantId";
--   DROP INDEX "IX_StoreSyncFileDownload_StoreSyncFileId_TenantId";
--   ALTER TABLE "StoreSyncFile" DROP CONSTRAINT "AK_StoreSyncFile_Id_TenantId";
--   ALTER TABLE "StoreSyncFileDownload" ADD CONSTRAINT "FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId"
--     FOREIGN KEY ("StoreSyncFileId") REFERENCES "StoreSyncFile" ("Id") ON DELETE RESTRICT;
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261027183707_StoreSyncFileDownload-TenantForeignKey';
-- COMMIT;

START TRANSACTION;

ALTER TABLE "StoreSyncFileDownload" DROP CONSTRAINT "FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId";

ALTER TABLE "StoreSyncFile" ADD CONSTRAINT "AK_StoreSyncFile_Id_TenantId" UNIQUE ("Id", "TenantId");

CREATE INDEX "IX_StoreSyncFileDownload_StoreSyncFileId_TenantId" ON "StoreSyncFileDownload" ("StoreSyncFileId", "TenantId");

ALTER TABLE "StoreSyncFileDownload" ADD CONSTRAINT "FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId_TenantId" FOREIGN KEY ("StoreSyncFileId", "TenantId") REFERENCES "StoreSyncFile" ("Id", "TenantId") ON DELETE RESTRICT;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261027183707_StoreSyncFileDownload-TenantForeignKey', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261027183707_StoreSyncFileDownload-TenantForeignKey';

SELECT conname FROM pg_constraint
WHERE conname IN ('AK_StoreSyncFile_Id_TenantId',
                  'FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId_TenantId',
                  'FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId')
ORDER BY conname;
