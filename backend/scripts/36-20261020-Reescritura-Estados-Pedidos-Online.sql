-- 36-20261020-Reescritura-Estados-Pedidos-Online.sql
-- EF migration: 20261020141225_Reescritura-Estados-Pedidos-Online
-- Date: 2026-10-20
-- Reescribe la máquina de estados del pedido online a Creado=0, Preparado=1, Transportando=2,
-- Entregado=3, Cancelado=10, y añade "CancellationReason" (texto libre, NULL salvo al cancelar).
--
-- DATA MIGRATION: el UPDATE no filtra a propósito. Ningún valor anterior sobrevive con el mismo
-- significado (Delivered era 4 y Cancelled era 5; Accepted/Preparing/Ready desaparecen), así que
-- TODA fila existente vuelve a Creado. El estado anterior no es reconstruible: el Down devuelve el
-- esquema, no los datos.
-- Prerequisites: 20261019160559_AddStoreLocationFields applied.
--
-- GENERATED from the EF migration with
--   dotnet ef migrations script 20261019160559_AddStoreLocationFields
-- (single new migration → -From the PREVIOUS one, no -To). The UPDATE was authored inside the
-- migration's Up(); only this header, the __EFMigrationsHistory guard, the manual ROLLBACK note
-- and the verification queries were added by hand.
--
-- ROLLBACK (manual; EF does not emit it):
-- BEGIN;
--   ALTER TABLE "Order" DROP COLUMN "CancellationReason";
--   DELETE FROM "__EFMigrationsHistory"
--     WHERE "MigrationId" = '20261020141225_Reescritura-Estados-Pedidos-Online';
-- COMMIT;
-- NOTE: rolling back does NOT restore the per-row statuses the UPDATE discarded.

START TRANSACTION;

ALTER TABLE "Order" ADD "CancellationReason" text;

UPDATE "Order" SET "Status" = 0;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261020141225_Reescritura-Estados-Pedidos-Online', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verification
SELECT "MigrationId" FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261020141225_Reescritura-Estados-Pedidos-Online';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Order'
  AND column_name = 'CancellationReason';

-- Toda fila debe estar en Creado (0) y sin razón de cancelación.
SELECT "Status", COUNT(*) AS orders
FROM "Order"
GROUP BY "Status"
ORDER BY "Status";

SELECT COUNT(*) AS orders_with_reason
FROM "Order"
WHERE "CancellationReason" IS NOT NULL;
