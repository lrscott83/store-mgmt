# Feature: elaboration-module (Módulo de Elaboración — recetas, elaboraciones, costo real)

Plan técnico: `docs/plans/2026-09-04-elaboration-module.md` (referencia; ajustado a la arquitectura vigente 2026-09-18).
Workflow: **ODD** (Organic Driven Development). Rama: `dev` (no es la default `main` → se trabaja aquí).
Entrega: commits por unidad de trabajo en `dev`; push/PR = decisión del usuario. Si el usuario pide PRs,
preguntar una vez la estrategia de cadena (`stacked-to-main` vs `feature-branch-chain`) y resolver las
skills `work-unit-commits` / `chained-pr` por registry antes de planear PRs.

## ESTADO ACTUAL (2026-09-18, fin de sesión)

- **T1 (backend): CERRADA y verde.** Commits en `dev`: `15684b91` (T1 inicial) + `a59529f6` (renumeración).
  - Migración generada: **`20260918153139_Add-Elaboration-Module`**; script **`19-20260918-Add-Elaboration-Module.sql`**.
  - `smca_test` **reconstruida** (drop vía psql + `dotnet ef database update`): 25 migraciones aplicadas.
  - Verificación observada: `dotnet build` 0 errores; Domain.UnitTests **27/27**; Application.Tests **492/492**;
    E2E backend **539/539** (suite completa, BD fresca).
- **T2: CERRADA** (commit `8b7313c7`, domain 144/144). **T4–T8: PENDIENTES** (ver sección Tasks).
- **Advisories T5+T6: CERRADAS y REVISADAS** — commits `b8489401` (UI) y `4c69992c` (sync).
  - `b8489401`: clamp de cantidades reales negativas a 0; actuales editados pasan de record por `productId` a array
    posicional (filas/inputs/badges por índice → insumos duplicados independientes); el efecto de invalidación limpia
    también el error previo; + tests del camino real editado y de la rama de edición de recetas.
  - `4c69992c`: el merge de recetas resuelve "una activa por producto" sobre el **estado final** del lote (order-independent);
    el merge de elaboraciones degrada a no-op cuando no se inyectó el servicio de almacenes; + tests break-only con fila previa.
  - Verificado: `app/inventory` **467/467**, `app/sync` **143/143**, typecheck **0**, lint **0**. (El baseline de sync es **139**,
    no 147: 147 incluía `store-data-reset.test.ts` de otra carpeta.)
  - Review `review-fad9d149f17dced5`: **APPROVED + acknowledged** (`authority: burned`). Advisories NUEVOS:
    `R3-WAREHOUSE-NOOP` (WARNING — el fix de B2 hace que, sin `warehouseService`, un import no vacío de elaboraciones se
    **descarte en silencio** con `succeeded: true`; el reviewer sostiene que un error de configuración debería surfacearse) y
    `R3-CLAMP-SILENT` (SUGGESTION — el clamp a 0 no avisa al usuario y el input sigue mostrando el negativo).
  - **Residuales conocidos (no resueltos)**: (a) el SERVICIO colapsa `actualComponents` por `productId` (last-wins) → dos filas
    duplicadas con cantidades distintas guardan 2×la última y el preview puede diferir del costo guardado (requiere guard en el
    formulario de recetas o cambio de servicio); (b) el all-or-nothing total de un lote inválido no se implementó porque un test
    existente fija la persistencia parcial break-only.
- **Backlog post-módulo — ítem 5 (HECHO)**: borrados los 8 specs scratch **untracked y gitignored** de `frontend-react/e2e/diag-tmp/`
  (diag2–diag9, ninguno versionado); quedan **88 specs** en `e2e/` y ninguno de ellos era el que fallaba por contaminación de la suite.
