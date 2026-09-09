-- =====================================================
-- 14: Add StorePlanModule table (Plan -> Module assignment)
--     + complete explicit seed per plan (Gratis/Pago/Superior/VIP)
-- EF migration: 20260908194919_Add-StorePlanModules
-- Date: 2026-09-08
-- Parity: CREATE TABLE + seed mirror the EF migration exactly.
--         Runs AFTER scripts 12 (StorePlan) and 13 (modules 12/14):
--         both FK targets must exist (Restrict).
-- =====================================================

BEGIN;

-- --- Table: StorePlanModule (composite PK PlanId, ModuleId) ---
CREATE TABLE IF NOT EXISTS "StorePlanModule" (
    "PlanId" integer NOT NULL,
    "ModuleId" integer NOT NULL,
    CONSTRAINT "PK_StorePlanModule" PRIMARY KEY ("PlanId", "ModuleId"),
    CONSTRAINT "FK_StorePlanModule_Module_ModuleId"
        FOREIGN KEY ("ModuleId") REFERENCES "Module" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_StorePlanModule_StorePlan_PlanId"
        FOREIGN KEY ("PlanId") REFERENCES "StorePlan" ("Id") ON DELETE RESTRICT
);

-- --- Seed: complete explicit module set per plan ---
-- Gratis (1): Ventas, Inventario, Sincronización, Reportes, Gestión
INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (1, 2), (1, 3), (1, 4), (1, 5), (1, 7)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

-- Pago (2): Gratis + Estadísticas, Ventas Mayoristas, Gastos, Facturación, Historiales, Créditos
INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (2, 2), (2, 3), (2, 4), (2, 5), (2, 6), (2, 7), (2, 8), (2, 9), (2, 10), (2, 11), (2, 12)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

-- Superior (3): TODOS los módulos AvailableToStore
INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (3, 2), (3, 3), (3, 4), (3, 5), (3, 6), (3, 7), (3, 8), (3, 9), (3, 10), (3, 11), (3, 12), (3, 13), (3, 14)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

-- VIP (4): TODOS los módulos AvailableToStore
INSERT INTO "StorePlanModule" ("PlanId", "ModuleId")
VALUES (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (4, 7), (4, 8), (4, 9), (4, 10), (4, 11), (4, 12), (4, 13), (4, 14)
ON CONFLICT ("PlanId", "ModuleId") DO NOTHING;

CREATE INDEX IF NOT EXISTS "IX_StorePlanModule_ModuleId"
    ON "StorePlanModule" ("ModuleId");

-- --- Register the EF migration so `dotnet ef database update` stays in sync ---
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260908194919_Add-StorePlanModules', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- --- Verification ---
SELECT sp."Id" AS plan_id, sp."Name" AS plan_name,
       COUNT(spm."ModuleId") AS module_count,
       array_agg(spm."ModuleId" ORDER BY spm."ModuleId") AS module_ids
FROM "StorePlan" sp
LEFT JOIN "StorePlanModule" spm ON spm."PlanId" = sp."Id"
GROUP BY sp."Id", sp."Name"
ORDER BY sp."Id";

-- =====================================================
-- ROLLBACK (inverse operations, run manually if needed):
--
-- BEGIN;
-- DROP TABLE "StorePlanModule";
-- DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260908194919_Add-StorePlanModules';
-- COMMIT;
-- =====================================================