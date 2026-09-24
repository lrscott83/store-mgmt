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
| D12 | Mecanismo del gate de la ruta sin módulo 16 | **Aprobado explícitamente**: usa el mecanismo existente del app (cierra sesión → `/login`), consistente con los demás gates de feature |

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

- [x] **T1** — Dominio: enumeración canónica de canales + `channelKey` + `isValidChannel`. **Ruta:** delegada (writer). Commit `f193ca3b` (`packages/domain/src/commons/payment-channel.ts` + tests + `index.ts`).
  **AC:** ✅ por cada `Currency` se enumeran exactamente los canales de la tabla de diseño; `channelKey` estable y sin colisiones; `isValidChannel` rechaza Zelle+CUP y Efectivo+MLC.
- [x] **T2** — Página "Canales de pago": selector limitado a canales reales + gate por módulo 16 en la página completa. **Ruta:** delegada (writer). Commit `c5060045` (nuevo `adminFeatureModuleLoader` + `MenuItem.moduleIds`).
  **AC:** ✅ el selector solo ofrece métodos válidos para la moneda elegida (re-pin al cambiar de moneda) + guard defensivo en el submit; el historial sigue pintando las filas guardadas (incluidas las legadas inválidas); **sin el módulo 16 la página se oculta del menú y la ruta queda gateada** (D11, mecanismo aprobado en D12).
- [x] **T3** — Carrito: "Moneda" a la fila del encabezado, antes de "Limpiar". **Ruta:** delegada (writer). Commit `e45c1673`.
  **AC:** ✅ mismo renglón (con `flex-wrap` para pantallas angostas), antes de "Limpiar"/"Registrar"; sigue gated por módulo 16; el resto del carrito sin cambios; conserva `data-testid="cart-currency-select"`.
- [x] **T4** — Carrito: bloquear el cambio de moneda cuando alguna línea no convierte (arregla "0 USD"). **Ruta:** delegada (writer). Commit `c641287b`.
  **AC:** ✅ con una línea sin tasa el select no cambia, la preferencia no se escribe y aparece un aviso claro (`cart-currency-change-error`, i18n `SHOPPING_CART.CURRENCY_CHANGE_BLOCKED`, nombra el producto y las dos monedas); el total nunca se pinta "0 <moneda>"; con tasa disponible el cambio procede y convierte. **Extra acordado:** al cargar con una moneda persistida que no convierte, el carrito cae a la moneda nativa (primer ítem) en lugar de mostrar el error o un total en 0.
- [x] **T5** — Multipago: fila por defecto Efectivo con el monto total; sin mensaje de tasa por defecto. **Ruta:** delegada (writer). Commit `64e56aac`.
  **AC:** ✅ se siembra **una** fila Efectivo con el total al activarse el bloque (ref `multiPaymentsSeededRef`; no pisa la edición del usuario; al vaciar el carrito se limpia); `multi-payment-block-reason` solo se renderiza cuando hay bloqueo real; sin texto de tasa por defecto.
- [x] **T6** — Multipago: "Agregar pago" con popup + eliminar por fila + edición moneda/monto con recálculo. **Ruta:** delegada (writer). Commit `b19e388b`.
  **AC:** ✅ `multi-payment-add` abre un modal que ofrece solo canales válidos (catálogo T1 + gate de plan + config de la tienda); la fila nueva arranca con el restante en unidades de la moneda de la venta cuando el canal es de esa moneda, si no en 0; botón de papelera por fila (incluida la Efectivo por defecto; borrar todo deja la lista vacía y el guard bloquea el registro); moneda y monto editables con recálculo en vivo.
- [x] **T7** — Multipago: eliminar el botón "Cobrar". **Ruta:** delegada (writer). Commit `4ada96db`.
  **AC:** ✅ `multi-payment-settle` eliminado y su clave i18n `SHOPPING_CART.MULTI_PAYMENT_SETTLE` retirada; el registro sigue por "Registrar".
- [x] **T8** — Inputs numéricos: permitir borrar el 0 (Cantidad, Precio, Monto) con validación posterior. **Ruta:** delegada (writer). Commit `006d74d5`.
  **AC:** ✅ patrón de borrador + commit en blur/submit en los 3 campos; el campo se puede vaciar y reescribir; al confirmar, un valor vacío/inválido cae al último válido en vez de ensuciar el estado.
- [x] **T9** — Historial: normalización de ventas ya registradas (Efectivo / Transferencia (CUP)). **Ruta:** delegada (writer). Commit `13885099`. Seam: `normalizedOrderPaymentMethod` en `shared/lib/payment-method-resolved.ts`, consumido por `payment-filter-options.ts` y `edit-order-modal.tsx`.
  **AC:** ✅ historial, órdenes de hoy, filtros y modal de edición muestran solo "Efectivo" y "Transferencia (CUP)"; una venta Zelle se muestra como "Transferencia (CUP)"; los datos persistidos no se reescriben; `salePaymentMethodLabel` intacto (el modal de gastos y el carrito siguen mostrando Zelle como Zelle). **Límite deliberado:** `today-stats.tsx` y `statistics/cuadre-por-fechas.tsx` NO se normalizaron (fuera de las 4 superficies del AC) — ver §Límites conocidos.