- **Backlog post-módulo — ítem 4 (HECHO, con evidencia, sin worktree)**: los 10 fallos deterministas **no** son regresión del módulo.
  Evidencia: (a) ninguna de las claves i18n que agregamos está duplicada en `es.ts` (una repetición habría pisado el valor previo);
  (b) ninguno de los 10 specs ni de los support files existentes fue modificado por los commits del módulo (solo se agregaron
  archivos NUEVOS de E2E); (c) el fallo sensible a menú/i18n (`owner-plan-change-dialog:67`) espera `"Plan Gratis"`, texto que **no
  existe** en la app — los tests unitarios pre-existentes afirman `"Plan: Gratis"`, así que su expectativa está desactualizada.
  **No se corrió un worktree pre-módulo** (requeriría instalar dependencias + backend + BD): la certeza total sobre los 9 restantes
  queda pendiente si se quiere.
- **Backlog post-módulo — ítem 3 (HECHO)**: guard de insumos duplicados en el formulario de recetas (commit `3e411ee`, 3 archivos, +93, cero borrados):
  detecta un `productId` repetido, mantiene Guardar deshabilitado y muestra `RECIPE.DUPLICATE_COMPONENT`; no filtra opciones, así que una
  receta vieja con duplicados se puede ver y corregir. Verificado: `app/inventory` **469/469**, typecheck 0, lint 0.
  Review `review-e5c615e9c4d593cc`: **APPROVED con CERO hallazgos** (`authority: burned`) — la única revisión del módulo sin advisories.
  Cierra el residual de "preview ≠ costo guardado" para datos NUEVOS (el servicio sigue colapsando duplicados si existieran de antes).
- **Backlog post-módulo — ítem 3 original (smoke manual UI export→import)**: lo hace el usuario.
- **T8: CERRADA** — commit `7591075a` (solo docs): nota de despliegue en el README (§4: EF `database update` o script
  `19-20260918-Add-Elaboration-Module.sql`, backup primero, `graphify update .` tras el merge) + checkboxes del plan (T1–T7)
  con las notas de realidad (módulo 17, no 12; `entity-migration`/`store-data-reset` sin código nuevo).
  - **Verificación completa observada**: `dotnet build` **0 errores** (189 warnings pre-existentes); Domain **27/27**;
    Application **492/492**; turbo **12/12 workspaces** OK; **backend E2E 538/539**; Playwright ya catalogado (269/11/19).
  - **El único fallo de backend E2E NO es nuestro**: `StorePlanCatalogTests.StorePlanModule_seed_matches_documented_plan_matrix`
    falla porque la base **compartida** `smca_test` tiene aplicada una migración **out-of-tree** del otro clon/branch
    (`20260918131144_Add-MultiPayments-Module-And-Payment-Mirror`, módulo 16) que este checkout no tiene en código → la matriz
    documentada de VIP no la espera. Elaboración (17) sí está y EM1–EM6 pasan. **Remedio**: reconstruir `smca_test` desde este
    checkout (drop + `dotnet ef database update`), como en T1 → 539/539.
  - RDD: assessment **passive** (`non_executable_only`) → sin revisión (readback estructural).
- **T7: CERRADA** — commit `6d112508`: spec nuevo `frontend-react/e2e/elaboration.spec.ts` + support `e2e/support/elaboration-flow.ts` (371 líneas).
  - El spec ya existía **untracked** de una corrida interrumpida anterior; se verificó (no se reescribió): **1 passed (55.8 s)**;
    matemática real `2×$20 + 2×$30 = $100` sobre 20 unidades → **$5/u**, venta a $25 → profit **$20** = `salePrice − unitCost`.
  - **Suite completa: 269 passed / 11 failed / 19 flaky (12.6 min, exit 1).** 10 son specs existentes que fallan
    **determinísticamente** también aislados (`configurations`, `csv-import-duplicate-reimport`, `dashboard-metrics-values`,
    `edit-delete-order`, `mayorista-sale`, `orders-history`, `owner-plan-change-dialog`, `owner-store-create`,
    `store-plan-lock-regression`, `wholesale-cart-floor`) y **no** figuran en la lista documentada de fallos previos
    (`docs/plans/2026-09-11-preexisting-e2e-failures.md`, que decía 258 passed / 0 fallos). El 11º es un spec **scratch
    gitignored** en `e2e/diag-tmp/` que `playwright.config.ts` no excluye. Ninguno es el spec nuevo.
    Decisión del usuario (2026-09-18): commitear T7 y tratarlos como pre-existentes. **Duda no cerrada**: si
    `owner-plan-change-dialog` (sensible a menú/i18n) fuera regresión del módulo — no se verificó contra un worktree previo.
  - Nota de entorno: al levantar el backend para el E2E se detuvo un `SMCA.WebApi` del **otro clon**
    (`D:\...\Store\store-mgmt`, perfil `http`, base `smca`) que tenía tomado el puerto 5019.
