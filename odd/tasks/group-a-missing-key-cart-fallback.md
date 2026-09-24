# Feature: group-a-missing-key-cart-fallback

## Objective

Aplicar el arreglo del **Grupo A** de `docs/testing/known-issues.md` (2026-09-24): cuando la lectura de la configuración de formas de pago se hace *durante el render* y falla por falta de llave de datos (`MissingDataKeyError`), **usar el catálogo por defecto en vez de reventar** la interfaz. Luego verificar solo los 4 tests afectados por el Grupo A y actualizar el doc para que queden únicamente los que sigan fallando.

## Problem / Why

El carrito (`CartShell`) lee la config de formas de pago de la tienda vía `StorePaymentMethodsConfigService.getEnabledMethods()` dentro de un `useMemo` (render síncrono). Esa lectura pasa por `readEntityOrThrow` → `decryptEntity`, que lanza `MissingDataKeyError` cuando el valor está cifrado (`enc:v1:`) y no hay DEK en memoria. El auto-init del carrito escribe el default CIFRADO en el primer render, así que aunque la tienda nunca se configuró, tras perder la llave (roster recovery, cambio de contraseña, IndexedDB `lizoft-device-key` borrado) la lectura de ese key vuelve a fallar: el throw durante el render activa el error boundary de React y **toda la UI cae a la página de "Error"**, preemptiendo a la política app-wide D5 (`decryption-failure-policy.ts`: anunciar una sola vez y cerrar la sesión) que sí corre en caminos asíncronos.

Tests afectados (4, sin cambios en los tests):
- `roster-recovery.spec.ts` E2E 4 y E2E 5 — tras `stripEveryKeySource` + reload, la app DEBE anunciar (`ENCRYPTION.KEY_UNAVAILABLE`) y terminar en `/login`, conservando bytes.
- `valid-session-navigation.spec.ts` 6 (online) y 12 (offline) — tras `deleteDeviceKeyDatabase` + reload, la sesión DEBE mantenerse: menú de usuario visible, sigue en `/sales/products` (no hay otras lecturas cifradas en el home de esa persona; la única entidad cifrada leída en render es la config de pagos, por el auto-init del carrito).

## Design

Fix en el **chokepoint único** — `StorePaymentMethodsConfigService.getConfigFromLocalStorage()`:

- Envolver la lectura con try/catch.
- Si el error es `MissingDataKeyError` (match por `name`, mismo precedente que `read-entity-or-throw.ts:52`), devolver `{ ...DEFAULT_STORE_PAYMENT_METHODS_CONFIG }` **SIN persistir** (persistir re-lanzaría: `encryptEntity` necesita la misma llave) y sin reemplazar los bytes guardados.
- Cualquier otro error (p. ej. `EntityUnreadableError` — bytes dañados) sigue propagando: los tests existentes del read seam lo exigen.
- `getConfig`/`getEnabledMethods` quedan cubiertos → todos los sitios en render (CartShell, MultiPaymentList, SaleCreditPaymentModal, EditOrderModal, ExpenseFormModal, PaymentMethodsConfigSection) quedan protegidos sin tocar cada componente.
- El seam de backup (`getStorageStorePaymentMethods`) NO cambia: sigue lanzando si está bloqueado (camino asíncrono/serializer, fuera del alcance del Grupo A).

El plan gate (`hasMultiMonedas` → sin Zelle) sigue aplicando ENCIMA en cada sitio de consumo, así que el default cae a Efectivo/Transferencia para las personas sin MultiMonedas — consistente con "Efectivo / Transferencia, con las reglas de plan de siempre" del doc.

### Auditoría de "los demás"

Confirmado por el doc: el carrito. Se audita: en los homes verificados (`/sales/products`), las lecturas de productos/categorías son asíncronas (`loadData` en effect) → rechazan y disparan D5 (comportamiento deseado); la única entidad cifrada leída SÍNCRONAMENTE en render es la config de pagos. El T10.2 (tasas de cambio) queda **anotado, no confirmado** y fuera del set de verificación de esta tarea (spec reescrito por dev; corrida pendiente del spec nuevo).

