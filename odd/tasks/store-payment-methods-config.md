# Feature: store-payment-methods-config

## Objective

Configuración **por tienda** de los modos de pago que acepta, persistida en el **frontend (localStorage)** — decisión del usuario 2026-09-22:

1. Página del owner `/management/configurations`: sección nueva "Formas de pago" con toggles por método (Zelle, Transferencia); **Efectivo siempre habilitado** (no desactivable).
2. La config se aplica en TODA la app de pagos: modal de gastos (create/edit), carrito/venta (`cart-shell`), modal de pago de créditos, edición de órdenes y filas multipago.
3. **Las reglas de plan/módulos siguen aplicando ENCIMA**: una tienda Pago/Gratis nunca ve Zelle aunque esté marcado on (gate `hasMultiMonedas` vigente). La config solo puede QUITAR métodos del catálogo base del plan.

## Problem / Why

El catálogo de modos de pago era estático (`paymentMethodOptionsForCurrency` en `payment-pricing.ts`) y no había forma de que una tienda deshabilitara métodos que no acepta (p. ej. Zelle). El usuario pidió configuración por tienda sin tocar backend (localStorage, como channel-rates), aplicada a todos los flujos de pago.

## Decisions (confirmadas por el usuario)

- **Persistencia**: localStorage offline por store (patrón `ChannelRateOfflineService`) — SIN cambios backend, no requiere aprobación de producción backend.
- **Alcance**: toda la app de pagos (gastos, carrito/ventas, créditos, edición de órdenes, multipago).
- **Semántica**: toggle por método + reglas de plan encima; Efectivo siempre on; default = todos los métodos on (no-regresión para tiendas que nunca configuran).

## Design

### Modelo

```ts
interface StorePaymentMethodsConfig {
  /** Métodos habilitados por la tienda. Efectivo no se almacena (siempre on). */
  enabledMethods: SalePaymentMethod[]; // default: [Efectivo, Zelle, Transferencia]
}
```

### Servicio nuevo

`frontend-react/apps/web-store-pos/app/shared/lib/payment-methods/store-payment-methods-config-service.ts` — espejo del shape de `ChannelRateOfflineService`:
- lectura/escritura localStorage cifrada por store (`StorageKeys` + `encryptEntity` + `readEntityOrThrow`), key por storeId, cache por instancia recargada al cambiar store.
- `getConfig(storeId): StorePaymentMethodsConfig` — default `{ enabledMethods: [Efectivo, Zelle, Transferencia] }` si la key no existe (no-regresión).
- `setMethodEnabled(storeId, method, enabled)` / `getEnabledMethods(storeId)`.
- Se escribe en el store ACTIVO (`selectedStoreId` de la sesión). Nuevos archivos: también respaldo en sync/export? NO — la config de pagos es local por dispositivo, igual que channel-rates. No participa del sync.

### Helper de composición (app layer)

`applyStorePaymentMethodsConfig(baseMethods: SalePaymentMethod[], enabledMethods: SalePaymentMethod[]): SalePaymentMethod[]`:
```ts
return baseMethods.filter(m => m === SalePaymentMethod.Efectivo || enabledMethods.includes(m));
```
Ojo: el array de dominio `SalePaymentMethod` incluye `Efectivo`; el default lo trae anyway. Efectivo se fuerza on por la regla de no-regresión y para no romper el vuelto (isCashMethod).

### Orden de composición (en cada sitio de consumo)

1. `base = paymentMethodOptionsForCurrency(currency)` (catálogo del plan, por moneda).
2. `planGate = hasMultiMonedas ? base : base.filter(m => m !== Zelle)` (gate vigente 2026-09-21).
3. `final = applyStorePaymentMethodsConfig(planGate, config.enabledMethods)`.
4. **Valor guardado fuera del catálogo** (dato histórico): mantener el método visible al final (patrón sentinel ya existente en `expense-form-modal` y `PAYMENT_OPTIONS` dinámicos) para que el select no pierda su valor.

Los labels usan `salePaymentMethodLabel(method, currency)` como hoy.

### Sitios de consumo (5)

