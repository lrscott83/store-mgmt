# Feature: payment-channels-and-multipayment

Rama: `dev` (árbol limpio al iniciar). **Todos los commits van en esta rama `dev`, por tarea** (decisión del usuario 2026-09-23) — sin PRs ni cadenas de slices. Alcance autorizado: **solo `frontend-react/`** — sin backend de producción, sin Angular.

## Objective

1. **Página "Canales de pago" (`/management/channel-rates`) = único lugar** donde se listan los **canales (método + moneda)** y se define su **equivalencia** (la tasa). La página se mantiene; se corrige para que liste **los métodos de pago reales que tenemos**, no las "formas de pago" genéricas. La página **de Configuraciones NO se toca** (se queda como está hoy).
2. **Carrito**: el selector "Moneda" sube a la fila del encabezado, **antes del botón "Limpiar"** y en la misma fila.
3. **Carrito**: cambiar la moneda **se bloquea** si alguna línea no se puede convertir (hoy la línea se cae del total y queda "0 USD").
4. **Multipago**: por defecto **una fila Efectivo con el monto total**; "Agregar pago" abre un **popup** para elegir el canal; cada fila con **botón de eliminar** (ícono de papelera); moneda y monto editables con recálculo; se **elimina el botón "Cobrar"**; el mensaje de tasa **no aparece por defecto**.
5. **Historial**: normalización de las **ventas ya registradas** — Efectivo se mantiene; Transferencia y Zelle pasan a **"Transferencia (CUP)"**.
6. **Inputs numéricos** (Cantidad, Precio, Monto): permitir borrar el "0" mientras se escribe, validando el valor después.
7. **Cobertura E2E** completa del módulo en el frontend React (specs nuevos) + honestidad sobre el backend (sin cambios ⇒ sin E2E nuevos allí).

## Problem / Why

Estado actual verificado en código:

- La página `/management/channel-rates` existe y ya registra tasas por canal (`ChannelRateOfflineService`, append-only), pero su selector ofrece **cualquier combinación de 3 métodos × 7 monedas** ⇒ permite registrar canales que no existen (p. ej. "Zelle (CUP)", "Efectivo (MLC)"). El catálogo real por moneda ya existe en el dominio (`paymentMethodOptionsForCurrency`, `packages/domain/src/commons/payment-pricing.ts:58-79`).
- En el carrito, cambiar la moneda **excluye del total** toda línea sin tasa (`cart-line-conversion.ts:63-73`) ⇒ el total queda en **0** y se pinta "0 USD". Y como la moneda se recuerda por usuario (`lizoft.cart-currency-<userId>`), la próxima venta abre ya en USD ⇒ el mensaje "No existe una tasa de cambio vigente para el canal o la moneda solicitados." (`packages/domain/src/errors/channel-rate-errors.ts:9-11`) aparece **por defecto**.
- Multipago: `multi-payment-add` **sí** agrega una fila, pero nace con `amount: 0` y las filas ≤ 0 se ignoran (`multi-payment-list.tsx:126-128`) ⇒ visualmente "no agrega nada"; con doble clic rápido la segunda pulsación pisa la primera (closure obsoleto).
- El botón "Cobrar" (`multi-payment-settle`, `multi-payment-list.tsx:382-391`) **no tiene `onClick`**: es un botón muerto. El que registra la venta es "Registrar" (`cart-shell.tsx:548-555`).
- Los campos numéricos usan número directo (`value={quantity}` + `Number(e.target.value)`): al vaciar el campo queda `0` y se repinta ⇒ no se puede borrar el 0. Afecta Cantidad y Precio (`sale-product-row.tsx:89-112`) y Monto (`multi-payment-list.tsx:290-298`). El patrón correcto ya existe en el mismo carrito (`cart-shell.tsx:603-605`).
- El backend **no tiene API de ventas**: las órdenes viven en el dispositivo (`OrderOfflineService`) y se respaldan por el ZIP de sincronización. `OrderPayment` y `ChannelExchangeRate` existen en la BD como **espejo sin endpoints**.

## Decisions (confirmadas por el usuario, 2026-09-23)