- **T6: CERRADA** — commit `e0725fce` (11 archivos, +907/−25): `storage-keys.ts` (12 entidades), cableado en
  `entity-migration`/`store-data-reset` (iteran la misma lista), `data-serializer-service.ts` (`recipes.json`/`elaborations.json`),
  `data-synchronizer-service.ts` (reglas de merge) y las rutas de export/import. Verificado: sync **147**, `app/inventory` **462**,
  app completa **3815**, typecheck **0**, lint **0**; spot check 65/65. El smoke manual 6.7 **no** se hizo (sin navegador).
  - **Revisión RDD del slice T6 (`review-8ea3d70e04806305`): APPROVED + acknowledged** (`authority: burned`). El primer intento
    del reviewer devolvió `opencode_task_output_empty`; el STATUS reofreció el mismo slot y el relanzamiento fue admitido.
    Advisories **no bloqueantes**: `R3-ORDER` (WARNING — `mergeRecipesViaService` evalúa la regla de una-receta-activa-por-producto
    **secuencialmente** contra un mapa mutable: un lote que desactiva la receta activa y activa otra para el mismo producto falla
    si la activación viene antes que la desactivación; el mismo estado final pasa con el orden inverso → el éxito del import
    depende del orden del array), `R3-WAREHOUSE` (WARNING — `mergeElaborationsViaService` deriva el set de almacenes de un
    `warehouseService` **opcional**: si se inyecta el servicio de elaboraciones sin el de almacenes, TODO import no vacío se
    rechaza como `ElaborationsUnexpectedError` en vez de ser un no-op), `R3-BREAKONLY` (SUGGESTION — los tests de break-only
    no siembran una fila previa exitosa para probar la persistencia parcial).
- **T5: CERRADA** — commit `ddaadcfb` (9 archivos, 1732 líneas): `recipes.tsx`, `elaborations.tsx`, `recipe-form-modal.tsx`,
  rutas, menú (grupo ELABORACIÓN sin iconos) e i18n `RECIPE.*`/`ELABORATION.*`/`MENU.*`; 13 tests nuevos.
  Verificado: `app/inventory` **462/462**, suites tocadas **224**, typecheck **0**, lint **0**; spot check 13/13.
  - **Revisión RDD del slice T5 (`review-dd1d6f0e8abb7baf`): APPROVED + acknowledged al primer evento admitido**
    (sin corrección; `authority: burned`). Advisories **no bloqueantes** (backlog de mejora, no reabren la revisión):
    `R3-real-qty-negative` (WARNING — la cantidad "Real" negativa se acepta en la UI y produce un preview con costos
    negativos; el servicio la revalida, pero la pantalla no debería mostrarlo), `R3-dup-component-key` (WARNING —
    insumos repetidos en una receta generan keys/testids duplicados y una sola cantidad real compartida),
    `R3-stale-error` (SUGGESTION — el mensaje de error previo no se limpia al cambiar receta/lotes/almacén),
    `R3-real-path-untested` (SUGGESTION — ningún test edita la cantidad real), `R3-recipe-update-untested`
    (SUGGESTION — el test de recetas solo cubre el alta, no la edición).
