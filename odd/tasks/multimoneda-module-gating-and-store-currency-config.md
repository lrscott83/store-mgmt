# Feature: multimoneda-module-gating-and-store-currency-config

Rama: `dev` (árbol limpio al iniciar). Alcance autorizado: **solo `frontend-react/`** (más este doc). Sin backend.

## Objetivo

1. Que el **selector de moneda del carrito de venta** y la vista **Tasas de Cambio (`management/channel-rates`)** estén habilitados por el módulo **MultiMonedas (15)**, no por MultiPayments (16).
2. Añadir en **Configuración de la tienda** (gated por MultiMonedas) dos selects en una misma línea: **Moneda de Compra** y **Moneda de Venta**, por defecto **CUP**. La moneda de Venta es la que sale por defecto en el carrito; la de Compra es el default al añadir una entrada del día y al crear un producto del catálogo.
3. Corregir el fallo reportado: "producto en USD, cambio a CUP y dice que no hay tasa" pese a tener la tasa registrada.

## Problema / por qué

- Hoy select de moneda y channel-rates dependen de MultiPayments (16). Un plan Superior tiene MultiMonedas (15) sin MultiPayments; esos stores no pueden operar multi-moneda.
- La conversión multi-moneda del carrito (`convertCartLines`, `guardCurrency allowMixedCurrencies`) está atada a `hasMultiPaymentsModuleAvailable`.
- No existe ninguna moneda por defecto de tienda (ni frontend ni backend). Hay que introducirla.
- Bug verificado (T18, `cart-rate-cup-720.test.ts`): en el registro de tasas, `currency` = "unidades de esa moneda por 1 USD". Una fila `Moneda=USD` es el pivote y **nunca** resuelve CUP. La tasa "1 USD = 700/750 CUP" debe registrarse con `Moneda=CUP`. El código de conversión es correcto; el fallo es de semántica de entrada de datos + un refresco de tasas en el carrito.

## Decisiones tomadas (usuario)

- Persistencia de las monedas por defecto: **localStorage por tienda** (patrón `StorePaymentMethodsConfigService`). Sin backend.
- Precedencia en el carrito: **la moneda de Venta de la tienda siempre** gana al abrir; el cambio manual del cajero dura solo la sesión.

## Restricciones

- NUNCA tocar/leer `frontend/` (Angular legacy).
- NUNCA modificar tests E2E ni support E2E (`frontend-react/e2e/**`).
- Tests unitarios sí se pueden crear/actualizar.
- Sin comentarios innecesarios; artefactos en inglés salvo copy de UI/i18n (español por convención existente).
- Cada tarea cierra con commit de unidad de trabajo (Conventional Commits), sin co-author.

## Alcance de archivos (esperado)

- `frontend-react/packages/domain/src/enums/index.ts` (solo lectura; sin cambios salvo necesidad)
- NUEVO `frontend-react/apps/web-store-pos/app/shared/lib/store-currency-config-service.ts`
- `frontend-react/apps/web-store-pos/app/shared/lib/storage/storage-keys.ts`
- `frontend-react/apps/web-store-pos/app/management/configurations/routes/configurations.tsx`
- `frontend-react/apps/web-store-pos/app/shared/lib/auth/authorization-service.ts`
- `frontend-react/apps/web-store-pos/app/shared/components/multimonedas/currency-select.tsx`
- `frontend-react/apps/web-store-pos/app/shared/components/multipayments/cart-currency-select.tsx`
- `frontend-react/apps/web-store-pos/app/shared/components/cart-shell.tsx`
- `frontend-react/apps/web-store-pos/app/sales/routes/sale.tsx`
- `frontend-react/apps/web-store-pos/app/sales/routes/wholesale.tsx`
- `frontend-react/apps/web-store-pos/app/inventory/routes/egress.tsx`
- `frontend-react/apps/web-store-pos/app/management/channel-rates/routes/channel-rates.tsx`
- `frontend-react/apps/web-store-pos/app/shared/lib/config/menu-config.ts`
- `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts`
- Tests unitarios nuevos/actualizados.