| # | Decisión | Respuesta del usuario |
|---|---|---|
| D1 | Dónde vive la config de canales + equivalencia | **Todo en la página "Canales de pago"**. La página de **Configuraciones NO se toca** (se queda como está hoy, con sus 3 interruptores) |
| D2 | "Transferencia y Zelle pasan a Transferencia (CUP)" | Aplica a **ventas ya registradas** (normalización del historial) |
| D3 | Cambio de moneda sin tasa disponible | **Bloquear el cambio** (no permitir la selección) |
| D4 | Gate del selector "Moneda" del carrito | **Sigue con MultiPayments (16)** |
| D5 | Página "Canales de pago" | **Se mantiene**, pero debe listar **los métodos de pago reales** (canales método + moneda), no las formas de pago genéricas |
| D6 | Backend de producción | **No** — todo queda en el frontend (localStorage + sync/backup) |
| D7 | Commits | **Siempre en la rama `dev`**, por tarea |
| D8 | E2E existentes | **Autorizado** actualizarlos. Con el alcance actual, el único que lo necesita es `multipayments.spec.ts` |
| D9 | Venta sin MultiPayments pero con MultiMonedas (15) | **Se mantiene como hoy**: **un solo** método de pago, elegido **en la venta** entre los configurados en Configuraciones. No se toca |
| D10 | Con MultiPayments (16) activo | **Todo (canales método + moneda y su equivalencia) vive en la vista "Canales de pago"** |
| D11 | Página "Canales de pago" sin MultiPayments (16) | **Se oculta**: la página (canales + equivalencia) existe **solo con el módulo 16 activo** |

Decisiones heredadas que se mantienen (no se re-abren):

- **Efectivo siempre habilitado** (no desactivable) — regla ratificada en `odd/tasks/store-payment-methods-config.md`.
- **Reglas de plan/módulo aplican ENCIMA** de la config de la tienda. Pinned por `payment-methods-plan-gate.spec.ts` — **invariante, no se toca**.
- El multipago y el selector de Moneda **siguen gated por el módulo 16** (D4) ⇒ el bloque legacy del carrito para tiendas sin módulo 16 **no se elimina**.
- La normalización del historial (D2) se aplica **solo en el camino de lectura de órdenes registradas**, NO en el helper compartido `salePaymentMethodLabel` (si se metiera ahí, rompería los catálogos de los modales de gasto/orden y los specs del catálogo USD).
- La sección de pagos de **Configuraciones no se modifica** (D1) ⇒ `payment-methods-config.spec.ts`, `payment-methods-config-multimonedas.spec.ts`, `payment-methods-plan-gate.spec.ts` y `configurations.spec.ts` **quedan intactos**.

## Consecuencia explícita de D11 (para que no sorprenda)

Hoy la página `/management/channel-rates` es alcanzable con la feature `Configurations` (74), sin importar el módulo. Con D11 **deja de estar disponible sin el módulo 16**: se oculta del menú (`menu-config.ts:384-385`) y su ruta queda gateada por el módulo. Es un cambio deliberado, confirmado por el usuario.

Impacto verificado antes de decidir: **ningún spec E2E existente navega a esa ruta salvo `multipayments.spec.ts:347`** (tienda con módulo 16, vía `enableMultiPaymentsModule`) y **ningún spec afirma su entrada de menú** — o sea, el cambio de gate no rompe ningún E2E existente.

## Modo TDD

**off.** Fuente: engram `sdd/store-mgmt/testing-capabilities` #820 (override explícito, 2026-08-14). Nota de conflicto: `frontend-react/openspec/config.yaml:4` declara `strict_tdd: true`, pero proviene del pipeline de backend retirado; los ODD docs recientes usan **off** (#820). Checks: `pnpm test` (Vitest), `pnpm typecheck`, `pnpm lint` desde `frontend-react/`; E2E: `pnpm test:e2e` (Playwright).

## Design

### Catálogo de canales

Un **canal** = `(method: SalePaymentMethod, currency: Currency)`. El catálogo válido ya existe por moneda en `paymentMethodOptionsForCurrency(currency)` (`packages/domain/src/commons/payment-pricing.ts:58-79`):

| Moneda | Canales |
|---|---|
| CUP | Efectivo (CUP), Transferencia (CUP) |
| USD | Efectivo (USD), Zelle (USD), Transferencia (USD) |
| MLC | Transferencia (MLC) |
| CLA | Transferencia (CLA) |
| EUR / CAD / MXN | Efectivo (EUR / CAD / MXN) |