## Scope

- `frontend-react/apps/web-store-pos/app/shared/lib/payment-methods/store-payment-methods-config-service.ts` (fix getConfigFromLocalStorage)
- `frontend-react/apps/web-store-pos/app/shared/lib/payment-methods/__tests__/store-payment-methods-config-service.test.ts` (tests nuevos del fallback)
- `docs/testing/known-issues.md` (actualizar: sacar lo arreglado, dejar solo lo que sigue fallando)
- NO backend. NO Angular. NO E2E existentes ni support existente.

## Constraints (NON-NEGOCIABLE)

- **NUNCA** tocar E2E existentes ni support E2E (`frontend-react/e2e/**`) — regla del proyecto 2026-08-10, aplica a sub-agentes también (llevar la regla verbatim en el prompt del writer).
- **NUNCA** tocar backend producción ni E2E backend existentes (regla 2026-08-08).
- **NUNCA** tocar `frontend/` (Angular, 2026-09-17).
- El fallback SOLO aplica a `MissingDataKeyError` (recuperable); bytes dañados (`EntityUnreadableError`) siguen lanzando.
- NO persistir nada en el fallback (no tocar bytes guardados — E2E 4 lo pinea).
- NO commit/push sin instrucción explícita (convención del repo).

## Tasks

- [x] **T1** — Fix `getConfigFromLocalStorage` (fallback MissingDataKeyError → default sin persistir) + tests unitarios nuevos (fallback devuelve default; no sobreescribe bytes; otros errores siguen lanzando). **Hecho** — 2 archivos, 40 inserciones / 1 borrado.
- [x] **T2** — Verificación: vitest del servicio + typecheck + lint; reportar `<comando>: <resultado>`. **Hecho** — ver Verification evidence.
- [x] **T3** — E2E: correr SOLO los 4 tests del Grupo A (`roster-recovery` E2E 4/5, `valid-session-navigation` 6/12) contra backend real `:5019` (`http-e2e`). **Hecho — 3/4 pasan**; el test 12 sigue fallando por causa AJENA al Grupo A (unlock gate; ver Progress). Ningún test/support E2E tocado.
- [x] **T4** — Actualizar `docs/testing/known-issues.md`: remover los tests del Grupo A que pasen (marcados como arreglados), conservar solo los que sigan fallando, actualizar "Estado de decisiones pendientes" y la fecha. **Hecho** — ver doc.

## Acceptance criteria

- [x] Con llave ausente y config cifrada, `getConfig`/`getEnabledMethods` devuelven el default y NO lanzan (unit test — 3 nuevos, 29 passed).
- [ ] **Parcial (3/4)** — Los 4 tests E2E del Grupo A pasan sin tocar ningún test/support E2E: E2E 4, E2E 5 y test 6 pasan; **test 12 no** (offline/sin clave: navega a `/login?unlock=1` por el unlock gate de cifrado at-rest — causa AJENA al Grupo A, nunca fue el crash; ver Progress). Queda decisión pendiente con el usuario.
- [x] Los bytes guardados no cambian durante el fallback (unit test + E2E 4 — passed).
- [x] `known-issues.md` refleja SOLO los tests que siguen fallando tras la verificación.

## Route

- T1: **delegated direct** (1 writer; 2 archivos no triviales → trigger Writer). T2: verificación del writer (RDD on — reporte del writer es la verificación de registro). T3: acción acotada del orquestador (tests permitidos como bounded action). T4: inline (1 archivo ya entendido).

## Progress