| Sitio | Archivo | Cambio |
|---|---|---|
| Modal gasto create/edit | `app/expenses/components/expense-form-modal.tsx` | `expensePaymentOptionsFor` aplica config después del gate de plan |
| Carrito/venta | `app/shared/components/cart-shell.tsx` (line ~165 `methodOptions`) | aplicar config |
| Filas multipago | `app/shared/components/multipayments/multi-payment-list.tsx` (line ~207 `methodOptions`) | aplicar config por fila |
| Modal pago crédito | `app/sales/components/sale-credit-payment-modal.tsx` (PAYMENT_OPTIONS estático ~25) | derivar del catálogo + config |
| Editar orden | `app/sales/components/edit-order-modal.tsx` (PAYMENT_OPTIONS estático ~24) | derivar del catálogo + config |

Los tests vitest que pinchen estos options: `expense-form-modal` tests, `cart-shell` tests, `multi-payment-list` tests, `credit-components.test.tsx` (sale-credit-payment-modal), `orders.test.tsx` (edit-order) — revisar y actualizar honestamente, añadir cobertura nueva del config.

### UI de configuración

`app/management/configurations/routes/configurations.tsx` — sección nueva debajo del selector de tienda activa (que YA existe):
- Título "Formas de pago" (i18n `CONFIGURATIONS.PAYMENT_METHODS.*`).
- Checkbox/toggle por método: **Zelle** y **Transferencia** (Efectivo fijo, si se muestra, con nota "siempre habilitado").
- Estado desde `getConfig(selectedStoreId)`; al cambiar: `setMethodEnabled` + indicador guardado.
- Se lee el store activo del selector ya presente en la página (FC-B2 lo pinea: no romper ese E2E).

## Scope

- `frontend-react/apps/web-store-pos/app/shared/lib/payment-methods/store-payment-methods-config-service.ts` (nuevo)
- `frontend-react/apps/web-store-pos/app/management/configurations/routes/configurations.tsx` (+ i18n `es.ts`, + tests)
- 5 sitios de consumo listados
- Tests vitest afectados + cobertura nueva
- E2E Playwright NUEVOS (ver Tests)
- NO backend. NO Angular. NO E2E existentes.

## Constraints (NON-NEGOCIABLE)

- **NUNCA** tocar E2E existentes ni support E2E existente (`frontend-react/e2e/**`) — solo AGREGAR specs/support nuevos. No se requiere permiso porque NO se actualiza ningún E2E existente (verificado: `configurations.spec.ts` FC-B2 no pinea métodos de pago; `expense-crud.spec.ts` no referencia métodos de pago).
- **NUNCA** tocar `frontend/` (Angular), backend producción ni E2E backend existentes. El módulo es frontend-only.
- **NO regresión**: tienda sin configurar → comportamiento byte-idéntico al actual (default todos on).
- DO NOT commit/push sin instrucción explícita (convención del repo).

## Tasks

- [x] **T1** — Servicio `StorePaymentMethodsConfigService` + `applyStorePaymentMethodsConfig` + tipos + tests unitarios (default, set/get, cifrado read seam).
- [x] **T2** — UI en `/management/configurations`: sección "Formas de pago" con toggles Zelle/Transferencia ligados al store activo, i18n, tests vitest de la página.
- [x] **T3** — Consumo en `expense-form-modal.tsx` (composición plan→config; sentinel histórico intacto) + tests actualizados.
- [x] **T4** — Consumo en `cart-shell.tsx` y `multi-payment-list.tsx` + tests.
- [x] **T5** — Consumo en `sale-credit-payment-modal.tsx` y `edit-order-modal.tsx` (dejar PAYMENT_OPTIONS estático, derivar de configuración) + tests.
- [x] **T6** — Verificación: vitest afectados + typecheck + lint; reportar `<comando>: <resultado>`.
- [x] **T7** — E2E Playwright NUEVOS: (a) owner desactiva Transferencia en configurations → modal de gasto ya no la ofrece; reactiva → reaparece (`payment-methods-config.spec.ts`, 3 tests); (b) gate de plan sobre config: tienda Pago sin MultiMonedas NUNCA ofrece Zelle aunque el toggle esté ON (`payment-methods-plan-gate.spec.ts`, 1 test). Soporte nuevo: `e2e/support/expense-form-modal.ts`. **Mitad MultiMonedas-POSITIVA cubierta 2026-09-22** (ruta API legítima, ver Progress): `payment-methods-config-multimonedas.spec.ts` (1 test) + `e2e/support/store-multimonedas-fixture.ts`.
- [x] **T8** — Backend E2E: NO nuevos (módulo frontend-only). Persistencia `SalePaymentMethod` ya cubierta por `OrderPaymentMethodPricingTests` (PM1/PM2/PM3) — re-corrida una vez: 3/3 passed.