- [x] **T10** — E2E NUEVOS (frontend, add-only): 4 specs. **Ruta:** delegada (writer). Commit `ac6d25b2`.
  **AC:** ✅ los 4 specs verdes: `channel-rates-catalogue` 2/2, `multipayments-cart-v2` 1/1, `multipayments-currency-block` 1/1, `payment-history-normalization` 3/3 → **7/7 en una sola corrida (42.3s)**, teardown `278 filas e2e-* borradas`. Se corrigió una aserción **inválida** en `multipayments-cart-v2` (esperaba `paid=406`; producción topa `paid` en el total y el exceso sale como `change`) — arreglo del test, no debilitamiento; no había bug de producción.
- [x] **T11** — E2E EXISTENTE `multipayments.spec.ts` (T10.1 + T10.2): actualizado según la propuesta autorizada. **Ruta:** delegada (writer). Commit `090ad7e3` (+95/−29, único archivo tocado).
  **AC:** ✅ **2/2 passed** en la re-corrida del orquestador (51.1s, teardown `57 filas e2e-* borradas`); el bloqueo por subpago se conserva intacto; ningún otro E2E existente fue modificado.
- [x] **T12** — Verificación final (alcance ajustado por el usuario). **Ruta:** spot check del orquestador.
  **AC:** ✅ E2E del módulo verdes (T10 **7/7** + T11 **2/2**). **Por instrucción explícita del usuario (2026-09-24) NO se corrió la suite amplia** (`pnpm test` completo, subset de regresión E2E y E2E de backend): "hay que hacer arreglos" ajenos al módulo, y se asume que la parte del módulo está bien.
- [x] **T13** — Estadísticas: normalizar el método en los paneles (`today-stats.tsx` y `statistics/cuadre-por-fechas.tsx`) para que una venta registrada con Zelle cuente en el panel de Transferencia (CUP), igual que en el resto del historial. **Ruta:** delegada (writer). Commit `25552677`. *Extensión de T9 pedida explícitamente por el usuario (2026-09-24).*
  **AC:** ✅ ambos paneles bucketizan por `normalizedOrderPaymentMethod`; una venta Zelle se suma al panel de Transferencia y nunca al de Efectivo; el total general no cambia (misma base, solo cambió el predicado de reparto); **ningún E2E existente fue modificado**.
- [x] **T14** — Cuadre multi-tienda: alinear `computeStoreRangeSummary()` (`app/shared/lib/multistore/multi-store-aggregator.ts`) para que agrupe por el método normalizado, igual que el cuadre de una sola tienda. **Ruta:** delegada (writer). Commit `a572f88a`. *Ampliación pedida explícitamente por el usuario (2026-09-24).*
  **AC:** ✅ el predicado de transferencia pasa de `paymentType === Tarjeta` a `normalizedOrderPaymentMethod(o) === Transferencia` — **idéntico** al de `statistics/routes/cuadre-por-fechas.tsx`; el de efectivo ya estaba alineado y no cambió; una venta Zelle ahora cuenta en el panel de Transferencia (antes no entraba en ninguno); `salesTotal` intacto; **ningún E2E existente modificado**.
- [x] **T15** — Carrito (layout): ganar el máximo de espacio horizontal a izquierda y derecha, mobile-friendly. Con el módulo 16 activo: el select de moneda se muestra **sin label**; el header queda en **una sola fila** con "Venta actual" + select de moneda + botones "Limpiar" y "Registrar", con esos **tres últimos (select + 2 botones) alineados a la derecha**. Cada fila de pago en **una sola línea**, con el botón de eliminar en la misma línea. **Ruta:** delegada (writer). Commit `d8812d46`. *Pedido del usuario 2026-09-24.*
  **AC:** ✅ panel más ancho (`sm:w-96`) y padding reducido (`px-2`); **header en una sola fila** con "Venta actual" + select **sin label visible** (accesible vía `aria-label="Moneda"`) + "Limpiar"/"Registrar" **alineados a la derecha**; cada fila de pago en **una sola línea** con su botón de eliminar; mismo comportamiento funcional.
- [x] **T16** — Multipago: quitar el texto que empieza por "Equivalente" (i18n `SHOPPING_CART.MULTI_PAYMENT_CONVERTED_LABEL`) — esa info no se mostrará. **Ruta:** delegada (writer). Commit `22a00e1a`.
  **AC:** ✅ la línea "Equivalente" y la clave i18n eliminadas; **ningún E2E la referenciaba** (grep sobre `frontend-react/e2e`).
- [x] **T17** — Botón "Limpiar" del carrito: la moneda vuelve a **CUP** y **no** se muestra ningún mensaje de error tipo "No se puede cambiar la moneda …". **Ruta:** delegada (writer). Commit `fa2425b6`.
  **AC:** ✅ tras "Limpiar" el selector queda en **CUP**, se persiste la preferencia y se limpia el aviso `cart-currency-change-error`.