## Tareas

### T1 — Servicio de monedas de tienda (localStorage por tienda)
- NUEVO `StoreCurrencyConfigService(storeId)` con `getConfig(): { buyCurrency: Currency; sellCurrency: Currency }` y `setConfig(partial)` (o `setBuyCurrency`/`setSellCurrency`).
- Defaults `Currency.CUP`. Valida contra el set de monedas válidas; valor inválido → CUP.
- Persiste con `StorageKeys.entityKey('storeCurrencyConfig', storeId)` + `encryptEntity`; lee con `readEntityOrThrow`; auto-init en clave ausente; `MissingDataKeyError` → default sin persistir (mismo patrón que payment-methods).
- Registrar `'storeCurrencyConfig'` en `BUSINESS_ENTITY_NAMES`.
- Checks: test unitario nuevo (default, round-trip, valor inválido, clave ausente).
- Criterio: el servicio lee/escribe solo; el gate de módulo se aplica en los sitios de consumo.

### T2 — Configuración de tienda: selects Compra/Venta (gated MultiMonedas)
- En `configurations.tsx`, cuando `hasMultiMonedasModuleAvailable(user)`, renderizar en UNA misma línea dos selects: **Moneda de Compra** y **Moneda de Venta** (labels i18n), default CUP, persistidos vía T1.
- Sin MultiMonedas: no se renderiza nada nuevo.
- Checks: tests del componente (visible con módulo 15, oculto sin él, default CUP, persiste cambio).
- Criterio: keys i18n EN/ES coherentes (solo `es.ts` existe hoy; seguir el patrón existente).

### T3 — Regate a MultiMonedas y desacople de la conversión en el carrito
- Añadir `hasMultiMonedasModuleAvailable(user)` a `authorization-service.ts`; `hasMultiMonedasAvailable` de `multimonedas/currency-select.tsx` delega en él.
- `cart-currency-select.tsx`: guard = `hasMultiMonedasModuleAvailable` (ya no MultiPayments).
- `cart-shell.tsx`:
  - `multiMonedasAvailable` nuevo; `multiCurrencyActive = multiMonedasAvailable && items.length > 0`.
  - `multiPaymentRates` se carga si `multiMonedasAvailable || multiPaymentsAvailable`.
  - `preferredConversion`, `preferredCurrencyUnconvertible`, `saleCurrency` usan `multiMonedasAvailable` (no `multiPaymentsAvailable`).
  - `totalAmount`: multiPaymentsActive → `lineConversion.total` (sin pricing, comportamiento actual); si no, `applyPaymentPricing(lineConversion.total or total(), pricing)` según multiMonedas.
  - `lineConversionBlocked` usa `multiCurrencyActive`; display de líneas, banner de error y `orderCartItems` de submit usan `multiCurrencyActive`.
  - `handleClear` resetea a la moneda de Venta de la tienda cuando `multiMonedasAvailable`.
- `sale.tsx`, `wholesale.tsx`, `egress.tsx`: `allowMixedCurrencies: hasMultiMonedasModuleAvailable(user)`.
- Checks: tests unitarios nuevos/actualizados; suite `cart-shell.test.tsx` verde; `currency-guard`/`sale`/`wholesale`/`egress` relevantes verdes.
- Criterio: un store con módulo 15 y sin 16 muestra el select, convierte líneas y persiste la venta en la moneda de venta; sin módulo 15 el comportamiento es idéntico al actual.