## Acceptance criteria

- [x] Store sin configurar: catálogo actual byte-idéntico en los 5 sitios — no-regresión (default all-on) en unit tests + E2E "default sin configurar".
- [x] Owner desactiva un método → desaparece de modal gastos, carrito, créditos, editar orden y multipago; reactivar lo restaura — round-trip E2E con Transferencia + unit tests de composición incluyen Zelle en tienda MultiMonedas; el caso E2E Zelle-positivo cubierto por `payment-methods-config-multimonedas.spec.ts` (tienda minted a Superior vía `change-plan`).
- [x] Tienda Pago/Gratis: Zelle NO aparece aunque esté on en config (gate de plan encima) — E2E plan-gate.
- [x] Efectivo siempre presente — switch disabled "Siempre habilitado" (E2E) + compositor fuerza Efectivo (unit).
- [x] Gasto/orden histórica con método fuera del catálogo mantiene su valor visible al editar — sentinel en T3/T5, probado (order-components: radio sentinel checked al final).
- [x] Vitest + typecheck + lint verdes; E2E nuevos verdes (5/5: 4 de la fase inicial + 1 MultiMonedas-positivo, corridas por separado); backend E2E existente verde (PM 3/3).

## Progress

- 2026-09-22: exploración (catálogo estático, 5 sitios de consumo, página configurations FC-B2, expense-crud no toca métodos). Decisiones de usuario: localStorage, toda la app, toggle+plan-gate. Implementación delegada.
- 2026-09-22: T1–T5 implementados. Servicio + compositor en un único archivo nuevo (`store-payment-methods-config-service.ts`); las escrituras reordenan `enabledMethods` al orden canónico del catálogo default. Sección `PaymentMethodsConfigSection({ storeId })` en `configurations.tsx` (Efectivo = Switch disabled "Siempre habilitado", `data-testid="payment-methods-config"` / `"payment-methods-saved"`). Composición plan→config en los 5 sitios; sentinel histórico en modal gastos, créditos y edición de órdenes (`legacyPaymentTypeToSalePaymentMethod(paymentType, currency).method`); filas multipago sin sentinel (solo radios/options transient). Deps de memo: `[storeId]` (servicio) y `[currency, paymentType, user, enabledMethods]` (options). Cobertura nueva: servicio (20), página config (18), gastos (16), cart-shell (64), multipago (16), créditos (34), órdenes (25).
- 2026-09-22: GAP MultiMonedas-POSITIVO cerrado con autorización explícita del usuario (regla reaffirmada: solo NUEVOS archivos E2E — los 3 archivos de la fase anterior son intocables; leer/reusar sus exports está permitido). **Ruta API legítima encontrada**: `POST /v1/stores/{id}/change-plan` es el único camino a una tienda con módulo 15 — pero `ChangeStorePlanCommandHandler.cs:97-101` reserva Superior/VIP a SuperAdmin (un owner solo puede apuntar a Gratis/Pago), y `UpdateStoreCommand` hoy solo permite set-idéntico a no-SuperAdmin. La ruta completa: mint de identidad owner propia (registro+login UI) → `mintSuperAdmin(browser)` (helper de harness documentado FC-D1, identidad fresca promovida por el seeding direct-DB que la suite YA usa para su persona SuperAdmin) → `POST change-plan { storePlanId: 3 }` con el bearer del SuperAdmin (SuperAdmin bypasea el gate de permisos, `HasPermissionAttribute.cs:84`) → pin por API (`GET /v1/stores/{id}` con módulo 15 activo) → re-login del owner (un reload NO re-fetcha `/me` con caché válida, `auth-store` cold-boot lee localStorage) → sesión con `storeModuleIds` incl. 15 y `featureIds` incl. 43 (precondiciones pinzadas con patrón noisy de `store-fixture.ts`). Cadena de hechos verificada en código: seed Superior incluye MultiMonedas (`StorePlanModuleEntityTypeConfiguration.cs:66`), `StoreRoleFeatures` tiene mapeo MultiMonedas→MultiMonedasAdmin (`StoreRoleFeatures.cs:214-219`), `FilterForBilling` mantiene módulos en tienda no vencida (`StoreBillingUtils.cs:60-69`), `CurrencySelect` solo renderiza con módulo 15 (`currency-select.tsx:40-42`), catálogo USD = [Efectivo, Zelle, Transferencia] y labels `salePaymentMethodLabel` (`sale-payment-method-compat.ts:54-66`). Nuevos archivos: `e2e/payment-methods-config-multimonedas.spec.ts` (1 test: Zelle visible en USD con módulo activo; OFF lo quita del modal; ON lo restaura — plan-gate spec de Pago intacto) + `e2e/support/store-multimonedas-fixture.ts` (mint + helpers de modal con índice de combobox para layout con MultiMonedas). El unico toque direct-DB es la promoción del helper SuperAdmin existente — mecanismo de harness ya documentado en `superadmin-session.ts`/FC-D1.md, sobre identidad propia e2e-*, limpiada por el teardown global estándar. Sin cambios a producción backend ni a archivos E2E existentes.

