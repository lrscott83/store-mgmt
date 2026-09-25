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

## RDD (2026-09-25)

- Commit evaluado: `16d23091aae066bbe09dff35544501c875d298a4` (base-ref: `qa`, `--committed-only`).
- `gentle-ai review assess --cwd . --agent opencode --base-ref qa --committed-only --json` → `review_due: true` (`high_risk` / `unassessable`: runtime OpenCode no elegible para immutable receipt review; soportados claude-code/codex).
- STATUS preflight → `gentle-ai.review-integration.failure/v2`, `immutable_review_transport_unsupported`, `next_action: stop`, `retry_safe: false`.
- Outcome: **unavailable** — el boundary NO avanza; RDD sigue `on` (global, decidido por el usuario). Mismo escenario que memoria #1342 (work-unit 9c984521) y aquí documentado para este commit.
- Commit T8 `41a039fc` (2026-09-25): `gentle-ai review assess --cwd . --agent opencode --base-ref 331ac947 --committed-only --json` → `review_due: true` (`high_risk` / `unassessable`, runtime no elegible; candidate `consumed: false`). STATUS preflight → mismo `failure/v2`, `immutable_review_transport_unsupported`, `next_action: stop`, `retry_safe: false`. Outcome: **unavailable**; boundary NO avanza; RDD sigue `on`. Sin handoff (limitación de runtime, no defecto de Gentle AI).
- Sin handoff de defecto: limitación documentada del runtime, no defecto de Gentle AI.

## Fase 2 — Decisión de negocio 33/91 + 44 en mapping (autorizada 2026-09-25)

**Autorización del usuario (2026-09-25, segunda)**: (a) añadir 44 al enum `StoreRoleFeatures` "como se debe" (PRODUCCIÓN); (b) actualizar las BD locales `smca` (prod) y `smca_test` (test) a catálogo completo; (c) entregar evidencia de que los tests que esperaban la BD rota ya no pasan con 33/91 presentes.

### T5 — Entrada 44 (MultiPayments) en StoreRoleFeatures (PRODUCCIÓN, autorizado)
- `backend/src/Domain/Common/Enums/StoreRoleFeatures.cs`: nueva región `MultiPayments features` con `MultiPaymentsAdmin` = `[HasRoles(OwnerAdmin, StoreUser)] [HasFeature(FeatureType.MultiPayments)] [HasModule(ModuleType.MultiPayments)]`. Comentario: 44 es VIP-only (módulo 16 solo en plan VIP).
- ANTES: feature 44 existía en BD (smca_test) pero sin entrada enum → `StoreRoleFeatureGenerator` la descartaba (L19-21). AHORA el generador la materializa para tiendas VIP.

### T6 — Backfill catálogo en BD locales (ambiente, autorizado)
- `smca` (prod local, 127.0.0.1): faltaban módulos 15/16/17 + features 43/44/91/120/121 + planmodule 3+15, 3+17, 4+15, 4+16, 4+17. Insertados (idempotente `ON CONFLICT DO NOTHING`, script `C:\Users\Appollo\AppData\Local\Temp\opencode\backfill_catalog.sql`).
- `smca_test` (localhost:5432): faltaban SOLO features 33 y 91 (módulos y planmodule ya completos). Insertados 33/91.
- Resultado verificado en ambas: `modules=17, features=42`; key features 33/43/44/91/120/121 presentes (query `q_key_features.sql`).

### T7 — Evidencia: tests tras insertar 33/91 y añadir 44 (2026-09-25)
- `FeatureSeedCoherenceTests` (canary): **PASS** — ya no hay drift seed↔BD (era el único test que fallaba intencionalmente por 33/91 ausentes).
- `PlanChangeMatrixTests`: **5/9 FAIL** — el mapa `FeaturesByModule` (L98-126) sigue calibrado contra la BD rota. El runner lee `StoreRoleFeature` REAL de la BD tras el change-plan (L210-215):
  - `SuperAdmin_upgrades_pago_to_vip` → esperado 32, actual 33 (**+44** MultiPayments ahora materializado por el enum).
  - `SuperAdmin_upgrades_gratis_to_superior` → esperado 32, actual 33 (**+91** StorePayment).
  - `Owner_upgrades_gratis_to_pago` → esperado 25, actual 26 (**+91**).
  - `SuperAdmin_upgrades_superior_to_vip` → FAIL (mismo patrón).
  - `SuperAdmin_upgrades_gratis_to_vip` → esperado 32, actual 34 (**+44, +91**).
  - Los 4 downgrades pasan. Es la evidencia pedida: los tests que congelaron la realidad vieja ya no pasan.