- [x] **T18** — BUG reportado: con un canal "Efectivo (CUP)" a 720 (1 USD = 720 CUP) el carrito **no permite cambiar de moneda** y muestra el aviso "No se puede cambiar la moneda …". **Ruta:** diagnóstico con test que reproduce. Commit `fe218303`.
  **Veredicto: NO es defecto de código — es causa de datos/configuración.** ✅ El test `cart-rate-cup-720.test.ts` prueba que con `{Efectivo, CUP, 720, today}` la conversión **funciona en ambos sentidos** (CUP→USD divide entre 720; USD→CUP multiplica por 720) y que **solo** falla con `{Efectivo, USD, 720}` o con `effectiveFrom` futuro → ver §Límites conocidos.
- [x] **T19** — Canales de pago: (a) el nombre del canal muestra **siempre** su moneda, en el selector y en la tabla del histórico; (b) un control por fila que **desactiva/reactiva** una tasa: la fila desactivada **deja de usarse en la conversión** pero se conserva visible en el histórico y en el respaldo. **Ruta:** delegada (writer). Commits `afab1679` (T19a), `56113bdf` (T19b). *Vista y alcance elegidos por el usuario 2026-09-24.*
  **AC:** ✅ (a) `channelLabel()` local de la página muestra siempre la moneda en el selector y en la tabla; el helper compartido `salePaymentMethodLabel` **intacto** (carrito, gastos y créditos sin cambios). (b) `isActive?: boolean` opcional en `packages/domain/src/models/channel-rate.ts` (ausente ⇒ activa); `isUsableRate` descarta las inactivas, así que la cascada (carrito, multipago, créditos) deja de usarlas y manda la siguiente vigente; `setChannelRateActive(id, isActive)` en el servicio; control por fila con columna de estado; el respaldo conserva el estado (no hizo falta tocar producción de sync: el spread del import ya lo arrastra). **Pendiente:** ver §Límites conocidos (un spec E2E de este mismo módulo queda rojo).
- [x] **T20** — **Configuraciones**: la sección de pagos pasa a listar **todos los canales (método + moneda)** con un interruptor por canal para activarlo/desactivarlo; el modelo de configuración de la tienda pasa a ser **por canal**, con compatibilidad de lectura del shape viejo por método. **Ruta:** delegada (writer). Commit `d74180e8`. *Decisión del usuario 2026-09-24 (pregunta 1); supersede D1.*
  **AC:** ✅ modelo `enabledChannels` (channelKey) con lectura compat de `enabledMethods` (si no hay canales se derivan de los métodos; sin config ⇒ todo ON); Efectivo forzado ON en dos capas; la sección lista el **catálogo completo (10 canales, agrupados por moneda)** con interruptor y label con moneda (reusa `channelLabel`); los 5 sitios de consumo conservan su forma de llamada alimentada por `getEnabledMethodsForCurrency(currency)`; el respaldo round-trippea el shape nuevo y los viejos importan. Vitest 57/57 + 234/234. **Impacto E2E → T23.**
- [x] **T21** — **Carrito**: la **lista de pagos se muestra siempre** — con el módulo 16 como hoy (N filas, agregar/eliminar); **sin** el módulo 16, la misma lista limitada a **un solo elemento** (sin "Agregar pago" ni eliminar). Se **elimina el bloque legacy** (radios de forma de pago + campo "Pago"). Cada fila elige el canal con **un único select (método + moneda)**. **Ruta:** delegada (writer). Commits `6435c327` + follow-up `fa403512`. *Decisión del usuario 2026-09-24 (preguntas 2 y 3); supersede D9.*
  **AC:** ✅ la lista se renderiza siempre que el carrito tenga ítems; sin módulo 16 = **1 fila** sin agregar/eliminar; con módulo 16 = N filas como antes; cada fila usa **un solo select de canal** (`multi-payment-channel`, valor `channelKey`); el bloque legacy y sus claves i18n **eliminados**; el registro persiste `Order.payments` en ambos modos y el guard sigue coherente. **Follow-up:** sin módulo 16 el select ofrece **solo canales de la moneda de la venta** (una moneda extranjera era un callejón sin salida: la página de tasas está oculta sin el módulo) y la fila por defecto se siembra con el **primer canal válido** (MLC/CLA ⇒ Transferencia). Vitest 103/103 + 174/174. **Impacto E2E → T23.**
- [x] **T22** — **Vista "Tasas de Cambio"** (hoy "Canales de pago"): header de la vista y texto del menú renombrados; más espacio horizontal en la vista y en cada card; botón **"+ Tasa"** con **popup** de registro; icono **`?`** explicando que el valor son unidades de la moneda del canal por 1 USD; **card 1 "Tasas Vigentes"** (valor sin moneda, sin fechas, columna de desactivar y columna `?` con detalles y fechas en párrafo); **card 2** el historial (valor sin moneda, sin fechas, con `?`); el card "Registrar" se retira. **Ruta:** delegada (writer). Commit `525a64d4`.
  **AC:** ✅ menú y header dicen "Tasas de Cambio" (ruta intacta); `channel-rate-add` abre el popup y es la **única vía de registro**; `?` explica la equivalencia 1 USD; "Tasas Vigentes" muestra la fila vigente por canal con estado/desactivar/`?`; el historial sin moneda ni fechas y con `?`; tablas con `overflow-x-auto` y padding reducido.