### T4 — Moneda de Venta por defecto en el carrito + refresco de tasas
- `cart-shell.tsx`: el valor inicial de `preferredCartCurrency` = moneda de Venta de la tienda (T1) si existe, si no CUP (ya no `readCartCurrencyPreference`). Se conserva `writeCartCurrencyPreference` al cambiar (in-sesión) o se elimina su uso en lectura; documentar.
- `multiPaymentRates` se recalcula al abrir el carrito (añadir `isOpen` a las deps) para no quedar con tasas cacheadas de un `CartShell` persistente en el navbar.
- Checks: test unitario: carrito abre con la moneda de Venta de la tienda; registrar tasa y abrir el carrito la ve.
- Criterio: la moneda de Venta de la tienda manda en cada apertura; el cambio del cajero vive la sesión.

### T5 — Guardarraíl del registro de tasas (bug del reporte)
- `channel-rates.tsx`: excluir `Currency.USD` de `CURRENCY_OPTIONS` (es el pivote; una fila USD jamás resuelve otra moneda y causó el fallo). Añadir/ajustar label/ayuda i18n para que quede claro que la moneda es la que se cotiza contra 1 USD (ej.: "Moneda a la que equivale 1 USD").
- Mantener `Currency.CUP` como default.
- Checks: test del form (USD no ofrecido; registrar CUP persiste la fila correcta; `channel-rate-currency` sin opción USD).
- Criterio: no se puede volver a crear la fila USD que rompía USD→CUP.

### T6 — Gating de la vista Tasas de Cambio
- `channel-rates.tsx` `clientLoader`: `[EModules.MultiMonedas]` en vez de `[EModules.MultiPayments]`.
- `menu-config.ts`: item `MENU.CHANNEL_RATES` con `moduleIds: [EModules.MultiMonedas]`.
- Checks: tests de loader/menu actualizados.
- Criterio: un store con 15 y sin 16 ve y abre la vista; sin 15 no la ve.

### T7 — Verificación final
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (excluyendo E2E) en `frontend-react/`.
- Reportar resultados reales; nada de "verde" sin correr.

## Criterios de aceptación (feature)

- Store MultiMonedas (15): select de moneda en carrito visible, channel-rates visible, configuración con Compra/Venta, defaults CUP.
- Store sin MultiMonedas: comportamiento actual intacto (select oculto, ruta denegada, sin sección nueva).
- Compra/Venta por defecto: Compra aparece en entrada del día y alta de producto; Venta por defecto en el carrito.
- USD→CUP 700/750 con fila `Moneda=CUP` convierte correctamente; la fila USD ya no es registrable.
- Typecheck + lint + tests no-E2E verdes.

## Checks / comandos

- `cd frontend-react && pnpm typecheck`
- `cd frontend-react && pnpm lint`
- `cd frontend-react && pnpm test` (no E2E)
- Dirigidos: `pnpm --filter @store-mgmt/web-store-pos exec vitest run <archivo>`

## Notas de integración de rama (2026-10-02)

- `dev` actualizado con `origin/qa` y `origin/test` (sin verificación post-merge, pedido del usuario).
  - Merge `origin/qa` → `99dac13e`; merge `origin/test` → `6f2932b8`. Ambos limpios, sin conflictos.
- Revisión de solape: `qa` NO tocó nada de esta feature. Archivos de qa = web-catalog/imágenes (backend) + `public-catalog.tsx`, `catalog-product-editor.tsx`, `messages.tsx` + docs. `test` = E2E/docs.
- Único archivo compartido: `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` (qa/test añadieron claves de mensajes/catálogo; esta feature añadirá claves de monedas — sin conflicto de contenido).
- Conclusión: ninguna tarea T1–T7 quedó hecha por qa/test; se continúa con el plan sin cambios de alcance.

## Bloqueo E2E pendiente (2026-10-02)