- **T4: CERRADA** — commits `97ec87ce` (`warehouse-offline-service.ts`, +55 aditivo) y `edabf8e7` (4 archivos, 1103 líneas).
  - `elaboration-math.ts` (puro) + `elaboration-offline-service.ts` + 26 tests nuevos. Verificado: `app/inventory` **451/451**
    (baseline 425 + 26), typecheck **0**, lint **0**; spot check del padre 451/451.
  - Desviación aceptada: `WarehouseOfflineService.recordMovement` no tenía casos para `consumption_out`/`elaboration_in`
    (caía en `QuantityInvalid`), así que el primitivo que exige el plan era inutilizable → se agregaron los dos casos
    espejando `sale_out`/`purchase_in`. Aditivo, sin cambios de comportamiento existente.
  - Decisiones: (a) `Recipe` no tiene campo `name` → `Elaboration.recipeName` snapshotea el nombre del producto terminado;
    (b) el ejemplo pinneado 123.535 no sobrevive `round2` (6.685→6.69 daría 123.54), así que `overheadCost`/`totalCost` quedan
    sin redondear y solo `estimatedUnit` se redondea → **6.18**, como pide el plan; (c) el producto terminado genera
    `elaboration_in` (almacén) **y** `InventoryEntry` (tienda vendible), tal como dicen los pasos 3 y 5 del plan.
  - **Review RDD del slice T4** (`review-bce6e712c0b3d578`, lente `review-reliability`): **2 hallazgos CRITICAL
    corregidos y commiteados** — R3-001 (registro/movimientos persistidos antes de `createInventoryEntry` → no atómico)
    y R3-002 (componentes duplicados del mismo insumo: validación por componente contra el mismo snapshot). Fix: consumo
    acumulativo por producto contra el `onHand` crudo + la única escritura falible primero (compensación imposible sin un
    primitivo de reversa). Commit `2501598d`; 453/453 + typecheck 0 + lint 0, con los 2 tests nuevos probados fallando antes.
  - **Cierre de la revisión: APPROVED + acknowledged** (`authority: burned`, 2026-09-18). El "bloqueo" **no era estructural**:
    `reviewImmutableRuntimeCapability` (OpenCode) corre `opencode --version` con **timeout de 3 s**, y en Windows ese comando
    tarda ~1.2 s → bajo carga el probe falla y el CLI declara el runtime *no elegible* (`immutable_review_transport_unsupported`),
    que es un mensaje engañoso. Reintentando de a **un** llamado (sin ráfagas), la validación dirigida corrió, aprobó y se quemó.
    Evidencia de las 3 condiciones: env `GENTLE_AI_OPENCODE_RELAY_CONTRACT` vacía, `opencode 1.18.31` → major V1, y OpenCode
    `ContractExposureAdvertised` en el manifest compilado. Un tercer intento en ráfaga dio `operation_timeout`.
  - **Advisory no bloqueante (trabajo posterior)**: `R3-003` (WARNING) — `planElaboration` expone `available: round2(onHand)`
    y el movimiento compara el `onHand` **crudo**: un stock como 3.055 redondea a 3.06 y puede pasar la validación para luego
    ser rechazado por el movimiento. No abre corrección.
- **T3: CERRADA** — commits `25c41fe5` (servicio + tests, 566 líneas) y `5268a8f1` (corrección por review).
  - `recipe-offline-service.ts`. Verificado: vitest del servicio **22/22**; `app/inventory` **425/425**; typecheck **0**; lint **0**.
    Incluye `d85e4763`: mapeo i18n de `consumption_out`/`elaboration_in` en `warehouse-movements.tsx` + `es.ts`
    (la extensión del union en T2 rompía la exhaustividad del `Record<WarehouseMovementType, string>` → typecheck rojo).
  - Corrección `5268a8f1` por hallazgo **R3-recipe-cache-lost-update** (CRITICAL, determinista): lost update — la caché
    no vacía nunca se refrescaba y cada write persistía el array potencialmente viejo. Fix: `reloadRecipes()`
    (read-modify-write desde storage) al inicio de los 5 write paths + test de regresión (falla sin el fix:
    `expected ... length 3 but got 2`). Spot check del padre: 22/22.
- **Revisión nativa RDD del slice frontend (`review-428c2e47bf63295b`, base `a59529f6`, 14 paths, 850 líneas): BLOQUEADA.**
  - START con consentimiento del usuario (`granted`), lente única `review-reliability`, 1 hallazgo CRITICAL (el de T3),
    plan de corrección capturado (`--correction-lines=60`) y corrección ya commiteada.
  - **Bloqueo**: el transporte OpenCode rechaza 2× el rol `review-validator` (`opencode_provider_role_result_refused`);
    el slot congelado sigue reofrecido. Salidas: cerrar la revisión en claude-code/codex, o salir de RDD con
    `gentle-ai review mode disable --scope clone --cwd <repo>`. Nota: en PowerShell 5.1 el JSON de
    `--intended-untracked-selection` exige `--%` con comillas escapadas (`\"`), si no el exe nunca lo parsea.