- [ ] **T23** — **E2E: impacto y autorización.** Specs existentes que T20/T21/T22 dejan desactualizados (lista completa en §Límites conocidos). **Ruta:** delegada (writer) **solo con autorización explícita**; **no se ejecuta ningún E2E** (instrucción del usuario 2026-09-24). **~21 archivos** → hace falta tu permiso formal antes de empezar.

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

- [x] La página "Canales de pago" solo permite registrar **canales reales (método + moneda)** y mantiene su historial — T2 + E2E `channel-rates-catalogue`.
- [x] La página "Canales de pago" (canales + equivalencia) solo existe con el módulo 16 activo: se oculta del menú y su ruta queda gateada sin él (D11) — T2 + E2E `channel-rates-catalogue`.
- [x] El selector "Moneda" está en la fila del encabezado, antes de "Limpiar", y sigue gated por módulo 16 — T3.
- [x] Cambiar de moneda sin tasa disponible queda **bloqueado** con aviso; el total nunca se pinta "0 <moneda>" — T4 + E2E `multipayments-currency-block`.
- [x] Por defecto hay **una fila Efectivo con el monto total** y **no** aparece el mensaje de tasa — T5 + E2E `multipayments-cart-v2`.
- [x] "Agregar pago" abre un popup; cada fila tiene botón de eliminar; moneda y monto editables con recálculo — T6 + E2E `multipayments-cart-v2`.
- [x] El botón "Cobrar" ya no existe — T7 + E2E `multipayments.spec.ts` T10.2.
- [x] Se puede borrar el "0" en Cantidad, Precio y Monto, con validación posterior — T8.
- [x] Historial: Efectivo → "Efectivo"; Transferencia y Zelle → "Transferencia (CUP)" — T9 + T13 + E2E `payment-history-normalization`. **Límite restante:** el cuadre multi-tienda (ver §Límites conocidos).
- [x] La página de Configuraciones y su servicio de config quedan **sin cambios** — D1; verificado por alcance de archivos en cada commit.
- [x] E2E nuevos + `multipayments.spec.ts` verdes (7/7 y 2/2) — T10, T11, T12.
- [x] Solo **dos** E2E modificados, ambos con autorización explícita: `multipayments.spec.ts` (D8) y `channel-rates-catalogue.spec.ts` (autorización 2026-09-24, 3 aserciones). El resto de los specs y `e2e/support/*` intactos.
- [~] Sin el módulo 16 y con MultiMonedas: la venta mantiene el flujo actual — un solo método de pago, elegido entre los configurados en Configuraciones (sin regresión). **No re-verificada en esta corrida**: es comportamiento preexistente que el módulo NO tocó (ningún archivo del bloque legacy del carrito fue modificado), y su verificación habría requerido el subset de regresión E2E que el usuario pidió no correr.
- [~] `pnpm test` / suite amplia verde: **no corrida** por instrucción del usuario. Cada tarea sí reportó sus propios `pnpm typecheck` (5/5) y `pnpm lint` (4/4) verdes, y la suite de la app quedó en 4215 passed / 1 failed (el preexistente `sales-routes`).

## Límites conocidos (informar, no ocultar)

- **Estadísticas de una sola tienda — CERRADO en T13**: `today-stats.tsx` y `statistics/routes/cuadre-por-fechas.tsx` ya bucketizan por `normalizedOrderPaymentMethod`, así que una venta Zelle cuenta en Transferencia (CUP).
- **Estadísticas multi-tienda — CERRADO en T14**: `computeStoreRangeSummary()` (`app/shared/lib/multistore/multi-store-aggregator.ts`) ya usa el mismo predicado de transferencia que el cuadre de una sola tienda, así que una venta Zelle cuenta en Transferencia. **Ya no quedan límites abiertos de normalización de método.**
- **Verificación E2E pendiente de re-corrida**: los E2E de Playwright no se pudieron correr desde T13/T14 porque el backend del puerto 5019 está detenido (lo pediste tú). Los veredictos de impacto son por lectura estática; conviene re-correr `payment-methods.spec.ts`, `daily-report.spec.ts` y `report-consistency.spec.ts` la próxima vez que levantes el backend.
- **T18 — causa identificada, requiere acción tuya + un seguimiento de UX**: el código está **probado correcto**. Los únicos dos caminos al mensaje "No se puede cambiar la moneda …" son **(a)** que la fila guardada sea de **USD** en vez de **CUP**, o **(b)** que su fecha "Desde" sea **futura**. La página "Canales de pago" induce (a): `salePaymentMethodLabel(Efectivo, USD)` renderiza **solo "Efectivo"**, sin sufijo de moneda (a diferencia de "Transferencia (CUP)"), así que una fila `Efectivo · USD · 720` se lee como si fuera la tasa de CUP; además la página es **append-only** (sin borrar ni editar), así que una fila mal registrada solo se neutraliza con otra fila más nueva.
  **Seguimiento propuesto (pendiente de tu decisión):** (1) mostrar la moneda en el nombre del canal de Efectivo; (2) permitir corregir/eliminar una tasa mal registrada.
