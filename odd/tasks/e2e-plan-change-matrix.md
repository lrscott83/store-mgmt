# e2e-plan-change-matrix

## Objective

Cubrir con tests E2E nuevos (backend) TODAS las transiciones REALES de cambio de
plan (from ≠ to) que no asertan exactamente que, después del cambio, la tienda se
queda con los módulos y features del plan destino.

## Why / Context

El usuario pidió (2026-09-24): "Implementar tests e2e en el backend que cubran
todos los posibles combinaciones de cambios de planes de una tienda para que
despues del cambio assierten que la tienda se quede con los modulos y features
del plan que se cambió".

CORRECCIÓN DE DOMINIO (2026-09-24, decisión del usuario): los no-ops de mismo
plan (Gratis→Gratis, Pago→Pago, Superior→Superior, VIP→VIP) NO son cambios de
plan y NO deben incluirse en la matriz. Quedaron excluidos del archivo de tests.

Auditoría estricta final de las 12 transiciones reales:

| Transición | Cobertura previa | ¿Exacta? | Cobertura final |
|---|---|---|---|
| Gratis→Pago | B3 (`MeAfterOwnerPlanChangeTests`, vista StoreUser) | ✗ — solo `Contain` parcial, sin universo Pago exacto | **NUEVO aquí** |
| Gratis→Superior | solo `StorePlanId` | ✗ | este archivo |
| Gratis→VIP | — | ✗ | este archivo |
| Pago→Gratis | B3 (StoreUser) | ✓ (universe exacto de módulos) | queda en B3 |
| Pago→Superior | B1 (owner) | ✓ (universo exacto de módulos + features/roles) | queda en B1 |
| Pago→VIP | solo módulos en DB, sin readback /me | ✗ | este archivo |
| Superior→Gratis | B1 (owner) | ✓ (universo exacto + features NotContain) | queda en B1 |
| Superior→Pago | EM4/MM4 | ✗ — solo strips de Elaboración(17)/MultiMonedas(15), sin universo Pago positivo | **NUEVO aquí** |
| Superior→VIP | — | ✗ | este archivo |
| VIP→Gratis | — | ✗ | este archivo |
| VIP→Pago | — | ✗ | este archivo |
| VIP→Superior | — | ✗ | este archivo |

El archivo contiene los **9 casos** reales sin cobertura exacta.

## Autorizado

- Solo ADD de tests E2E nuevos: permitido por regla backend (AGENTS.md).
- NO se toca producción backend ni tests E2E existentes.
- NO se toca Angular ni frontend.
- Push/PR: decisión del usuario (reportar y preguntar al cerrar).

## Constraints / Hechos verificados (fuentes)

- Universo materializado por `ChangeStorePlanCommandHandler.ApplyPlanModules` =
  catálogo `PriceIncluded` ∪ miembros del `StorePlanModule` del plan destino.
  - `PriceIncluded` = [Sales=2, Inventory=3, Synchronization=4, Management=7]
    (`ModuleEntityTypeConfiguration.cs`).
  - Matriz de planes (`StorePlanModuleEntityTypeConfiguration.cs` + catalog test):
    - Gratis   = [2,3,4,5,7]
    - Pago     = [2,3,4,5,6,7,8,9,10,11]
    - Superior = [2,3,4,5,6,7,8,9,10,11,12,13,14,15,17]
    - VIP      = [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]
- Caller matrix: no-SuperAdmin solo puede apuntar a Gratis/Pago; Superior/VIP
  son SuperAdmin-reserved → llamador SA en esos casos (403 si no).
- `/me` con el MISMO token del owner re-computa por request: `StoreModuleIds`
  exacto del universo, `PlanType` "Free"/"Paid", `FeatureIds` (OwnerAdmin),
  `Roles` (por fila de StoreRoleFeature; NoTracking → aggregar con Distinct).
  - `FeatureIds` de StoreUser siempre vacío; aquí solo OwnerAdmin.
- Mapa módulo→features disponible-a-tienda (enum `StoreRoleFeatures.cs`, `[HasModule]`):
  - Sales(2): Products, Sale, TodayOrders, TodayOrdersStats
  - Inventory(3): Available, Entries, TodayInventoryStats, Egress, InventoryTodayQuantities, InventoryTodaySaleProfit
  - Synchronization(4): Send, Download, Receive
  - Reports(5): TodayReports
  - Statistics(6): Dashboard
  - Management(7): Profile, Users, Stores, Configurations
  - Expenses(8): TodayExpenses
  - Billing(9): Billing
  - Histories(10): SalesHistory, EntriesHistory, ExpensesHistory, CreditsHistory
  - Credits(11): CreditSale
  - WholesaleSales(12): WholesaleSales
  - Warehouses(13): Warehouses, WarehouseStockMovements
  - MultiStores(14): OwnerStores
  - MultiMonedas(15): MultiMonedas
  - MultiPayments(16): (ninguna — sin entrada StoreRoleFeatures)
  - Elaboration(17): Recipes, Elaborations
- Todo feature mapeado incluye OwnerAdmin en `[HasRoles]` → `FeatureIds` del
  owner contiene el set esperado del universo destino.
- Los tests usan `(int)ModuleType.X` / `(int)FeatureType.X` — nunca números
  hardcodeados (Egress=33, TodayInventoryStats=32 — fácil de confundir).

## Plan de implementación

### T1 — `backend/src/SMCA.WebApi.E2ETests/Plans/PlanChangeMatrixTests.cs` (NUEVO)

