# Plan: Fallos E2E preexistentes — diagnóstico y resolución

**Status**: RESUELTO — los 3 specs pasan (2026-09-14)
**Created**: 2026-09-11
**Closed**: 2026-09-14 — ver "Resolución" al final.
**Origin**: detectados durante la verificación de no-regresión del trabajo CSP (flip Step 2), **probados preexistentes** — el mismo `store-plan-activation.spec.ts` falla en el commit baseline `83b7de69` (verificado en worktree aislado, sin ningún commit del trabajo CSP).

## Los 3 specs que fallan

| Spec | Test | Síntoma observado |
|---|---|---|
| `e2e/store-plan-activation.spec.ts:62` | "OwnerAdmin activa el plan pago una sola vez" | Aserción línea 143: el PUT de activación llega con `moduleIds` vacío (Expected 2, Received 0) — el panel no envía módulos |
| `e2e/store-update.spec.ts:49` | "la vista Update guarda datos sin tocar el plan y el menú ya no muestra el enlace Plan" | Fallo consistente en corrida completa |
| `e2e/users-crud.spec.ts:121` | "activar y desactivar usuario desde la lista" | Fallo consistente en corrida completa; el describe serial arrastra "did not run" en cascada |

### Síntomas en el baseline (sin trabajo CSP)

`store-plan-activation` en `83b7de69` falla ANTES de llegar a la aserción del PUT:
- `Expected localStorage.currentUser to be populated after a real login, found none` (session.ts:102)
- `page.evaluate: Execution context was destroyed, most likely because of a navigation`

Esto apunta a un problema en la cadena login → redirect → hidratación, no solo en el payload del plan.

## Hipótesis (a verificar, no confirmadas)

1. **Merges de qa del 2026-09-10**: `b0d35aa0` (merge origin/qa and dev into main) y `83a9d6b1` (merge origin/qa) son los últimos cambios relevantes. El código de la app no cambió entre baseline y HEAD del trabajo CSP — el fallo ya estaba.
2. El PUT sin `moduleIds` puede ser sintoma del panel de plan que no carga sus datos (¿el fetch de planes falla silenciosamente en la vista re-mergeada?).
3. El fallo de sesión del baseline puede ser la misma causa raíz manifestándose antes en la cadena.

## Pasos de diagnóstico

1. `git log` fino entre `921ab960` y `b0d35aa0` — qué entró por qa que toca: stores/plan panel, update store view, users list, auth-store hydration.
2. Correr cada spec aislado con `--trace on` y leer el trace (los fallos son consistentes, no flaky — 3 reintentos fallan igual):
   ```bash
   npx playwright test e2e/store-plan-activation.spec.ts --trace on
   npx playwright test e2e/store-update.spec.ts --trace on
   npx playwright test e2e/users-crud.spec.ts --trace on
   ```
3. Para `store-plan-activation`: inspeccionar en el trace la respuesta del GET de planes y el payload del PUT — ¿el panel carga módulos pero no los envía, o no carga nada?
4. Para el síntoma de sesión del baseline: reproducir login manual contra dev server y observar `localStorage.currentUser` tras el redirect.

## Reglas del proyecto (innegociables)

- Los specs E2E existentes NO se tocan — el fix va en código de producción (frontend app o backend).
- Código de producción backend requiere notificación + aprobación explícita antes de tocar.
- Un fallo E2E es información: si la corrección requiere cambiar un spec, parar y preguntar.

## Contexto de la corrida completa (2026-09-11, HEAD 54cd8b33)

- 258 passed, 0 fallos nuevos, 8 flaky (absorbidos por `retries: 2`, fenómeno de contención documentado en playwright.config.ts).
- Los 3 specs de arriba fallan en los 3 intentos.
- Suite CSP enforcing (config dedicado): 3/3 passed — no relacionada.

## Otros pendientes ya registrados

- Imagen nginx del frontend NO reconstruida/desplegada: el error de actualización del SW y el error MIME del bootstrap (`bootstrap-0-46a81289.js` con src relativo del build viejo) persisten en producción hasta re-build + re-deploy.
- 3 cambios UI en Movimientos (quitar texto "Movimientos", margen lateral, alinear iconos) — sin empezar.
- Test backend pinneando `Plan.id` == `StorePlanType` (1–4) en activación de plan.

## Resolución (2026-09-14)

Los 3 specs pasan hoy en `dev`, cada uno con su causa raíz propia:

| Spec | Causa raíz | Fix |
|---|---|---|
| `store-plan-activation.spec.ts` | Locator obsoleto: el botón "Activar Plan" vive en el BODY del panel, no en el header del accordion — el locator `freeHeader`-scoped nunca podía matchearlo; el PUT llegaba sin `moduleIds` (0 módulos) porque el panel nunca cargaba su body | `fix(e2e)` `f9053f8d` — locator page-wide |
| `store-update.spec.ts` | Ruta y menú obsoletos: `/management/stores/update` y el enlace "Editar la tienda" ya no existen; la edición vive en `edit/:id` y el menú ahora muestra "Mis tiendas" | `fix(e2e)` `f9053f8d` — ruta corregida |
| `users-crud.spec.ts` (Test 2) | **Bug de producción backend**: cláusula circular `u.StoreUser.User != null && u.StoreUser.User.IsActive` en `UserRepository.GetAllUsersByStoreIdIncludingStoreAndRolesAsync` exigía `IsActive==true` incondicionalmente — el GET con `includeInactive=true` nunca devolvía al usuario desactivado, así que tras el DELETE la lista no mostraba el card con "Activar" y el test moría en `userCardActionMenu` | `fix(users)` `ab734930` — cláusula removida (redundante con `(includeInactive \|\| u.IsActive)`) + test nuevo `StoreUsersByStoreIncludeInactiveTests` |

Verificación 2026-09-14 en `dev` (merge `df35d0ff` con main): los 3 specs corren verdes contra backend `http-e2e` real (`smca_test`), teardown limpio. Los fixes se diagnosticaron con los specs temporales `e2e/diag-tmp/diag2..diag9` (gitignored, nunca commitear).

## Corrida completa (2026-09-19, rama `dev`, HEAD del trabajo del módulo de elaboración)

**Status**: ABIERTO — 10 fallos deterministas preexistentes + 1 scratch ya resuelto por borrado. Pendiente de decisión, no bloqueante para el módulo de elaboración.

Corrida completa del suite de Playwright del frontend (`pnpm test:e2e`): **269 passed / 11 failed / 19 flaky / 10 did not run** (≈12.6 min, exit 1). Los 10 fallos que el documento registraba originalmente **NO** son los que fallaron en esta corrida.

### Los 10 specs fallidos (deterministas)

Fallan idéntico al re-ejecutarse en aislamiento, en los 3 reintentos, y sin 429 en el log del backend. Rutas repo-relativas desde `frontend-react/e2e/`:

| Spec (repo-relativo) | Línea |
|---|---|
| `frontend-react/e2e/configurations.spec.ts` | 20 |
| `frontend-react/e2e/csv-import-duplicate-reimport.spec.ts` | 89 |
| `frontend-react/e2e/dashboard-metrics-values.spec.ts` | 60 |
| `frontend-react/e2e/edit-delete-order.spec.ts` | 108 |
| `frontend-react/e2e/mayorista-sale.spec.ts` | 201 |
| `frontend-react/e2e/orders-history.spec.ts` | 113 |
| `frontend-react/e2e/owner-plan-change-dialog.spec.ts` | 67 |
| `frontend-react/e2e/owner-store-create.spec.ts` | 91 |
| `frontend-react/e2e/store-plan-lock-regression.spec.ts` | 149 |
| `frontend-react/e2e/wholesale-cart-floor.spec.ts` | 160 |

### El 11º fallo: scratch spec — RESUELTO por borrado

El fallo restante era un spec de scratch **gitignored** bajo `frontend-react/e2e/diag-tmp/` que `playwright.config.ts` no excluía. La carpeta completa (8 archivos, untracked y gitignored — ver `.gitignore:173`) ya fue **eliminada** en esta sesión. Se registra como **resuelto por borrado**, no como un fallo abierto.

### Evidencia de que NO los causó el módulo de elaboración

> **Actualización (2026-09-19, checkout `main` @ `2a073d4b`):** los 10 fallos frontend de esta lista fueron verificados y **casi todos ya no aplican** — fueron resueltos por tareas posteriores (mismos specs corregidos con permiso del owner: seed de `orders-history` al formato real del servicio, repunto Zelle→Transferencia de `mayorista-sale`, gear de Ventas del día en `edit-delete-order`, filtro dinámico de métodos de pago, etc.). La corrida backend E2E de hoy dio **542/544** con **2 fallos reales vivos**: `ElaborationModuleTests.EM2/EM3` (causa raíz identificada abajo). La checklist viva está en la sección siguiente.

### Checklist de verificación backend (2026-09-19)

| Check | Resultado |
|---|---|
| `dotnet build backend/src/SMCA.sln` | 0 errores (tras matar el backend dev PID 26180 que bloqueaba las DLLs) |
| Domain.UnitTests | 27/27 |
| Application.Tests | 494/494 |
| SMCA.WebApi.E2ETests (base `smca_test` reconstruida desde este checkout) | 542/544 — fallan solo `ElaborationModuleTests.EM2/EM3` |
| `pnpm turbo run typecheck lint test` | 12/12 tareas, 3982/3982 tests, typecheck/lint limpios |

**EM2/EM3 — causa raíz (producción, no del spec):** el handler `ChangeStorePlanCommand` (restricción de planes del 2026-09-18) devuelve 403 a cualquier no-SuperAdmin que intente cambiar a Superior/VIP, pero los tests EM2/EM3 cambiaban el plan como OwnerAdmin. **RESUELTO (2026-09-19):** decisión del owner — el comportamiento correcto ES el guard (solo SuperAdmin eleva a Superior/VIP), los specs estaban obsoletos. Con permiso del owner, EM2/EM3 reescritos: OwnerAdmin intenta Superior/VIP → 403 y la tienda queda intacta en Pago; el SuperAdmin hace el cambio → 200 y Elaboración (17) + features 120/121 fluyen por la misma cadena runtime (change-plan → StoreModules → /me).