- **Layout sin verificación visual**: T15 no se pudo ver en navegador (backend detenido, sin E2E). La fila de pago en una sola línea se apoya en `min-w-0`/`flex-1`/`w-20`; jsdom no puede probar ausencia de desborde horizontal.
- **Spec E2E actualizado — autorizado y hecho (2026-09-24)**: `e2e/channel-rates-catalogue.spec.ts` (commit `e79fdf85`). Se pusieron al día las **3 aserciones** de textos del selector (líneas 113, 117-121, 125) a los labels con moneda: `['Efectivo (CUP)','Transferencia (CUP)']`, `['Efectivo (USD)','Zelle (USD)','Transferencia (USD)']`, `['Transferencia (MLC)']`. **Cobertura idéntica** — siguen exigiéndose exactamente las mismas combinaciones válidas, solo con el nombre al día. **No se ejecutó ningún E2E** (instrucción expresa del usuario): se verificó que **compila y colecciona** con `playwright test --list` → 2 tests listados, **0 ejecutados**.
- **Re-corrida E2E pendiente**: no se ejecutó ningún E2E de Playwright desde T13 (el backend del 5019 está detenido a pedido tuyo). Al levantarlo conviene correr al menos: `multipayments.spec.ts`, `channel-rates-catalogue.spec.ts`, `multipayments-cart-v2.spec.ts`, `multipayments-currency-block.spec.ts`, `payment-methods.spec.ts`, `daily-report.spec.ts`, `report-consistency.spec.ts`.
- **T23 — specs E2E desactualizados por T20/T21/T22 (~21 archivos, requieren tu autorización explícita)**: (1) **campo legacy "Pago"** — `create-sale.spec.ts` (L160,216,237), `edit-delete-order.spec.ts` (L97), `inventory-egress.spec.ts` (L142,171,225), `inventory-profit.spec.ts` (L85), `inventory-quantities.spec.ts` (L85), `mayorista-sale.spec.ts` (L198), `movement-reversal.spec.ts` (L44,312), `report-consistency.spec.ts` (L84), `sync-roundtrip.spec.ts` (L86), `warehouse-cost-propagation.spec.ts` (L28,217), `warehouse-movements-extended.spec.ts` (L37,355), `warehouses.spec.ts` (L60,422) y el apoyo `support/elaboration-flow.ts` (L237); (2) **radios `payment-method-*`** — `payment-methods.spec.ts` (L180,181,239) y `mayorista-sale.spec.ts` (L229); (3) **selects por fila** (`multi-payment-method`/`multi-payment-currency` → `multi-payment-channel`) — `multipayments.spec.ts` (L410,411) y `multipayments-cart-v2.spec.ts` (L216,217,259,260,264); (4) **sección de Configuraciones** (título "Formas de pago" e interruptores sin moneda) — `payment-methods-config.spec.ts`, `payment-methods-config-multimonedas.spec.ts` y `payment-methods-plan-gate.spec.ts`; (5) **formulario de tasas ahora en popup** (hay que abrirlo con `channel-rate-add`) — `channel-rates-catalogue.spec.ts` (L110,113-135), `multipayments.spec.ts` (L331-336,396-401), `multipayments-currency-block.spec.ts` (L231-236) y `multipayments-cart-v2.spec.ts` (L203-208).
- **Flake del entorno**: la corrida completa de Vitest durante T22 reportó 22 fallos en 10 archivos **ajenos a lo tocado** (`auth-store.offline`, `decryption-failure-policy` TDZ). Verificado en aislamiento por el writer (10/10) y por el orquestador (1 file passed) ⇒ **contención del entorno, no regresión**.
- La **suite amplia de tests** (`pnpm test` completo, subset de regresión E2E, E2E de backend) **no se corrió** en T12 por tu instrucción expresa (2026-09-24).
- El único E2E existente modificado es `multipayments.spec.ts` (autorizado, D8).
- No se hizo commit/push de nada fuera de la rama `dev`.

## Progress