Un archivo, 9 `[Fact]` + runner compartido `AssertChangeKeepsTargetUniverseAsync`:
1. seed owner + tienda en el plan FROM con universo/features COMPLETOS de FROM
   (prueba que el cambio REEMPLAZA el set viejo: extras del plan anterior se retiran);
2. llamador por caller matrix (owner o SA);
3. POST `change-plan` → 200;
4. DB: `StorePlanId` == TO; `StoreModule` activos == universo TO exacto;
   `StoreRoleFeature` activos (distinct) == features TO exactas;
5. `/me` mismo token owner: `StoreModuleIds` == universo TO; `PlanType`;
   `FeatureIds` Contain(features TO) / NotContain(features retiradas);
   Roles módulos Contiene(TO sin featureless) / NotContain(retirados); roles
   features Contain/NotContain.
6. cleanup `AuthzSeed.CleanupStoreGraphAsync` + `DbTestHelpers.CleanupUserAsync` (SA).

Patrones copiados de `ChangeStorePlanTests.cs` / `MeAfterOwnerPlanChangeTests.cs`
(seed local, NO toca Infrastructure seeds compartidas).

### T2 — Verificación E2E

`dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter PlanChangeMatrix`
(requiere PostgreSQL localhost:5432, db `smca_test`). Suite completa: opcional
(gate, ver historia de flakiness en Engram obs 1041).

### T3 — Commit + reporte

Commit work-unit + reporte con los 9 casos enumerados; preguntar por push.

## Fuera de alcance

- Los no-ops de mismo plan quedan FUERA (no son cambios — decisión usuario 2026-09-24).
- No se refuerzan los 3 pares ya cubiertos con universe exacto (B1/B3).
- No se toca `MeAfterOwnerPlanChangeTests` / `ChangeStorePlanTests` existentes.
- No producción, no Angular.

## Estado (2026-09-24, segunda iteración)

### T1 — DONE

`PlanChangeMatrixTests.cs` con **9 casos** (7 originales + 2 nuevos tras la
auditoría estricta) y SIN no-ops:

1. Gratis → VIP (SA)
2. Pago → VIP (SA)
3. Superior → VIP (SA)
4. VIP → Gratis (owner)
5. VIP → Pago (owner)
6. VIP → Superior (SA)
7. Gratis → Superior (SA)
8. **Gratis → Pago (owner) — NUEVO**: la cobertura previa (B3) era vista
   StoreUser con `Contain` parcial; este caso aserta el universo Pago exacto
   (10 módulos) + features + roles con token del owner.
9. **Superior → Pago (owner) — NUEVO**: la cobertura previa (EM4/MM4) solo
   verificaba el STRIP de Elaboración/MultiMonedas; este caso aserta el universo
   Pago exacto positivo tras el downgrade (probar que el plan destino SE
   MANTIENE completo, no solo que lo premium se retira).

Hallazgo importante de la auditoría: la tabla previa del doc marcaba
Gratis→Pago y Superior→Pago como "ya cubiertos" — era incorrecto (criterio
suave). Con criterio exacto, esos dos eran los que faltaban.
También se corrigió el dominio: los no-ops NO son cambios.

Corrección de fuente durante la implementación: la **tabla Feature VIVA (DB
migrada) es la fuente autoritativa**, no el enum/código:

- `Egress(33)` y `StorePayment(91)` NO existen en la tabla Feature de `smca_test`
  aunque el seed de código (`FeatureEntityTypeConfiguration`) los define — drift
  seed/migración en el repo. `GetAvailableFeatureIdsByModuleIdsAsync([3])` devuelve
  `[30,31,32,34,35]` (sin 33); módulo 9 solo `[90]`.
- `MultiPayments(16)` SÍ tiene feature `44` en la tabla, pero no hay entrada
  `StoreRoleFeatures` con `[HasFeature(44)]` → el generador (líneas 19-21 de
  `StoreRoleFeatureGenerator.cs`) lo descarta silenciosamente → módulo 16 sin rows.
- El mapa `FeaturesByModule` del test espeja ambas realidades (verificado por SQL).

### T2 — DONE (evidencia observada)

- `dotnet test ... --filter FullyQualifiedName~PlanChangeMatrixTests` →
  **9/9 passed** (5 s).
- Regresión área tocada (`ChangeStorePlanTests`, `MeAfterOwnerPlanChangeTests`,
  `StorePlanChangeTests`, `StorePlanCatalogTests`, `ChangePlanPermissionFlipTests`)
  → **22/22 passed** (8 s) — corrida en la iteración anterior (el archivo solo
  perdió 3 no-ops y ganó 2 casos con el mismo runner; sin tocar esos archivos).
- Suite E2E completa: no corrida (gate/no-opcional según obs 1041); el cambio es un
  ADD puro de archivo nuevo con seed local propio.

### T3 — DONE (commits rehechos tras corrección)

- Commit work-unit: `cb331091` `test(e2e): cover every real plan-change transition with exact target modules/features`
  (historía reescrita sobre `e6ef35e1`; archivo + doc, sin no-ops, 9 casos).
- Push: decisión del usuario (preguntado al reportar; aún no pusheado).

## PRÓXIMO PASO (anotado en memoria)

Revisar los hallazgos importantes del drift Feature (33/91 ausentes, 44 sin
entrada StoreRoleFeatures) contra la BD del VPS en producción, con la consulta
podman proporcionada — requiere aprobación del usuario (producción backend).