Se agrega al dominio: enumeración canónica de canales + clave estable `channelKey(method, currency)` + validador `isValidChannel(method, currency)`. El label visible sigue siendo `salePaymentMethodLabel(method, currency)` ("Transferencia (CUP)").

### Página "Canales de pago"

- El selector de método/moneda se limita a **canales reales** (método + moneda) del catálogo; se elimina la posibilidad de registrar combinaciones inexistentes.
- La lista/historial de tasas registradas sigue mostrando lo ya registrado (append-only, sin borrar nada).
- Con el módulo 16 activo, esta vista concentra **todo**: la lista de canales (método + moneda) y su equivalencia (D10). **Sin el módulo 16 la página no se ofrece** (D11): se oculta del menú y la ruta queda gateada.
- Se reutiliza `ChannelRateOfflineService` (mismo almacén, sin cambios de formato ⇒ sin trabajo de sync).

### Carrito

- **Moneda**: `CartCurrencySelect` se renderiza dentro de la fila del encabezado, junto a "Limpiar" / "Registrar", **antes de "Limpiar"**. Sigue gated por módulo 16 (D4).
- **Bloqueo del cambio (D3)**: el `handleChange` evalúa primero si **todas** las líneas del carrito tienen tasa resoluble hacia la moneda destino; si alguna no la tiene, **rechaza el cambio** (el select se queda en la moneda actual) y muestra un aviso claro con la línea/moneda culpable. El total **nunca** queda en 0 por una línea no convertible.
- **Fila por defecto**: una fila `Efectivo` con `amount` = total de la venta (misma moneda ⇒ no requiere tasa ⇒ **sin mensaje de tasa**).
- **Agregar pago**: botón que abre un **popup** con el catálogo de canales válidos del contexto de la venta; al confirmar se agrega la fila.
- **Fila**: moneda y monto editables; **botón de eliminar con ícono de papelera** al final; todo recalcula (pagado/restante/vuelto) y se actualiza el guard de registro.
- **Se elimina** el botón "Cobrar" (`multi-payment-settle`).
- **Sin módulo 16 (con MultiMonedas)**: la venta conserva el flujo actual — **un solo** método de pago, elegido entre los configurados en Configuraciones (D9). El bloque legacy del carrito **no se toca**.

### Historial (D2)

Normalización **en el camino de lectura de órdenes registradas** (historial, órdenes de hoy, filtros por método y modal de edición): Efectivo → Efectivo; Transferencia → "Transferencia (CUP)"; Zelle → "Transferencia (CUP)". Se implementa como resolución de presentación/lectura, **sin reescribir los datos persistidos** y sin tocar `salePaymentMethodLabel`.

**Consecuencia visible (explícita):** las ventas históricas registradas con Zelle pasarán a mostrarse como "Transferencia (CUP)" en el historial, los filtros y el modal de edición. Los datos guardados no se alteran.

## Scope

**Dentro:**
- `frontend-react/packages/domain/src/commons/payment-pricing.ts` (+ helpers de canal, + tests)
- `frontend-react/apps/web-store-pos/app/management/channel-rates/**` (selector + lista + gate, + tests)
- `frontend-react/apps/web-store-pos/app/shared/components/cart-shell.tsx`
- `frontend-react/apps/web-store-pos/app/shared/components/multipayments/**` (lista, selector de moneda, popup nuevo)
- `frontend-react/apps/web-store-pos/app/sales/components/sale-product-row.tsx` (inputs de cantidad/precio)
- Camino de lectura de órdenes: `sales/lib/services/order-offline-service.ts` + helpers de presentación y filtros
- i18n (claves nuevas de la página y del popup)
- **Specs E2E NUEVOS** (add-only) + `multipayments.spec.ts` (autorizado, D8)

**Fuera:**
- `app/management/configurations/**` y `shared/lib/payment-methods/store-payment-methods-config-service.ts` — **NO se tocan** (D1).
- `frontend/` (Angular) — prohibido.
- Backend de producción y E2E de backend — D6.
- El bloque legacy del carrito (tiendas sin módulo 16) — se mantiene tal cual.
- Las reglas de plan/módulo — no se modifican.