## Verification evidence

- `pnpm vitest run app/shared/lib/payment-methods/__tests__/store-payment-methods-config-service.test.ts`: 20 passed (T1).
- `pnpm vitest run app/management/configurations/routes/__tests__/configurations.test.tsx`: 18 passed (T2 — FC-B2 intacto: heading "Configuraciones" + store select "Tienda activa").
- `pnpm vitest run app/expenses/components/__tests__/expense-form-modal-payments.test.tsx`: 16 passed (T3).
- `pnpm vitest run app/shared/components/__tests__/cart-shell.test.tsx`: 64 passed (5 nuevos, re-pin vía `methodOptions[0]` compuesto); `app/shared/components/multipayments/__tests__/multi-payment-list.test.tsx`: 16 passed (6 nuevos) (T4).
- `pnpm vitest run app/sales/components/__tests__/credit-components.test.tsx`: 34 passed (3 nuevos, seeds real `useAuthStore`); `app/sales/components/__tests__/order-components.test.tsx`: 25 passed (3 nuevos, sentinel radio 'Transferencia (CUP)' checked al final) (T5).
- Todos los archivos tocados en un solo run: `pnpm vitest run <7 archivos>` → 7 passed, 193 passed (Type Errors: no errors).
- `pnpm typecheck` (app dir): `react-router typegen && tsc` → exit 0, sin dist stale.
- `pnpm lint` (desde `frontend-react/`): `turbo run lint` → 4 tasks successful, exit 0 (1 cache hit eslint-config, 3 ejecutadas).
- T7 (E2E Playwright) — `pnpm exec playwright test e2e/payment-methods-config.spec.ts e2e/payment-methods-plan-gate.spec.ts --reporter=list` (desde `frontend-react/`): **4 passed (1.3m)**, 2 workers, chromium. Antes: cache Vite borrada (`apps/web-store-pos/node_modules/.vite`, regla del README). Cierre: `[e2e teardown] 116 filas e2e-* borradas en "smca_test"` — el backend `:5019` corre con el perfil `http-e2e`. Los 4 tests:
  - `payment-methods-config.spec.ts` — "la sección renderiza con Efectivo fijo y toggles Zelle/Transferencia" (29.3s): sección `payment-methods-config`, h2 "Formas de pago", Efectivo `role=switch` disabled + "Siempre habilitado", Zelle/Transferencia `aria-checked=true`.
  - ídem — "default sin configurar: el modal de gasto ofrece Efectivo y Transferencia" (982ms): no-regresión, options `["Efectivo", "Transferencia (CUP)"]`.
  - ídem — "desactivar Transferencia la quita del modal; reactivarla la restaura" (2.1s): OFF → `payment-methods-saved` visible + options `["Efectivo"]`; ON → `["Efectivo", "Transferencia (CUP)"]`.
  - `payment-methods-plan-gate.spec.ts` — "Zelle nunca aparece en el modal de gasto aunque la config lo tenga ON" (24.2s): toggle Zelle `aria-checked=true` en configurations + modal con exactamente `["Efectivo", "Transferencia (CUP)"]` y 0 options "Zelle".