- 2026-09-23: exploración completa (2 mapeos delegados + verificación puntual). Causas raíz de los 5 problemas reportados identificadas en código. Decisiones D1–D8 cerradas con el usuario.
- 2026-09-23: **documento ajustado** tras la revisión del usuario: se retira todo el alcance de la página de Configuraciones (D1: todo vive en "Canales de pago"), se confirma entrega por commits en `dev` (D7), se confirma la autorización de E2E existentes (D8) y el alcance de specs existentes baja de 4 a **1** (`multipayments.spec.ts`). Sin cambios de código todavía.
- 2026-09-23: **tercer ajuste**: se cierra la última decisión abierta (D11 — sin el módulo 16 la página "Canales de pago" se oculta y su ruta queda gateada). Verificado que ningún E2E existente navega a esa ruta salvo `multipayments.spec.ts` (tienda con módulo 16) ni afirma su entrada de menú. **Documento cerrado, sin decisiones pendientes.** Sin cambios de código todavía.
- 2026-09-23: **implementación** (usuario: "dale con la implementación"). T1+T2 → commits `f193ca3b`, `c5060045`. Decisión **D12** aprobada explícitamente por el usuario: el gate de la ruta sin el módulo 16 usa el mecanismo existente del app (cierra sesión → `/login`). T3+T4 → commits `e45c1673`, `c641287b`. T5+T6+T7 → commits `64e56aac`, `b19e388b`, `4ada96db`. Se actualizó un test **unitario** existente (`cart-shell.test.tsx` T8-03) porque su comportamiento pinneado cambió por diseño en T4 — es Vitest, no E2E; **ningún E2E existente fue tocado**.
- 2026-09-24: T8+T9 → commits `006d74d5`, `13885099`. Dos reinicios del runtime interrumpieron la delegación E2E a mitad: T11 quedó commiteado (`090ad7e3`) y los 4 specs de T10 quedaron escritos sin verificar → una delegación fresca los verificó, corrigió una aserción inválida y los commiteó (`ac6d25b2`). **Módulo completo: T1–T12.** T12 cerrado con el E2E del módulo (7/7 + 2/2); la suite amplia no se corrió por tu instrucción expresa del 2026-09-24.
- 2026-09-24 (cont.): push de `dev` → `origin/dev` (`7fff2871..2b5d8bfd`). Luego, pedido del usuario: **T13 — normalización del método en los paneles de estadísticas** (commit `25552677`), con la suite de los 4 archivos de stats en **51/51** y cero cambios en E2E. Queda abierto el **cuadre multi-tienda** (ver §Límites conocidos).
- 2026-09-24 (cont. 2): el usuario pidió cerrar ese hueco → **T14 — cuadre multi-tienda alineado** (commit `a572f88a`, suite del agregador **15/15**). Con esto la normalización de método queda consistente en **seis** superficies: historial, órdenes de hoy, filtros, modal de edición, estadísticas de una tienda y cuadre multi-tienda. **Sin límites abiertos de normalización.** Push a `origin/dev` (`2b5d8bfd..73ace4a7`).
- 2026-09-24 (cont. 3): pedido del usuario → **T15** (layout del carrito: máximo ancho, header en una fila, select de moneda sin label, cada pago en una línea — commit `d8812d46`), **T16** (quitar el texto "Equivalente" — `22a00e1a`) y **T17** ("Limpiar" devuelve la moneda a CUP y limpia el aviso — `fa2425b6`). **T18 diagnosticado** (`fe218303`): la conversión está correcta; el bloqueo reportado viene de una fila guardada para la moneda equivocada (o con fecha futura), y la página de canales induce el error porque el canal de Efectivo no muestra su moneda. Vitest 123/123 en los 5 archivos del carrito; sin cambios en E2E.
- 2026-09-24 (cont. 4): el usuario eligió el alcance ("moneda + desactivar filas") tras un primer intento de propuesta **mal formulado** (no decía vista ni alcance — corregido). **T19 implementado** (`afab1679`, `56113bdf`): nombre del canal con su moneda en el selector y el histórico; control por fila para desactivar/reactivar una tasa (inactiva no convierte, se conserva en histórico y respaldo). Queda **una autorización pendiente** para actualizar 3 líneas de `channel-rates-catalogue.spec.ts`.
- 2026-09-24 (cont. 5): el usuario **autorizó** actualizar ese spec, con la condición de **no ejecutar E2E por ahora** — solo compilación y checks. Hecho: commit `e79fdf85` (3 aserciones al día). Verificado con `pnpm typecheck` 5/5, `pnpm lint` 4/4, Vitest **96/96** y `playwright test --list` (2 tests coleccionados, 0 ejecutados).
- 2026-09-24 (cont. 6): pedido grande del usuario. Resuelta primero una **contradicción** (Configuraciones con/sin módulo 16 → eligió "sí se muestran todos los canales") y fijado el alcance con vista+scope. **T20** (`d74180e8`, config por canal + catálogo completo en Configuraciones), **T21** (`6435c327` + follow-up `fa403512`, la lista de pagos siempre con 1 elemento sin el módulo + un solo select de canal) y **T22** (`525a64d4`, vista "Tasas de Cambio" con card "Tasas Vigentes", popup `+ Tasa` y columnas `?`). Vitest 57/57, 234/234, 103/103 y 174/174; typecheck 5/5; lint 4/4. **T23 (actualizar ~21 specs E2E) queda bloqueada esperando autorización explícita** y sin ejecutar ningún E2E.

## Verification evidence