- Helpers alineados (29 tests de `AuthMePlanModulesTests`, `ExportOfflineRosterPlanTests`, `StorePlanChangeTests`): **PASS** — alimentan el generador con sus propios featureIds (no leen la BD); el canary es quien valida seed↔BD.

### Pendiente (requiere autorización — E2E existentes intocables)
- Re-calibrar `PlanChangeMatrixTests.FeaturesByModule`: Billing `[90]` → decidir +91; `MultiPayments []` → `[44]`; revisar Inventory +33 (Egress es OwnerAdmin/Inventory, en /me del owner SÍ debe aparecer).
- Decidir si los 3 helpers re-incluyen 33 (Egress) en Inventory ahora que la BD lo tiene; 91 (StorePayment) es SuperAdmin/ReSeller → NO afecta al owner (helpers de owner), confirmar.

### T8 — Re-calibración matrix + helpers (autorizada 2026-09-25, tercera)

**Autorización del usuario**: "Sí, matrix + helpers (Recommended)" — actualizar `PlanChangeMatrixTests.FeaturesByModule` Y los 3 helpers.

Decisión de calibración (validada contra el mecanismo real del change-plan y las roles del enum `StoreRoleFeatures`):
- `PlanChangeMatrixTests.FeaturesByModule`:
  - Inventory: `[30,31,32,34,35]` → `[30,31,32,33,34,35]` — Egress(33) ya vive en BD y `EgressAdmin` es OwnerAdmin → el owner SÍ lo ve en `/me`.
  - Billing: **permanece `[90]`** — `StorePaymentAdmin`(91) es SOLO SuperAdmin/ReSeller; el change-plan lo materializa al insertar Billing, pero el owner jamás lo recibe. Meter 91 al mapa rompería la aserción `/me` (`me.FeatureIds.Should().Contain(...)`).
  - MultiPayments: `[]` → `[44]` — `MultiPaymentsAdmin` (OwnerAdmin+StoreUser) materializa 44 en tiendas VIP.
  - Fix estructural añadido: la lectura DB del runner (`activeFeatureIds`, L210-215) ahora **filtra `RoleId == (int)RoleType.OwnerAdmin`** — antes leía TODAS las roles; las filas SuperAdmin/ReSeller de 91 aparecían tras insertar Billing. El DB scoped al owner coincide con `/me`.
- Los 3 helpers (`AuthMePlanModulesTests`, `ExportOfflineRosterPlanTests`, `StorePlanChangeTests`): Inventory `[30,31,32,34,35]` → `[30,31,32,33,34,35]`. Billing permanece `[90]` (los 3 son owner-delegación: `SeedOwnerAdminWithModulesAsync` + `UserRole` OwnerAdmin). NO se añadió 91 en ningún helper.
- No se tocó `FeatureSeedCoherenceTests` (canary) — ya pasa.

Evidencia T8 (2026-09-25): filtered set completo → `Failed: 0, Passed: 38, Total: 38` (9 matrix + 1 canary + 28 helpers). Los 5 fallos previos quedan verdes con la BD corregida (17 módulos/42 features/44 en VIP).

## Rutas / decisiones

- Rama: `feat/e2e-drift-canary` (creada desde `qa`; push/PR siguen siendo decisión del usuario).
- RDD: global `on` — tras commit, el orquestador corre `gentle-ai review assess` sobre el rango commiteado y sigue el tier.
- Dependencias de BD: PostgreSQL local `localhost:5432`, DB `smca_test` (la migra `WebAppFixture`).
- Pendiente resuelto 2026-09-25: `docs/plans/2026-09-24-revisar-e2e-expectativa-contra-bd.md` corregido (commit `7ca652fc`) — marcado resuelto para BD locales, VPS pendiente de confirmar.