- `frontend-react/e2e/multipayments-currency-block.spec.ts` codifica la precedencia VIEJA: escribe `lizoft.cart-currency-<uid>=USD` (líneas 196-204) y tras recargar/registrar la tasa espera que la preferencia por-usuario gane (línea 246: `CURRENCY_SELECT` = '1' / total `0.10 USD`).
- T4 (decisión del usuario: "la moneda de Venta de la tienda siempre") invalida esa expectativa: sin config de tienda, `sellCurrency=CUP`, el carrito abre en CUP (0). **La línea 246 fallará.**
- La tienda del spec SÍ tiene el módulo 15 (nace Superior 2..15 + 16 del fixture), así que el selector sigue renderizando; solo cambió la precedencia.
- E2E es intocable sin autorización explícita → **AUTORIZADO por el usuario 2026-10-02** para actualizar `multipayments-currency-block.spec.ts` a la nueva precedencia (tarea T8).

## Progreso

- [x] T1 Servicio de monedas de tienda — commit `afe5efff` (9/9 + 49/49 verdes)
- [x] T2 Config view Compra/Venta — commit `82f39667` (40 + 24 + 17 verdes; typecheck app limpio)
- [x] T3 Regate MultiMonedas + desacople conversión — commit `09c65e27` (154 tests, typecheck 0)
- [x] T4 Moneda de Venta por defecto + refresco tasas — commit `0bfdcf7c` (91 tests, typecheck 0). **Bloqueo E2E detectado: ver Notas.**
- [x] T5 Guardarraíl registro de tasas (excluir USD) — commit `fe2cd29c`
- [x] T6 Gating channel-rates + menu — commit `fe2cd29c` (52 + 54 tests, typecheck 0)
- [x] T8 Actualizar E2E multipayments-currency-block.spec.ts a la nueva precedencia (AUTORIZADO) — commit `ad5a1f1e`
- [x] T7 Verificación final (typecheck/lint/test no-E2E)

## Evidencia de verificación (2026-10-02)

- `pnpm turbo run typecheck lint test --force` (frontend-react): 11/12 tasks OK. **typecheck OK**, **lint OK**. `web-store-pos#test`: 4928 passed / 28 failed en 16 archivos, TODOS en `auth-store.offline.test.ts` / `decryption-failure-policy.ts` (TDZ `Cannot access 'announced' before initialization` + timeouts) — flakiness pre-existente bajo carga paralela (ya documentada en memoria #1387/#1507), NO causada por la feature.
  - `auth-store.offline.test.ts` en aislamiento → **10/10 passed** (confirma la flakiness).
- Área de la feature en conjunto (cart-shell, channel-rates, configurations, authorization-service, multimonedas, cart-rate-cup-720, sidebar, store-currency-config-service, currency-guard, wholesale, sale): **16 archivos / 352 tests passed, 0 type errors, EXIT 0**.
- E2E `multipayments-currency-block.spec.ts`: actualizado (autorizado) pero NO ejecutado (requiere dev server + PostgreSQL).
- Nada de backend tocado. `frontend/` (Angular) nunca tocado.

## Commits (rama dev)

- `afe5efff` feat(currency): add per-store buy/sell currency config service
- `82f39667` feat(configurations): add buy/sell currency selects gated by MultiMonedas
- `09c65e27` refactor(cart): gate multi-currency on MultiMonedas module 15
- `0bfdcf7c` feat(cart): default cart currency to store sale currency and refresh rates on open
- `fe2cd29c` fix(channel-rates): gate by MultiMonedas and stop registering USD pivot rows
- `ad5a1f1e` test(e2e): pin store sale-currency precedence in cart currency block spec

## Estado final

- Todas las tareas T1–T8 cerradas. Feature completa en `dev` (sin push, sin PR).
- Pendiente de decisión del usuario: push/PR (política de repo). No hay gate de review ejecutado (RDD no se invocó en esta sesión).


## Rutas de implementación

- T1/T2: delegado (writer) — 3+ archivos.
- T3/T4: delegado (writer) — refactor de `cart-shell.tsx` + 3 guards.
- T5/T6: delegado (writer) — `channel-rates.tsx` + menu + i18n.
- T8: delegado (writer) — E2E autorizado.
- Verificación: padre (comandos) + revisión estructural.