- T1 — `pnpm --filter @store-mgmt/domain exec vitest run src/commons/__tests__/payment-channel.test.ts`: 1 file passed, **9/9 tests passed**.
- T2 — `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/management/channel-rates/routes/__tests__/channel-rates.test.tsx app/shared/components/__tests__/sidebar.test.tsx`: 2 files passed, **60/60 tests passed**.
- T1+T2 — `pnpm typecheck`: 5/5 tasks successful (0 errors). `pnpm lint`: 4/4 tasks successful (`--max-warnings=0`).
- Suite completa (referencia T1+T2) — `pnpm test`: 4188/4189 passed. **1 fallo preexistente y ajeno**: `app/sales/routes/__tests__/sales-routes.test.tsx:336` ("SaleCreditsPage has no radio filters") — verificado por el writer con stash del trabajo y reproducción idéntica en árbol limpio; se re-confirma en T12.
- Nota de entorno: los tests de la app consumen el `dist/` compilado de `@store-mgmt/domain`; un export nuevo requiere `pnpm --filter @store-mgmt/domain build` antes de correr los tests de la app.
- T3+T4 — `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/shared/components/__tests__/cart-shell.test.tsx app/shared/components/multipayments/__tests__/cart-currency-select.test.tsx`: 2 files passed, **78/78 tests**. `pnpm typecheck` 5/5 · `pnpm lint` 4/4. **Spot check del orquestador** (re-run de `cart-shell.test.tsx`): **70/70 passed**, 0 type errors.
- T5+T6+T7 — `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/shared/components/multipayments/__tests__/multi-payment-list.test.tsx app/shared/components/__tests__/cart-shell.test.tsx`: 2 files passed, **97/97 tests**. `pnpm typecheck` 5/5 · `pnpm lint` 4/4. Suite completa: **4207 passed, 1 failed** (el preexistente de `sales-routes`).
- T8 — `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/sales/components/__tests__/sale-product-row.test.tsx app/shared/components/multipayments/__tests__/multi-payment-list.test.tsx`: 2 files passed, **48/48**. `pnpm typecheck` 5/5 · `pnpm lint` 4/4.
- T9 — `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/shared/lib/__tests__/payment-filter-options.test.ts app/sales/routes/__tests__/today-orders-payment-filter.test.tsx app/sales/routes/__tests__/orders.test.tsx app/sales/routes/__tests__/orders-multistore.test.tsx app/sales/components/__tests__/order-components.test.tsx`: 5 files passed, **63/63**. Suite de la app (referencia): 4215 passed, 1 failed (el preexistente).
- T10 — `pnpm exec playwright test e2e/channel-rates-catalogue.spec.ts e2e/multipayments-cart-v2.spec.ts e2e/multipayments-currency-block.spec.ts e2e/payment-history-normalization.spec.ts --reporter=list` (desde `frontend-react/`): **7 passed (42.3s)** · teardown `[e2e teardown] 278 filas e2e-* borradas en "smca_test"`.
- T11 — **spot check del orquestador**, `pnpm exec playwright test e2e/multipayments.spec.ts --reporter=list` (desde `frontend-react/`): **2 passed (51.1s)** · teardown `[e2e teardown] 57 filas e2e-* borradas en "smca_test"`.
- T12 — entorno: `Test-NetConnection localhost -Port 5019` → **True**; `-Port 5432` → **True**. Suite amplia **NO corrida** por instrucción explícita del usuario.
- Integridad E2E — `git status --porcelain -- frontend-react/e2e/`: solo los **4 specs nuevos** (T10) + `multipayments.spec.ts` (el único existente autorizado, T11). Cero cambios en `e2e/support/*` y en el resto de specs.
- T13 — `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/sales/routes/__tests__/today-stats.test.tsx app/sales/routes/__tests__/today-stats-multicurrency.test.tsx app/statistics/routes/__tests__/cuadre-por-fechas.test.tsx app/statistics/routes/__tests__/cuadre-multicurrency.test.tsx`: 4 files passed, **51/51 tests**. `pnpm typecheck` 5/5 · `pnpm lint` 4/4. **Spot check del orquestador** (re-run de `today-stats.test.tsx`): **23/23 passed**.
- T13 — integridad E2E: `git status --porcelain -- frontend-react/e2e/` → **vacío**. Impacto sobre `e2e/payment-methods.spec.ts` (lectura estática; backend 5019 detenido): **no se rompe** — su aserción usa `Pago por Transferencia` / `Resumen Efectivo` y el spec nunca siembra una venta Zelle, mientras que `normalizedOrderPaymentMethod` solo reescribe Zelle→Transferencia y devuelve lo mismo que el resolver viejo para Efectivo/Tarjeta/Transferencia. (Veredicto por lectura, no por corrida — backend detenido. Se re-confirmará visualmente cuando vuelvas a levantar el backend.)
- T14 — `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/shared/lib/multistore/__tests__/multi-store-aggregator.test.ts`: 1 file passed, **15/15 tests** (14 + 1 nuevo). `pnpm typecheck` 5/5 · `pnpm lint` 4/4.
- T14 — predicados (antes → después, multi-tienda): efectivo `paymentType === Efectivo && !isCredit` → **sin cambios** (ya coincidía con el single-store); transferencia `paymentType === Tarjeta && !isCredit` → `normalizedOrderPaymentMethod(o) === Transferencia && !isCredit` (**idéntico** al single-store). `salesTotal` no se tocó.
- T14 — impacto E2E (lectura): **ningún spec existente asserta el cuadre multi-tienda**. Los que tocan paneles de efectivo/transferencia son del cuadre de **una sola tienda** (`today-stats.tsx`): `e2e/payment-methods.spec.ts:33-34`, `e2e/daily-report.spec.ts:15,49`, `e2e/report-consistency.spec.ts:14,109` — todos fuera del código cambiado. `git status --porcelain -- frontend-react/e2e/` → **vacío**.
- T15+T16+T17 — `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/shared/components/multipayments/__tests__/cart-rate-cup-720.test.ts app/shared/components/multipayments/__tests__/cart-line-conversion.test.ts app/shared/components/multipayments/__tests__/multi-payment-list.test.tsx app/shared/components/multipayments/__tests__/cart-currency-select.test.tsx app/shared/components/__tests__/cart-shell.test.tsx`: 5 files passed, **123/123 tests**. `pnpm typecheck` 5/5 · `pnpm lint` 4/4. `git status --porcelain -- frontend-react/e2e/` → **vacío**.
- T15+T17 — **spot check del orquestador**: `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/shared/components/multipayments/__tests__/cart-rate-cup-720.test.ts app/shared/components/__tests__/cart-shell.test.tsx` → **passed**.
- T15 — impacto E2E (lectura): `multipayments.spec.ts` **conserva todos sus localizadores** (testids intactos; el único texto eliminado, "Equivalente", no lo referencia ningún spec). No se modificó ningún E2E.
- T18 — veredicto con test que reproduce (`cart-rate-cup-720.test.ts`): `{Efectivo, CUP, 720, today}` → **convierte en ambos sentidos** (72 000 centavos CUP → 100 centavos USD; 100 → 72 000); `{Efectivo, USD, 720}` → `ChannelRateErrors.RateNotFound` en ambos sentidos; `effectiveFrom` futuro → `RateNotFound`. Evidencia: `packages/domain/src/commons/channel-conversion.ts:171-184` (`resolveCurrencyRate`), `:121-130` (`latestWithCurrency`, cualquier método de la moneda), `:223-243` (`convertLineAmount`). Corroborado por el E2E existente `multipayments-currency-block.spec.ts:227-246`.
- T19 — `pnpm --filter @store-mgmt/domain build`: OK. `pnpm --filter @store-mgmt/domain exec vitest run src/commons/__tests__/channel-conversion.test.ts src/commons/__tests__/payment-channel.test.ts`: 2 files passed, **35/35 tests**. `pnpm --filter @store-mgmt/web-store-pos exec vitest run <los 6 archivos de canales + sync>`: 6 files passed, **58/58 tests**. `pnpm typecheck` 5/5 · `pnpm lint` 4/4. `git status --porcelain -- frontend-react/e2e/` → **vacío**.
- T19 — **spot check del orquestador**: `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/management/channel-rates/routes/__tests__/channel-rates.test.tsx app/management/channel-rates/lib/__tests__/channel-label.test.ts` → **passed**.
- T19 — **spec E2E autorizado** `e2e/channel-rates-catalogue.spec.ts` (commit `e79fdf85`): 3 aserciones puestas al día. Checks post-edición: `pnpm typecheck` **5/5** · `pnpm lint` **4/4** · `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/management/channel-rates/routes/__tests__/channel-rates.test.tsx app/management/channel-rates/lib/__tests__/channel-label.test.ts app/shared/components/__tests__/cart-shell.test.tsx` → **96/96 tests**. `pnpm exec playwright test e2e/channel-rates-catalogue.spec.ts --list` → **2 tests coleccionados, 0 ejecutados** (prueba de compilación sin correr E2E, como pidió el usuario).
- T20 — `pnpm --filter @store-mgmt/web-store-pos exec vitest run <servicio de config + página configurations>`: 2 files, **57/57 tests**. Con los 7 archivos de consumo + sync: 7 files, **234/234 tests**. `pnpm typecheck` 5/5 · `pnpm lint` 4/4 · suite de la app **4255 passed / 1 preexistente**. `git status --porcelain -- frontend-react/e2e/` → **vacío**.
- T21 + follow-up + T22 — `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/shared/components/multipayments/__tests__/multi-payment-list.test.tsx app/shared/components/__tests__/cart-shell.test.tsx`: 2 files, **103/103 tests**. Sumando la vista (`channel-rates.test.tsx`) y `sidebar.test.tsx`: 4 files, **174/174 tests**. `pnpm typecheck` 5/5 · `pnpm lint` 4/4. `git status --porcelain -- frontend-react/e2e/` → **vacío**.
- T22 — **spot check del orquestador**: re-corrida en aislamiento de `app/shared/lib/stores/__tests__/auth-store.offline.test.ts` (uno de los 10 archivos que fallaron en la corrida completa del writer) → **1 file passed** ⇒ los 22 fallos de esa corrida fueron **flake por contención del entorno**, no una regresión (coincide con la re-corrida del writer: 10/10).
- T19 — diseño: fila inactiva = `isActive === false` (ausente ⇒ activa, para datos y respaldos viejos); el filtro vive en `isUsableRate` (`channel-conversion.ts`), por donde pasan `latestWithCurrency` y el filtro exacto de `resolveChannelRate` ⇒ carrito, multipago y créditos dejan de usarla automáticamente. El import del respaldo solo salta filas cuyo id ya existe localmente (semántica preexistente), así que un respaldo no pisa un cambio local de estado.