## Constraints (NON-NEGOCIABLE)

- **NUNCA** tocar `frontend/` (Angular legacy).
- **NUNCA** modificar, borrar, renombrar, saltar ni "arreglar" un E2E existente ni sus support files **sin autorización explícita**. Con el alcance actual el único autorizado es `multipayments.spec.ts` (D8); **cualquier otro** requiere una nueva autorización. Agregar specs nuevos sí está permitido.
- **NUNCA** tocar código de producción del backend (D6) ni sus E2E.
- **NO** tocar la página de Configuraciones ni su servicio de config (D1).
- **NO regresión**: tienda sin configurar ⇒ mismo comportamiento que hoy.
- **NO** romper el invariante del plan-gate.
- Sin `any`; ESLint `--max-warnings=0`; Prettier; sin atribución de IA en commits; commits convencionales en `dev`.

## Tasks

Cada tarea cierra con: tests que la cubren + `<comando>: <resultado observado>` + commit en `dev`. Ruta declarada por tarea (inline = orquestador; delegada = un writer acotado).

- [ ] **T1** — Dominio: enumeración canónica de canales + `channelKey` + `isValidChannel`. **Ruta:** delegada (writer) — toca el paquete de dominio compartido + tests.
  **AC:** por cada `Currency` se enumeran exactamente los canales de la tabla de diseño; `channelKey` es estable y sin colisiones; `isValidChannel` rechaza combinaciones inexistentes (Zelle+CUP, Efectivo+MLC).
- [ ] **T2** — Página "Canales de pago": selector limitado a canales reales + gate por módulo 16 en la página completa. **Ruta:** delegada (writer).
  **AC:** no se puede registrar un canal inexistente; el historial sigue mostrando lo ya registrado; **sin el módulo 16 la página no se ofrece** (se oculta del menú y la ruta queda gateada) — D11.
- [ ] **T3** — Carrito: "Moneda" a la fila del encabezado, antes de "Limpiar". **Ruta:** delegada (writer).
  **AC:** mismo renglón, antes de "Limpiar"; sigue gated por módulo 16; el resto del carrito sin cambios.
- [ ] **T4** — Carrito: bloquear el cambio de moneda cuando alguna línea no convierte (arregla "0 USD"). **Ruta:** delegada (writer).
  **AC:** con una línea sin tasa, el select no cambia y aparece un aviso claro; el total nunca se pinta "0 <moneda>"; con tasa disponible el cambio se permite y convierte.
- [ ] **T5** — Multipago: fila por defecto Efectivo con el monto total; sin mensaje de tasa por defecto. **Ruta:** delegada (writer).
  **AC:** carrito con ítems ⇒ exactamente 1 fila Efectivo con el total; sin texto de tasa; "Registrar" habilitado cuando cubre.
- [ ] **T6** — Multipago: "Agregar pago" con popup + eliminar por fila + edición moneda/monto con recálculo. **Ruta:** delegada (writer).
  **AC:** el popup ofrece solo canales válidos; agregar crea la fila con el canal elegido; el botón de papelera la elimina; editar moneda/monto recalcula pagado/restante/vuelto y el guard.
- [ ] **T7** — Multipago: eliminar el botón "Cobrar". **Ruta:** inline (cambio acotado ya entendido).
  **AC:** `multi-payment-settle` no existe; el registro de la venta sigue por "Registrar".
- [ ] **T8** — Inputs numéricos: permitir borrar el 0 (Cantidad, Precio, Monto) con validación posterior. **Ruta:** delegada (writer).
  **AC:** se puede vaciar el campo y escribir; al confirmar, un valor inválido no persiste basura (vuelve al último válido o 0 según corresponda).
- [ ] **T9** — Historial: normalización de ventas ya registradas (Efectivo / Transferencia (CUP)). **Ruta:** delegada (writer).
  **AC:** en historial, órdenes de hoy, filtros y modal de edición: Efectivo → "Efectivo"; Transferencia y Zelle → "Transferencia (CUP)"; los datos persistidos no se reescriben; `salePaymentMethodLabel` intacto.
- [ ] **T10** — E2E NUEVOS (frontend, add-only): 4 specs (ver §E2E). **Ruta:** delegada (writer) por spec o por par.
  **AC:** todos verdes con el backend `:5019` (perfil `http-e2e`) y el teardown reportando las filas `e2e-*` borradas.
