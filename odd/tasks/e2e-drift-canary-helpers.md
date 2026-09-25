# Feature: e2e-drift-canary-helpers

**Objetivo**: (1) añadir un test canary E2E nuevo que haga VISIBLE el drift seed↔BD (features que el seed declara disponibles pero la BD migrada no tiene); (2) alinear los 3 helpers `FeaturesForModule` con el mapa calibrado vivo (quitar features fantasma 33/91, cubrir módulos 15/16/17 donde se usen).

**Autorización del usuario (2026-09-25)**: aprobó explícitamente (a) crear el test canary nuevo y (b) modificar EXACTAMENTE los 3 helpers E2E existentes listados abajo. Nada más: no tocar producción, no tocar otros E2E, no tocar frontend-react, no tocar Angular.

## Contexto / por qué

- BD local `smca_test` (fuente de verdad, consultada 2026-09-24): las features **33 (Egress)** y **91 (StorePayment)** NO existen como filas, aunque el enum `FeatureType`, el enum `StoreRoleFeatures` y el seed `FeatureEntityTypeConfiguration` (L151-158, L351-359) las declaran `AvailableToStore=true`. Drift seed/migración conocido (documentado en `PlanChangeMatrixTests.cs:98-106`), no arreglado.
- Los 3 helpers hardcodean 33/91 → los seeds pasan esos IDs al generador real; el generador filtra por enum (no valida BD) y crea SRF fantasma sin FK; `/me` los descarta por `FilterAvailableToStoreByIds` → tests verdes SILENCIOSAMENTE. Eso es lo que se corrige: el drift deja de estar escondido y las expectativas reflejan lo que la BD viva + generador pueden materializar.
- Módulo 16 (MultiPayments, feature 44) existe en BD pero NO tiene entrada en enum `StoreRoleFeatures` → el generador la descarta; el mapa calibrado fija `16 → []` (decisión de negocio pendiente aparte, NO incluida en este alcance).

## Tasks

### T1 — Canary seed↔BD: `backend/src/SMCA.WebApi.E2ETests/Features/FeatureSeedCoherenceTests.cs` (NUEVO)
- Test E2E que lee los seed declarations de `Feature` del modelo EF (`db.Model.GetEntityTypes()...GetSeedData()`) y los compara contra las filas vivas de la tabla `Feature` (con `IgnoreQueryFilters`).
- Invariante (solo dirección seed→BD, sin falsos positivos): **toda feature que el seed declara `AvailableToStore=true` debe existir viva con `IsActive=true` y `AvailableToStore=true`**.
- Diseñado para FALLAR hoy por 33/91 — esa es su función: señal visible de drift, no bug. Comentario de cabecera explica que es canary autorizado y que se pone verde al resolver la decisión 33/91 (arreglar seed o añadir migración); NO debilitarlo.
- Mensaje de fallo accionable: id, nombre (de `FeatureType`), módulo, estado seed vs estado live.
- Sin mutaciones: solo lectura; no tocar `FeatureSeed.cs` ni helpers de seed existentes.
- Patrón de fixture: copiar EXACTAMENTE la declaración de clase de un test hermano del directorio `Features/` (p. ej. `FeaturesListTests.cs`).

### T2/T3/T4 — Alinear helpers (EXISTENTES, autorizados por el usuario):
- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMePlanModulesTests.cs` — `FeaturesForModule` (~L415-431)
- `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterPlanTests.cs` — `FeaturesForModule` (~L409-425)
- `backend/src/SMCA.WebApi.E2ETests/Stores/StorePlanChangeTests.cs` — `FeaturesForModule` (~L470-486)

Reglas de alineación (referencia: `PlanChangeMatrixTests.FeaturesByModule` L108-126, mapa calibrado contra BD viva):
- Quitar 33 de la entrada Inventario → `[30,31,32,34,35]`.
- Quitar 91 de la entrada Facturación → `[90]`.
- Añadir 15 → `[43]`, 17 → `[120,121]`, 16 → `[]` (con comentario: feature 44 existe pero sin entrada `StoreRoleFeatures`, el generador la descarta) SOLO si el archivo ejerce esos módulos; no reintroducir entradas fantasma.
- NO cambiar aserciones, payloads de seed ni nombres de métodos; conservar firma del helper.

## Checks (Verification)

1. `dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`
2. `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthMePlanModulesTests|FullyQualifiedName~ExportOfflineRosterPlanTests|FullyQualifiedName~StorePlanChangeTests|FullyQualifiedName~PlanChangeMatrixTests|FullyQualifiedName~FeatureSeedCoherenceTests"` (10 min)
3. Resultado esperado: TODO PASS excepto `FeatureSeedCoherenceTests` → FAIL exactamente por 33/91 ausentes (mensaje accionable). Registro ambos.

## Estado

- [x] T1 canary creado y verificado (falla solo por 33/91)
- [x] T2/T3/T4 helpers alineados; tests verdes en filtered set

## Evidencia (2026-09-25, rama `feat/e2e-drift-canary`)

- Build: `dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` → `Build succeeded. 0 Error(s)` (8 warnings NU1902/NU1903 preexistentes).
- Filtered: `dotnet test ... --filter "FullyQualifiedName~AuthMePlanModulesTests|FullyQualifiedName~ExportOfflineRosterPlanTests|FullyQualifiedName~StorePlanChangeTests|FullyQualifiedName~PlanChangeMatrixTests|FullyQualifiedName~FeatureSeedCoherenceTests"` → `Failed: 1, Passed: 37, Total: 38`. El único fallo es el canary intencional:
  ```
  Seed-to-database Feature drift detected (2 discrepancies):
  FeatureId=33 (Egress), ModuleId=3 | seed: IsActive=True, AvailableToStore=True | live: missing
  FeatureId=91 (StorePayment), ModuleId=9 | seed: IsActive=True, AvailableToStore=True | live: missing
  ```
- Helpers alineados: `AuthMePlanModulesTests.cs:418,424`, `ExportOfflineRosterPlanTests.cs:412,418`, `StorePlanChangeTests.cs:473,479` — Inventory `[30,31,32,34,35]`, Billing `[90]`. No se añadieron 15/16/17 porque esos archivos no ejercitan esos módulos.
- Canary: `FeatureSeedCoherenceTests.cs` (74 líneas, `[Collection("e2e")]`); usa `db.GetService<IDesignTimeModel>().Model...GetSeedData()` (EF8 lanza `InvalidOperationException` sobre `db.Model` optimizado). Solo lectura.
- `git diff --check`: exit 0. Diff rastreado: 3 archivos, 6 inserciones, 6 eliminaciones + 1 archivo nuevo.

## Rutas / decisiones

- Rama: `feat/e2e-drift-canary` (creada desde `qa`; push/PR siguen siendo decisión del usuario).
- RDD: global `on` — tras commit, el orquestador corre `gentle-ai review assess` sobre el rango commiteado y sigue el tier.
- Dependencias de BD: PostgreSQL local `localhost:5432`, DB `smca_test` (la migra `WebAppFixture`).