- **Revisión nativa RDD del slice backend: CERRADA — APPROVED + acknowledged (`authority: burned`, 2026-09-18)**.
  4/4 lentes admitidas; solo hallazgos advisory no bloqueantes (ver §RDD). La lente `review-reliability`,
  que venía fallando con `opencode_task_output_empty`, aprobó al primer intento en esta sesión.
- Nada pusheado. Worktree limpio salvo untracked: `graphify-out/` y este archivo.

## Decisiones ratificadas por el usuario (2026-09-18)

1. **Catálogo**: módulo Elaboración **17** (`Price=3`, `DiscountPrice=0`, `PercentDiscountPrice=100`,
   `PriceIncluded=false`, `AvailableToStore=true`) — patrón MultiMonedas — asignado a **Superior (3) + VIP (4)**.
2. **Roles**: features **Recetas (120)** y **Elaboraciones (121)** solo para **OwnerAdmin (2)** — patrón Almacenes.
3. **Permiso E2E (innegociable)**: autorizados ÚNICAMENTE los 3 ajustes 1:1 ya aplicados (`StorePlanCatalogTests`,
   `StoreCreatePlanTests`, `MeAfterOwnerPlanChangeTests`). Cualquier OTRO E2E existente que se rompa → STOP y preguntar.
4. **Alcance backend**: offline-first como el plan — recetas/elaboraciones viven en la tienda (localStorage);
   backend solo módulo/features/planes/backfill.
5. **Renumeración (colisión con MultiPayments)**: la sesión paralela (`qa-env\store-mgmt`, rama `feat/multipayments`)
   reclamó **módulo 16** y **script 18** con T1/T2 cerradas/revisadas/DB aplicada. Decisión del usuario:
   **MultiPayments conserva 16; Elaboración pasa a 17 y script 19** (ya hecho en `a59529f6`).
   Al mergear ramas: Superior = {2..15, 17}; VIP = {2..16, 17}; conflicto esperado en `StorePlanCatalogTests` (se resuelve al merge).
6. **Base de tests compartida**: el usuario autorizó reconstruir `smca_test` una vez. La otra rama necesitará el mismo
   rebase de base si corre sus E2E (ping-pong conocido mientras compartan BD).
7. ODD reemplaza la nota histórica "SUPERPOWERS ONLY" del plan.

## Modo TDD

- Efectivo: **off** — sin mandato TDD. Fuente: engram `sdd/store-mgmt/testing-capabilities` (override 2026-08-14).
- Checks ordinarios: vitest, `pnpm typecheck`, `pnpm lint`, `dotnet test` (3 proyectos), Playwright E2E.

## Reglas vigentes (CLAUDE.md + plan)

- Angular LEGACY: cero cambios en `frontend/`.
- Backend producción: SOLO enums/seeds/migración/backfill/script (ya consumido por T1).
- E2E existentes: solo los 3 ajustes autorizados; lo demás = specs NUEVOS.
- Comentarios/código en inglés; UI español neutral (`es.ts`). Sin iconos en menú.
- `@store-mgmt/domain`: rebuild tras tocarlo + purgar `apps/web-store-pos/node_modules/.vite` antes de E2E.

## Tasks (unidades de trabajo)

1. [x] **T1 — Backend catálogo + migración + script + E2E backend** — CERRADA (evidencia arriba).
2. [x] **T2 — Domain package** — CERRADA (commit `8b7313c7`).
   - Entregado: `models/recipe.ts`, `models/elaboration.ts`, `errors/recipe-errors.ts`, `errors/elaboration-errors.ts` (+ tests
     `errors/__tests__/recipe-errors.test.ts` / `elaboration-errors.test.ts`), `__tests__/elaboration-enums.test.ts`;
     `warehouse.ts` (`consumption_out`/`elaboration_in`, aditivo), `enums/index.ts` (Elaboration=17, Recipes=120, Elaborations=121), `index.ts`.
   - Verificación: `pnpm --filter @store-mgmt/domain test` 144/144; typecheck/lint limpios; build OK.
   - RDD assess: **medium** (`executable_change`) → diferido al slice; running count **275/400** desde `a59529f6`.
   - Divergencias: (a) builder extra `elaborationInsufficientStockError(productName, available, needed)` porque el shape
     `as const satisfies Record<string, BaseError>` no admite funciones; (b) los comentarios añadidos en `warehouse.ts`
     quedaron en inglés aunque el archivo tenía español (convención del repo); ajustable si molesta.