- [ ] **T11** — E2E EXISTENTE `multipayments.spec.ts` (T10.1 + T10.2): actualizar según la propuesta autorizada. **Ruta:** delegada (writer).
  **AC:** los dos casos fijan el comportamiento nuevo; el bloqueo por subpago se conserva intacto; ningún otro E2E existente modificado (`git status`).
- [ ] **T12** — Verificación final: `pnpm test`, `pnpm typecheck`, `pnpm lint`, E2E nuevos + el actualizado, y re-corrida de los E2E de backend existentes que cubren la superficie servidor (sin cambios). **Ruta:** delegada (fresh worker) + spot check del orquestador.
  **AC:** todo verde, evidencia `<comando>: <resultado>` en este documento.

## E2E existentes que habría que modificar (AUTORIZADO — D8)

> Regla del repo: no se toca ningún E2E existente sin autorización. **El usuario autorizó el 2026-09-23.** Con el alcance actual (D1: Configuraciones no cambia), **el único spec que lo necesita es este**:

### `frontend-react/e2e/multipayments.spec.ts`

- **Qué prueba hoy:** T10.1 fija el selector de Moneda (opciones `CUP`/`USD`) y que al elegir USD sin tasa aparece el error `RateNotFound` + "Registrar" deshabilitado, y que la preferencia persiste al recargar. T10.2 fija el flujo de dos pagos: "Agregar pago" inserta una fila **en blanco** inline, se eligen moneda/monto por fila, y se valida pagado/restante/vuelto (incluido sobrepago y bloqueo por subpago). Además registra una tasa CUP en `/management/channel-rates` sin tocar los selects (usa el default actual `Efectivo` + `CUP`).
- **El problema (simple):** con los cambios, (a) el cambio de moneda ya **no** se permite cuando no hay tasa — se bloquea, así que no puede aparecer el error ni persistir la preferencia; (b) el multipago ya **no** arranca vacío: arranca con una fila Efectivo por el total, y "Agregar pago" abre un **popup** en vez de insertar una fila en blanco ⇒ los conteos de filas y los localizadores por `data-testid` (que pasarían a matchear 2 elementos) dejan de ser válidos; (c) si el default del selector de canales de la página cambia, el paso que registra la tasa CUP necesita elegir el canal explícitamente.
- **Propuesta:** reescribir T10.1 para fijar el **bloqueo** (el select se queda en CUP / aviso visible, el total nunca queda en "0 USD") y, tras registrar una tasa, que el cambio **sí** proceda y convierta. Reescribir T10.2 partiendo de la fila por defecto, agregando el segundo canal **por el popup**, con localizadores **por fila** (`rows.nth(n)`), eligiendo explícitamente el canal en la página de canales, y agregando la aserción de que `multi-payment-settle` **no existe**. Se conserva intacta la aserción de subpago bloqueado (es un invariante).

### Backend

**Ninguno.** El módulo es frontend-only (D6): el backend no tiene API de ventas y los E2E de backend no ven localStorage ni la UI. Ya existe cobertura servidor de la superficie implicada: `OrderPaymentMethodPricingTests` (PM1–PM3), `MultiPaymentsPersistenceMirrorTests` (MPM1–MPM3), `MultiPaymentsSequenceFixupTests` (SF1–SF2), `StorePlanCatalogTests` (Superior vs VIP con módulo 16). Se re-correrán sin modificar; no se agregan E2E de backend porque no hay comportamiento nuevo del lado servidor.

### Specs que NO se tocan (evidencia de no-regresión)

- `payment-methods-config.spec.ts`, `payment-methods-config-multimonedas.spec.ts`, `payment-methods-plan-gate.spec.ts`, `configurations.spec.ts` — intactos porque **Configuraciones no cambia** (D1).
- `payment-methods.spec.ts` (guardrail del compat legacy), `mayorista-sale.spec.ts`, `edit-delete-order.spec.ts`, `orders-history.spec.ts` — se esperan verdes (el label "Transferencia (CUP)" ya es el actual); se re-corren como verificación.
- Los ~13 specs que usan el input legacy "Pago" del carrito — intactos: el bloque legacy **no se elimina** (D4).