- Entorno: backend `:5019` ARRIBA (`Test-NetConnection localhost -Port 5019` → `TcpTestSucceeded=True`); dev server `:3333` abajo antes de la corrida — Playwright lo levantó solo vía `webServer` (`pnpm dev`, `reuseExistingServer: true`), comando documentado del repo.
- typecheck/lint: `pnpm typecheck`/`pnpm lint` (turbo) solo cubren workspaces; `e2e/` vive en la raíz del workspace sin tsconfig propio — la verificación de los specs nuevos es la corrida Playwright de arriba (compilación del runner). Sin cambios en archivos existentes: `git status --porcelain -- frontend-react/e2e/` → solo los 3 archivos nuevos (`??`).
- T8 (backend E2E) — re-corrida del filtro de persistencia de `SalePaymentMethod`: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~OrderPaymentMethodPricing" --no-restore` → `Passed! Failed: 0, Passed: 3, Skipped: 0` (PG `localhost:5432` UP, DB `smca_test`). NO se agregan backend E2E nuevos: el módulo es frontend-only (localStorage) y no toca superficie backend.
- T7 (E2E Playwright, mitad MultiMonedas-positiva, 2026-09-22) — `pnpm exec playwright test e2e/payment-methods-config-multimonedas.spec.ts --reporter=list` (desde `frontend-react/`): **1 passed (19.5s, test 10.6s)**, 1 worker, chromium. `[e2e teardown] 130 filas e2e-* borradas en "smca_test" (StoreUsage=4, StoreModule=26, StoreRoleFeature=91, Store=2, UserRole=3, Owner=2, User=2)` — los 2 stores/owners corresponden a las identidades minted (owner + SuperAdmin) de este spec. El test: mint owner privado → `change-plan` a Superior con SuperAdmin → re-login → configurations con toggle Zelle `aria-checked=true` → modal de gasto con `expense-currency-select` visible (prueba del módulo 15 en sesión) → USD seleccionado → options `["Efectivo", "Zelle", "Transferencia (USD)"]` → Zelle OFF (`payment-methods-saved` visible) → modal USD `["Efectivo", "Transferencia (USD)"]` → Zelle ON → modal USD `["Efectivo", "Zelle", "Transferencia (USD)"]`. Plan-gate spec de Pago sigue intacto (no ejecutado en esta corrida; archivo sin cambios).
- Entorno (corrida MultiMonedas-positiva): backend `:5019` ARRIBA (`TcpTestSucceeded=True`); `:3333` abajo — Playwright lo levantó vía `webServer` (mismo comportamiento documentado en la corrida anterior).
- Verificación de solo-archivos-nuevos (post MultiMonedas): `git status --porcelain -- frontend-react/e2e/` → exactamente 5 archivos `??` nuevos, **cero modificados**: `payment-methods-config.spec.ts`, `payment-methods-plan-gate.spec.ts`, `payment-methods-config-multimonedas.spec.ts`, `support/expense-form-modal.ts`, `support/store-multimonedas-fixture.ts`. Cero cambios en specs/support/playwright.config existentes.
- Spot checks del orquestador (post-delegación): `pnpm vitest run <7 archivos afectados>` → 7 pass, 193 pass (re-run, 6.4s); `pnpm exec playwright test <2 specs nuevos>` → 4 passed (re-run, 32.8s; `git status -- e2e/` = solo 3 archivos nuevos).
- Spot check final del orquestador (trío completo, una sola pasada, 3 workers): `pnpm exec playwright test e2e/payment-methods-config.spec.ts e2e/payment-methods-plan-gate.spec.ts e2e/payment-methods-config-multimonedas.spec.ts --reporter=list` (desde `frontend-react/`) → **5 passed (26.9s)**. El spec MultiMonedas (serial, minted) corrió intercalado con los 2 worker-scoped sin contaminación: teardown `246 filas e2e-* borradas` (Store=4, Owner=4, User=4 → los 4 stores/owners incluyen los minted de ambos specs). Cobertura E2E del módulo completa: round-trip Transferencia (Pago), gate Zelle-plan (Pago), round-trip Zelle USD (Superior/MultiMonedas) — los 3 casos de la tabla de decisión plan×config.
- NO commit/push realizado (todo queda sin commit, regla del repo).