3. [x] **T3 — RecipeOfflineService** (`app/inventory/lib/services/recipe-offline-service.ts`) + tests
   (patrón `exchange-rate-offline-service`; validaciones: producto existe, componentes ≥1, qty>0, scrap 0–100,
   receta activa duplicada por producto, deactivate libera).
   - [x] Corrección R3 del review: `reloadRecipes()` en los 5 write paths + test de regresión (commit `5268a8f1`).
   - [x] i18n del tipo de movimiento (`consumption_out`/`elaboration_in`) — commit `d85e4763`.
4. [x] **T4 — Elaboration math + ElaborationOfflineService** (`elaboration-math.ts`, `elaboration-offline-service.ts`)
   + tests (atomicidad stock, costo real, scrap, inmutabilidad, import). Math pinneada del plan:
   123.535/20 = 6.18 (round2).
   - [x] Commits `97ec87ce` (movimientos nuevos en `warehouse-offline-service.ts`) + `edabf8e7` (math + service + 26 tests).
5. [x] **T5 — Rutas + menú + i18n** (`recipes.tsx`, `elaborations.tsx`, `routes.ts`, `menu-config.ts`, `es.ts`)
   + tests de ruta/menú (gating por features 120/121; sin iconos).
   - [x] Commit `ddaadcfb`; review RDD `review-dd1d6f0e8abb7baf` **aprobada** (5 advisories no bloqueantes).
6. [x] **T6 — Sync circuit** (StorageKeys, entity-migration, DataSerializerService, DataSynchronizerService,
   store-data-reset) + tests (roundtrip, zip viejo sin recetas, duplicado de receta activa).
   - [x] Commit `e0725fce`; review `review-8ea3d70e04806305` **aprobada** (2 WARNING + 1 SUGGESTION advisory).
   - [ ] Pendiente: smoke manual UI export→import (plan 6.7) — NO ejecutado.
   OJO: `BUSINESS_ENTITY_NAMES` hoy tiene 10 entradas (comentario "seven" ya obsoleto) → pasarán a 12.
7. [x] **T7 — E2E frontend NUEVO** (`frontend-react/e2e/elaboration.spec.ts`, NUNCA tocar existentes):
   receta → entradas de insumos → elaboración 2 lotes → historial con costo real → vender 1 unidad →
   ganancia del día con costo real; + stock insuficiente; + menú oculto sin módulo.
   - [x] Commit `6d112508`; spec **verde** (1 passed). Suite completa con 10 fallos pre-existentes ajenos (no documentados).
8. [x] **T8 — Verificación completa + docs**: README raíz (build + 3 proyectos + turbo + E2E); nota de
   despliegue VPS en README §4 (migración EF o script 19; backup primero).
   - [x] Commit `7591075a`; verificación completa observada (backend E2E 538/539, el fallo es contaminación de `smca_test`).

## Criterio de aceptación (del plan)

- Unit = 123.535/20 = **6.18**; ediciones reales divergen; primera venta descuenta costo REAL;
  elaboración inmutable; stock append-only; gating por features 120/121 (OwnerAdmin).

## Verificación (comandos — README raíz)

```bash
dotnet build backend/src/SMCA.sln
dotnet test backend/src/SMCA.sln
cd frontend-react; pnpm turbo run typecheck lint test
# E2E (terminal aparte, raíz): dotnet run --project backend/src/SMCA.WebApi --launch-profile http-e2e
# frontend-react: pnpm test:e2e
```

## RDD (review nativo — CERRADO)