## E2E NUEVOS propuestos (add-only, sin permiso necesario)

| Spec nuevo | Cubre |
|---|---|
| `e2e/channel-rates-catalogue.spec.ts` | La página solo ofrece canales reales (método + moneda); registrar una tasa para un canal con nombre → el historial pinta su label; gate de módulo 16 en la lista de canales/equivalencia (negativo y positivo) |
| `e2e/multipayments-cart-v2.spec.ts` | Fila por defecto Efectivo = total; sin mensaje de tasa; popup de "Agregar pago"; botón de papelera; edición moneda/monto con recálculo; venta con dos canales; ausencia de "Cobrar" |
| `e2e/multipayments-currency-block.spec.ts` | Cambio de moneda bloqueado sin tasa (nunca "0 USD"); permitido tras registrar la tasa |
| `e2e/payment-history-normalization.spec.ts` | Historial/órdenes de hoy/filtros/modal: Efectivo y "Transferencia (CUP)" únicamente |

## Delivery

- **Commits:** siempre en `dev`, por tarea (D7). Sin PRs ni cadenas de slices.
- **Pronóstico de líneas cambiadas (autoradas):** ~1 400–1 600 (incluye ~500 de specs E2E nuevos + ~80 del spec actualizado). El límite de ~400 líneas por PR no aplica como corte de entrega aquí porque no hay PRs (decisión explícita del usuario); se mantiene solo como referencia de tamaño por tarea.
- **Skills a resolver por registro antes de planear/crear PRs (si algún día se piden):** `work-unit-commits`, `chained-pr`.

## Acceptance criteria

- [ ] La página "Canales de pago" solo permite registrar **canales reales (método + moneda)** y mantiene su historial.
- [ ] La página "Canales de pago" (canales + equivalencia) solo existe con el módulo 16 activo: se oculta del menú y su ruta queda gateada sin él (D11).
- [ ] El selector "Moneda" está en la fila del encabezado, antes de "Limpiar", y sigue gated por módulo 16.
- [ ] Cambiar de moneda sin tasa disponible queda **bloqueado** con aviso; el total nunca se pinta "0 <moneda>".
- [ ] Por defecto hay **una fila Efectivo con el monto total** y **no** aparece el mensaje de tasa.
- [ ] "Agregar pago" abre un popup; cada fila tiene botón de eliminar; moneda y monto editables con recálculo.
- [ ] El botón "Cobrar" ya no existe.
- [ ] Se puede borrar el "0" en Cantidad, Precio y Monto, con validación posterior.
- [ ] Historial: Efectivo → "Efectivo"; Transferencia y Zelle → "Transferencia (CUP)".
- [ ] La página de Configuraciones y su servicio de config quedan **sin cambios**.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` verdes; E2E nuevos + `multipayments.spec.ts` verdes; E2E de backend existentes re-corridos sin cambios.
- [ ] Ningún E2E existente modificado fuera de `multipayments.spec.ts`.
- [ ] Sin el módulo 16 y con MultiMonedas: la venta mantiene el flujo actual — **un solo** método de pago, elegido entre los configurados en Configuraciones (sin regresión).

## Progress

- 2026-09-23: exploración completa (2 mapeos delegados + verificación puntual). Causas raíz de los 5 problemas reportados identificadas en código. Decisiones D1–D8 cerradas con el usuario.
- 2026-09-23: **documento ajustado** tras la revisión del usuario: se retira todo el alcance de la página de Configuraciones (D1: todo vive en "Canales de pago"), se confirma entrega por commits en `dev` (D7), se confirma la autorización de E2E existentes (D8) y el alcance de specs existentes baja de 4 a **1** (`multipayments.spec.ts`). Sin cambios de código todavía.
- 2026-09-23: **tercer ajuste**: se cierra la última decisión abierta (D11 — sin el módulo 16 la página "Canales de pago" se oculta y su ruta queda gateada). Verificado que ningún E2E existente navega a esa ruta salvo `multipayments.spec.ts` (tienda con módulo 16) ni afirma su entrada de menú. **Documento cerrado, sin decisiones pendientes.** Sin cambios de código todavía.

## Verification evidence

- (pendiente — se completa tarea por tarea con `<comando>: <resultado>`)