- 2026-09-24: exploración. Confirmado en código: `CartShell` lee `getEnabledMethods` en `useMemo` (render); `StorePaymentMethodsConfigService` auto-inicializa escribiendo el default CIFRADO en el primer render → el key existe siempre tras el primer uso del carrito; `deleteDeviceKeyDatabase` borra `lizoft-device-key` (IndexedDB) dejando localStorage intacto → reload con `enc:v1:` y sin DEK = `MissingDataKeyError` en render (bug de los 4 tests). La política D5 (`decryption-failure-policy`) anuncia + logout en caminos asíncronos y NO corre si el render revienta antes. Decisión: fix en el chokepoint del servicio, no por componente.
- RDD: on (decided by global) — verificación de registro la produce el writer (T2); sin commits (convención del repo).
- 2026-09-24 T1–T2: writer delegado aplicó el fix en `store-payment-methods-config-service.ts` (`getConfigFromLocalStorage`, try/catch de `MissingDataKeyError` → `{...DEFAULT_STORE_PAYMENT_METHODS_CONFIG}` sin persistir; `EntityUnreadableError` sigue lanzando) + 3 unit tests nuevos en el describe "missing data key (Grupo A)". `pnpm vitest run`: **29 passed**. `pnpm lint`: exit 0. `pnpm typecheck`: exit 0 tras rebuild de paquete ambiental (`pnpm --filter @store-mgmt/domain build` — dist stale, `src/index.ts:21` exporta payment-channel y el dist no). Cache `.vite` borrado (regla README). Diff: 2 archivos, 40+/1−; `git status --porcelain -- frontend-react/e2e` **vacío**.
- 2026-09-24 T3: Playwright contra backend real `:5019` (BD `smca_test`; el proceso de backend previo seguía vivo en el puerto, el `dotnet run` nuevo falló con "address already in use" y NO interfirió). `roster-recovery -g "E2E 4|E2E 5"`: **2 passed**. `valid-session-navigation -g "6\.|12\."`: **6 passed, 12 FAILED** (3 intentos): tras `reload()` navega a **`/login?unlock=1`** en vez de pintar `USER_MENU`. Diagnóstico con evidencia: el `authLoader` (`loaders.ts:36-39`) redirige ANTES del render cuando `needsUnlock(user)` (roster v2 con wrap `kat` + tabla `lizoft.device-dek` en localStorage intacto → `hasDeviceDekWrap`) y `hasUnreadableCiphertext()` (entidades `lizoft.store-*` cifradas por el auto-init) — **sin logout**; excepción legítima del contrato `docs/contracts/authenticated-session-redirect.md:22` y pineada en `loaders.test.ts`. **El test 12 nunca fue el crash del Grupo A** (el loader corre antes de montar); la clasificación del doc era inferencia y quedó corregida. Test 6 (online) pasa porque el login online no deja wraps en localStorage → `needsUnlock=false` → sin hijack → el render ya no revienta por el fix.
- 2026-09-24 T4: `known-issues.md` actualizado (3 resueltos + test 12 con causa corregida y decisión pendiente).
- RDD: sin commits (convención del repo); assessment no aplica sin candidato commiteado.

## Verification evidence

- `pnpm vitest run app/shared/lib/payment-methods/__tests__/store-payment-methods-config-service.test.ts` (workdir `frontend-react/apps/web-store-pos`): **29 passed** (26 previos + 3 nuevos "missing data key (Grupo A)").
- `pnpm typecheck` (workdir `frontend-react/apps/web-store-pos`): **exit 0** (tras reparación ambiental `pnpm --filter @store-mgmt/domain build`).
- `pnpm lint` (workdir `frontend-react/apps/web-store-pos`): **exit 0**.
- `pnpm exec playwright test e2e/roster-recovery.spec.ts -g "E2E 4|E2E 5" --reporter=list` (workdir `frontend-react`, backend real `:5019`): **2 passed**.
- `pnpm exec playwright test e2e/valid-session-navigation.spec.ts -g "6\.|12\." --reporter=list` (workdir `frontend-react`): **1 passed (6), 1 failed (12)** → `/login?unlock=1`. Evidencia: `test-results/.../error-context.md` + `auth/routes/loaders.ts:36-39` + `shared/lib/offline/unlock-gate.ts` + `docs/contracts/authenticated-session-redirect.md:22`.
- `git status --porcelain -- frontend-react/e2e`: **vacío** — ningún test ni support E2E tocado.

## Next step

T2–T4 completados. Reportar al usuario; **decisión pendiente del test 12** (expectativa del test vs. diseño del unlock gate — tocar el test E2E o `authLoader`/`needsUnlock` requiere permiso explícito).