- **Lineage**: `review-96a5944d2f7afd8e` · **target**: `sha256:10741f570f1a325a91973bbd75ba18a364f358ac5e361a921cf893a2d0dcb736`
- **Revisión consumida**: `sha256:c9cea1366eabeabc9bb60874c383ecbfc761112072141b15f908fab02b08ec63`
- **Resultado (2026-09-18)**: `approved` → `gentle-ai review acknowledge-approved` ejecutado verbatim →
  `gentle-ai.review-acknowledged/v1` con `authority: burned`. **4/4 lentes admitidas** (risk, resilience,
  readability, reliability); 0 bloqueantes; ningún correction transition.
- **Candidato revisado**: rango commiteado `4b8a54dc..a59529f6`.
- **Nuevo boundary = `a59529f6`**: los commits de T2+ se evalúan con
  `gentle-ai review assess --cwd . --base-ref a59529f6 --committed-only --json` (passive/low → sigue;
  medium → diferido al slice; high o fallo → preflight STATUS).
- **Advisories del review (NO bloqueantes; NO reabren el review; trabajo futuro candidato)**:
  - `R2-dead-backfill-constants` (WARNING) — los int constants de `ElaborationModuleBackfill` no se usan; el SQL hardcodea literales.
  - `R2-downsql-tautology` (WARNING) + `R4-rollback-scope` (WARNING) + `R3-ELAB-ROLLBACK-SCOPE` (SUGGESTION) — el `DownSql` es más amplio que el Up: borra `StoreModule(17)` y `StoreRoleFeature(120/121)` de TODAS las tiendas, no solo las del backfill.
  - `R3-ELAB-SEQ-PARITY` (SUGGESTION) — la migración EF no lleva los `setval` de secuencias que sí tiene el script 19 (misma clase que el T13 de MultiPayments).
  - `R2-plan-assignment-test-name` (WARNING) — el test promete validar la asignación (Superior,17)/(VIP,17) pero solo asserta valores del enum.
  - `R2-down-order-rationale` (SUGGESTION) — comentario del orden del Down con razón equivocada.
  Si el usuario decide abordarlos, requieren su aprobación (tocan archivos ya revisados) y NO implican
  re-correr el review de este candidato.
- **Ejecución de reviews futuros**: prompt MÍNIMO (solo la línea `GENTLE_AI_REVIEW_BINDING {...}`); este runtime
  corrompe tool-calls ≥ ~156KB. Si un slot devuelve `opencode_task_output_empty`: re-consultar STATUS ligado y
  relanzar solo si reofrece el mismo slot; si persiste, `capture-unachievable` (con aprobación del usuario).

## Cómo continuar desde otra sesión

1. Leer este archivo y el espejo engram `odd/elaboration-module/tasks` (mem_search → mem_get_observation).
2. Estado de código: rama `dev`, HEAD `a59529f6`, sin push. Si la sesión nueva corre en OTRO clon,
   primero transferir estos commits (push/pull) o continuar en este mismo worktree.
3. Empezar por **T2** (domain package) y continuar la secuencia T3→T8.
4. La revisión nativa del slice backend ya está CERRADA (approved + acknowledged; ver §RDD): no hay nada que
   reanudar. Los commits nuevos de T2+ se evalúan con `--base-ref a59529f6`.
5. Reglas que NO cambian: E2E existentes intocables (salvo los 3 autorizados, ya hechos);
   Angular frozen; backend producción fuera de scope para T2+ (todo es frontend-react + domain).

## Hechos/decisión técnica útiles

- El módulo backend ya NO es "16": cualquier referencia nueva debe usar **17**; features 120/121; script 19.
- `ElaborationModuleBackfill` (backend) usa roles solo OwnerAdmin=2; `DownSql` incluye ambos features.
- El script 19 incluye setvals de `"Feature"`/`"Module"` y registro en `__EFMigrationsHistory`
  (id `20260918153139_Add-Elaboration-Module`, ProductVersion `8.0.3`).
- `dotnet ef database drop` en este entorno NO acepta `--connection` y apunta a `design_time` por el
  design-time factory: para dropear `smca_test` usar psql directo (gotcha guardado en engram id 1221).