### Fix de producción: registro con módulos del plan Pago (2026-09-19)

**Problema:** `RegisterCommand` cargaba los módulos del plan **Superior** (comentario obsoleto que decía "default plan hardcoded in CreateStoreService"), pero desde el 2026-09-18 `CreateStoreService` fija el birth plan **Pago**. Resultado: la tienda registrada nacía con plan Pago y módulos de Superior (11 + Warehouses 13, MultiStores 14, MultiMonedas 15, Elaboración 17) — incoherencia plan/módulos. Los E2E del registro no lo detectaban porque solo asertaban la presencia de 12/13/14.

**Fix:** `RegisterCommand` ahora carga `GetActivePlanWithModulesByIdAsync((int)StorePlanType.Pago)` — la tienda nace con plan Pago y exactamente los 11 módulos de Pago.

**Specs actualizados con permiso del owner:**
- `AuthRegisterDataAssertionsTests.Register_assigns_default_plan_modules`: conjunto esperado = catálogo Pago; Superior/VIP-only (13/14/15/16/17) deben estar ausentes.
- `AuthRegisterPlanTests`: (1) nacimiento con Pago → 12 presente, 13/14/15/17 ausentes; (2) el test del snapshot de precio de Warehouses se reorienta a guard de ausencia (el snapshot de catálogo lo fija `StorePlanCatalogTests`); (3) `/me` → 12 presente, 13/14 ausentes; (4) features del registro → 60/90 presentes, 36/37/120/121 ausentes.
- `WarehousesRuntimePathsTests.Register_assigns_warehouses_module_and_owner_features`: reorientado a la cadena real registro (sin 13) → SuperAdmin eleva a Superior → change-plan asigna 13 + features 36/37 por runtime.

**Unit tests alineados:** `RegisterCommandHandlerTests.Handle_ShouldCallPlanRepository_GetActivePlanWithModulesByIdAsync` y `RegisterCommandHandlerModuleTests.Handle_ShouldExtractModuleIdsFromDefaultPlan` verificaban que el handler llama con Superior — actualizados a Pago.

**Verificación final (2026-09-19):** Domain.UnitTests 27/27 · Application.Tests 494/494 · **SMCA.WebApi.E2ETests 544/544** · frontend `pnpm turbo run typecheck lint test` 12/12 tareas, 3982/3982 tests, typecheck/lint limpios.

- Ninguno de los 10 specs, ni ningún support file E2E existente, fue modificado por los commits del módulo: el módulo solo **AGREGÓ** `e2e/elaboration.spec.ts` y `e2e/support/elaboration-flow.ts` (ambos net-new, sin tocar nada preexistente).
- Ninguna clave i18n agregada por el módulo está duplicada en `es.ts` (una clave duplicada habría sobrescrito el valor previo). Verificado: las 54 claves agregadas por `ddaadcfb` aparecen una sola vez.
- `owner-plan-change-dialog.spec.ts:67` (aserción en la línea 87) espera el texto `"Plan Gratis"`, que **no** es lo que renderiza la card. La app usa la clave `STORES.PLAN.DISPLAY` = `"Plan: {plan}"` (`owner-store-card.tsx:83`), o sea `"Plan: Gratis"`. El texto literal `"Plan Gratis"` sí existe, pero bajo otra clave (`STORES.FREE_PLAN`), que la card de owner no usa. Los tests preexistentes confirman el render real: `my-stores.test.tsx:367` y `owner-store-card.test.tsx:55` esperan `"Plan: Gratis"`, y el spec que pasa `owner-stores.spec.ts:292` también. La expectativa de este spec está **obsoleta**.

### Lo que NO se hizo (honestidad del registro)

- Estos specs **nunca** se corrieron contra un worktree pre-módulo. Los 9 restantes (todos menos el de i18n obsoleto, ya explicado) son **"muy probablemente preexistentes"**, pero **no están probados** contra un commit anterior. No afirmar prueba donde no la hay.

### Entrada backend/DB — NO es un fallo de Playwright

El único fallo del suite E2E de backend en esta sesión es un asunto **distinto** y no debe confundirse con lo anterior:

- Test: `SMCA.WebApi.E2ETests.Plans.StorePlanCatalogTests.StorePlanModule_seed_matches_documented_plan_matrix`.
- Causa: la base **compartida** `smca_test` tiene una migración fuera de árbol (`20260918131144_Add-MultiPayments-Module-And-Payment-Mirror`, módulo 16) aplicada por un clon/rama paralelo, que este checkout **no** tiene en código.
- Remedio: **reconstruir `smca_test` desde este checkout** (aplicar las migraciones de este checkout) antes de correr el suite de backend.
