# Feature: currency-filter-per-view (filtro de moneda por vista)

Workflow: **ODD** (Organic Driven Development). Rama: `dev`.
Entrega: commits por unidad de trabajo; push/PR = decisión del usuario.

**Antecede / supersede parcialmente:** `odd/tasks/multicurrency-view-totals.md` (2026-09-20).
Ese feature metió `CurrencyTotalAmount` (total primario + chips por moneda) en 5 vistas.
Esta feature **lo reemplaza** en esas vistas por: filtro de moneda + helper normal.
`CurrencyTotalAmount` no se borra (lo siguen usando inventario y el multi-store helper);
solo deja de usarse en las vistas listadas abajo.

## Objetivo

Con el módulo **MultiMonedas** activo, las vistas que muestran totales/precios llevan un filtro
de moneda: se ve **una sola moneda a la vez**, tanto en las filas como en los totales.
El filtro se oculta cuando la vista tiene una sola moneda.

## Problema / Por qué

Hoy esas vistas muestran un total primario + chips de desglose por moneda
(`CurrencyTotalAmount`). El owner pide otra cosa: **elegir** la moneda y ver la vista filtrada,
porque en la práctica trabaja una moneda a la vez. Mostrar varias monedas mezcladas en la misma
pantalla obliga a leer chips cuando lo que se quiere es enfocarse.

## Decisiones tomadas por el owner (no reinterpretar)

1. **Reemplaza** a `CurrencyTotalAmount` en las vistas del alcance (ver "Alcance").
2. El filtro alcanza **todo**: filas y totales, no solo los totales.
3. Las opciones del select salen del conjunto **SIN filtrar por moneda**. Así el filtro **no
   desaparece** al elegir una moneda. (Sin esto: eliges USD con datos USD+EUR → quedan datos de
   una sola moneda → el filtro se auto-oculta y no puedes volver a EUR.)
4. Moneda inicial = **primera del orden acordado** (`orderCurrencyTotals`: USD → EUR → CUP →
   resto por monto DESC).
5. UI: fila propia **centrada**, con el label `Moneda` antes del select, **encima** de... ver
   T1 (el owner eligió "fila propia" **abajo** de los filtros existentes de la vista).
6. Se oculta el filtro cuando hay una sola moneda en el conjunto sin filtrar, o cuando el módulo
   MultiMonedas está inactivo.
7. **Filtro y helper normal**: se usa el helper de una sola moneda
   (`formatMoneyWithCurrency`), no el helper multi-moneda.
8. **Reportes**: el PDF descargado **respeta** la moneda elegida.
9. **Dashboard**: el filtro manda; los chips de desglose se mantienen (informativos, con la
   moneda filtrada marcada como activa) y los widgets siguen el filtro global.
10. **KPIs**: icono de info `(i)` en el header del KPI, alineado a la derecha. Su tap abre **una
    sola vista** con el total por cada moneda **y** el desglose por canales de pago.
    El botón `+` **desaparece**. **Solo el `(i)` abre ese popup** — el valor del KPI NO es
    clickable (corrección del owner, 2026-09-26; ver "Correcciones post-entrega").
11. **Modos de pago**: el desglose debe usar el **canal real** (`salePaymentMethod` vía
    `resolvedOrderPaymentMethod`), nunca el `paymentType` legacy → **`Tarjeta` no debe aparecer**.
    **`Zelle` es un canal propio y NO se funde con `Transferencia`** (corrección del owner,
    2026-09-26: *"Zelle es un canal de pago como otro cualquiera"*).
12. **Grilla de KPIs**: 4 por fila en desktop, 2 en móvil. (Hubo `lg:grid-cols-4` en `a2f5cd80`;
    `7f0544c6` lo quitó alegando paridad con Angular, motivo **inválido** por regla del proyecto.)

## Alcance

Frontend React únicamente (`frontend-react/apps/web-store-pos`).
**Sin cambios de backend.** **Sin tocar E2E** (`frontend-react/e2e/**`,
`backend/**/SMCA.WebApi.E2ETests/**`) ni producción backend.

Vistas (9 + el PDF):

- Ventas: `app/sales/routes/today-stats.tsx`, `today-orders.tsx`, `orders.tsx`, `credits.tsx`,
  `today-credits.tsx`
- Gastos: `app/expenses/routes/expenses-history.tsx`
- Estadísticas: `app/statistics/routes/cuadre-por-fechas.tsx`, `app/statistics/routes/dashboard.tsx`
  + `app/statistics/components/dashboard-metrics-body.tsx` + `app/statistics/components/kpi-card.tsx`
- Reportes: `app/reports/routes/today-report.tsx` + `app/reports/lib/pdf/**`
- Inventario: `app/inventory/routes/available.tsx`, `app/inventory/routes/entries.tsx`

## Modo TDD

**off** — fuente: `multicurrency-view-totals.md` (TDD off, `sdd/store-mgmt/testing-capabilities`).
Se ejecutan **checks funcionales + tests nuevos por tarea** (no "sin tests").
Runners: `pnpm test`, `pnpm typecheck`, `pnpm lint` desde `frontend-react/`.

## Tareas

- [x] **T1** Infra compartida: componente `CurrencyFilter` (label `Moneda` + select, fila
  centrada, `data-testid`) + helper que deriva las monedas presentes de un conjunto de datos y
  decide si el filtro se muestra (módulo activo AND 2+ monedas). Claves i18n.
  Tests: visibilidad (0/1/2+ monedas), módulo off, default = orden acordado, y que las opciones
  NO se recalculen con el filtro aplicado.
  → `app/shared/lib/currency-totals.ts` (`presentCurrencies`, reusa
  `groupAmountsByCurrency` + `orderCurrencyTotals`), `app/shared/components/multimonedas/use-currency-filter.ts`
  (`useCurrencyFilter`), `app/shared/components/multimonedas/currency-filter.tsx` (`CurrencyFilter`).
  i18n: reusa `GENERAL.CURRENCY` (= "Moneda", sin cambios). **Commit `cc6009db`.**
  Evidencia: 3 archivos de test nuevos; `pnpm vitest run` sobre ellos + `currency-totals.test.ts`
  → **22 tests passed, Type Errors: no errors**. `pnpm typecheck` exit 0. `pnpm eslint` exit 0.
  Corrección del orquestador sobre el entregable: el hook declaraba `currencies: Currency[]` con
  un cast desde `readonly`; se cambió a `readonly Currency[]` y se eliminó el cast.
- [x] **T2** `today-stats`: reemplazar `CurrencyTotalAmount` por el helper normal + filtro
  (filas y totales).
  → `app/sales/routes/today-stats.tsx`. Las filas de "Ventas" por categoría se reagrupan desde
  los ítems YA filtrados por moneda, usando el builder compartido; `CategoryStats` recibe un
  prop `currency?: number` aditivo (sin él, CUP). **Commit `959f5725`.**
- [x] **T3** `today-orders`: idem.
  → `app/sales/routes/today-orders.tsx`. Filtro centrado debajo de sus dos fieldsets existentes.
  **Commit `959f5725`.**
  Nota: `today-stats` no tenía filtros previos, así que su fila del filtro es el primer elemento
  del cuerpo.
  **Limpieza obligada (no estaba en el plan):** el writer introdujo una copia local de la
  agregación categoría→producto. Se descubrió que esa misma agregación ya estaba duplicada en
  **dos** métodos del servicio → **tres copias**. Se extrajo a
  `app/sales/lib/category-cart-items-view.ts` (`buildCategoryCartItemsView`) y los tres
  llamadores delegan en él. `order-offline-service.ts` adelgaza ~80 líneas.
  **Commit `02f1afb7`** (refactor separado de la feature).
- [x] **T4** `orders`: idem, incluyendo el modo multi-store (paneles por tienda).
  → `app/sales/routes/orders.tsx`. Filtra filas, total del header, totales por día, totales por
  panel y el agregado fuera de los paneles. **Commit `a69adb23`.**
- [x] **T5** `credits`: idem, incluyendo el modo multi-store.
  → `app/sales/routes/credits.tsx`. `CreditsCardTitle` pasa a recibir `currency` en vez de
  `entries`/`multiMonedas`; los paneles por tienda se filtran con un `Map` ya filtrado.
  **Commit `a69adb23`.**
  `MultiStoreTotal` (compartido con gastos) ganó un prop opcional aditivo `currency?: Currency`;
  ningún llamador existente se ve afectado (lista completa verificada).
- [x] **T6** `cuadre-por-fechas`: idem en KPIs y tarjeta Cuadre (single + multi-store).
  → `app/statistics/routes/cuadre-por-fechas.tsx`. Cero `CurrencyTotalAmount` restante.
  **Grillas de KPIs** (`:632` y `:1037`) pasan a `grid-cols-2 lg:grid-cols-4` — es el arreglo del
  reporte del owner ("4 KPIs por fila en desktop"); el `grid-cols-2` previo se justificaba con
  paridad Angular y el comentario obsoleto se reescribió. **Commit `39eba2b8`.**
  Bug corregido de paso: la mitad agregada multi-store sumaba órdenes, gastos y créditos pagados
  **sin mirar la moneda** (`multi-store-aggregator.ts:607-650`) y combinaba esas sumas mezcladas.
  Ahora cada panel recibe un resumen ya filtrado a una moneda. `StoreRangeSummary` ganó un campo
  aditivo `orders` para reusar el builder compartido. **Commit `39eba2b8`.**
- [x] **T7** `expenses-history`: **arreglar** los totales para que respeten `Expense.currency`
  (hoy suman monedas distintas y las etiquetan CUP: header, totales por día, y los dos del modo
  multi-store) + aplicar el filtro.
  → Todos los totales resuelven la moneda del gasto. Tres casos explícitos: filtro visible → la
  elegida; módulo ON con una moneda → **esa** (el fix, sin filtro); módulo OFF → CUP, byte-idéntico
  (fijado por test). Test nuevo `expenses-history-multicurrency.test.tsx` (7 tests); **ningún test
  existente modificado**. **Commit `8c0ce6c4`.**
- [x] **T8** `today-credits`: hoy suma todo como CUP sin mirar la moneda. Aplicar el mismo
  tratamiento que `credits`.
  → Sumaba los créditos impagos del día y los rotulaba CUP sin gate ni moneda alguna. Test nuevo
  `today-credits-multicurrency.test.tsx` (5 tests); ningún test existente modificado.
  **Commit `371cd755`.**
- [x] **T9** Inventario (`available`, `entries`): aplicar el filtro y **quitar el
  `multiMonedas={true}` hardcodeado** que hoy se salta el gate del módulo.
  → Ambas vistas pasaban `multiMonedas` literal `true`, saltándose el gate. Ahora usan el gate
  real y el patrón establecido. `inventory-product-list` ganó dos props **aditivas** opcionales
  (`currency`, `filterSlot`); su único llamador de producción es `available`. Test nuevo
  `inventory-multicurrency.test.tsx` (9 tests).
  Salida idéntica sin el módulo, verificada contra las aserciones existentes (`100 CUP`, `26 CUP`,
  `16 CUP`) que siguen pasando sin cambios. **Caveat registrado**: el helper multi-moneda mostraba
  intermedios sin redondear y ahora se muestra el agregado ya redondeado; con dinero a 2 decimales
  coinciden. **Commit `bb4a9921`.**
- [x] **T10** Reportes: agregar `currency` a las filas del generador del PDF, aplicar el filtro a
  la página y hacer que el **PDF respete la moneda elegida** (resumen y filas).
  → `inventory-today-sale-pdf.ts` (cada celda de dinero usa la moneda de su fila),
  `generate-product-rows.ts` + `generate-product-rows-for-date.ts` (pueblan la moneda),
  `today-report.tsx` (filtro + resumen + PDF con la moneda elegida).
  Fuente por figura, con evidencia: las cifras de **venta** salen de la orden/ítem (el ítem se
  sella con la moneda del producto al crear la orden); las de **costo**, de la moneda de la
  entrada de inventario; una fila (un producto) resuelve a la moneda de la venta con fallback a la
  del producto. Sin ninguna de las dos → CUP (el default documentado), **nunca inventada**.
  Filtrar **descarta** filas, no convierte (no hay tabla de conversión).
  `orders.tsx` comparte `generateProductRowsForDate`, así que su export por día también filtra a
  la moneda de la vista.
  Tests: 2 actualizados (el modelo de fila ganó un campo requerido) + 1 archivo nuevo
  (`today-report-multicurrency.test.tsx`). `app/reports` + `app/sales`: 64 archivos / 1394 verdes.
  **Commit `4feb9ffe`.**
- [x] **T11** Dashboard — UI de KPIs: grilla `grid-cols-2 lg:grid-cols-4`; reemplazar el `+` por
  el icono `(i)` en el header del KPI, alineado a la derecha; **fusionar las dos vistas** (totales
  por moneda + desglose por canales) en un solo popup.
  → Grilla a `grid-cols-2 gap-4 lg:grid-cols-4`, con el comentario falso de "two columns / paridad
  Angular" reescrito. El `+` **eliminado**. El popup de totales por moneda y el de detalle
  fusionados en **uno solo**, que abre el `(i)` y también el valor (para no perder ningún
  affordance que existiera antes); el popup de tendencia ("vs anterior") queda aparte. No existía
  `InfoIcon`: se reutilizó `HelpIcon`, que ya es el glifo de círculo con "i" pese al nombre.
  **Commit `85594722`.**
- [x] **T12** Dashboard — filtro + chips: filtro global de moneda; widgets siguen el filtro;
  chips informativos con la moneda filtrada marcada activa.
  → Fila centrada `Moneda` bajo el filtro de fechas, en ambos modos, con opciones desde
  `presentCurrencies` sobre las métricas **SIN filtrar** para que el filtro no se encoja al elegir.
  KPIs, gráficos, donuts y tablas siguen el filtro; el popup **no** (la decisión 10 pide el total
  por cada moneda). Los chips de desglose pasan a **indicadores informativos** (todas las monedas,
  la filtrada activa) y se elimina el estado muerto de selección por widget. Módulo OFF intacto:
  cae al grupo primario y el selector legacy CUP/USD no se toca. `CurrencyChips` no tiene
  consumidores fuera del dashboard. Colisión real encontrada y arreglada: el `setCurrency` del
  hook chocaba con el del servicio legacy de moneda en `dashboard.tsx`.
  **Commit `85594722`.**
- [x] **T13** Dashboard / multi-store: desglose de modos de pago por **canal real** (quitar
  `Tarjeta`) y corregir el **doble conteo** de una transferencia en USD (hoy entra en el cubo de
  efectivo Y en el de transferencia: `multi-store-aggregator.ts:602/625` vs `:610/629`).
  → `paymentBreakdown` agrupa por `normalizedOrderPaymentMethod` (la convención que ya usaban
  today-stats, cuadre y los filtros de órdenes) y los labels salen de `SalePaymentMethod`:
  **`Tarjeta` es inalcanzable**. Consecuencia declarada: `Zelle` se funde en `Transferencia`,
  igual que en las otras vistas. El cubo de efectivo y el de transferencia de multi-store
  derivan ahora de **una sola** resolución → mutuamente excluyentes.
  Bug demostrado **antes** de arreglar: el test de regresión reportó `expected 300 to be 100`
  (100 de efectivo + 200 de una transferencia USD contada otra vez como transferencia).
  Se reutilizó `CART.EFECTIVO` y `CHANNEL_RATES.METHOD_TRANSFERENCIA`; sin claves nuevas.
  **Commit `35d55af3`.** Auditoría: `today-stats` ya resolvía el efectivo por canal real; créditos
  y gastos son inmunes (un crédito no tiene campo de canal real y ambos escriben su espejo legacy
  sin mirar la moneda).
- [x] **T13b** (hallazgo de la auditoría de T13, no estaba en el plan): la ruta **single-store** de
  `cuadre-por-fechas` tenía el **mismo** doble conteo (`:287`, `:309` usaban el `paymentType`
  legacy mientras el lado de transferencias ya usaba el canal real). Dejarlo habría dejado
  single-store y multi-store resolviendo el efectivo **distinto**. Arreglado con la misma
  resolución. Demostrado antes de arreglar: `expected '400 CUP' to be '100 CUP'`.
  **Commit `d9412068`.**
- [x] **T14** Checks verdes + evidencia: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
  → `pnpm typecheck` exit 0. `pnpm lint` (workspace) **4/4 tasks successful**, `--max-warnings=0`.
  **Suite completa: 312 archivos / 4637 tests verdes, `Type Errors: no errors`, exit 0.**

## Estado final de la feature

**T1–T14 COMPLETAS** (más T13b, hallazgo colateral). Todas las decisiones del owner implementadas
y verificadas.

## Correcciones post-entrega (2026-09-26, reportadas por el owner)

El owner reportó que en su entorno seguía viendo 2 KPIs por fila y el botón `+`. **Causa: los
commits de T6–T14 estaban solo en local**, y el entorno de test (`vdt.playground.sceiba.net`)
despliega desde el REMOTO (ver `odd/tasks/test-env-deploy.md`) → no los tenía. No era un fallo del
código, era un fallo de entrega: **sin push, el trabajo no existe para el owner.**

Además, el owner rechazó dos decisiones que el orquestador tomó por su cuenta:

1. **Zelle fundido con Transferencia.** T13 usó `normalizedOrderPaymentMethod` (que colapsa
   Zelle → Transferencia) "por consistencia" con today-stats/cuadre. **La decisión 11 de ESTE
   documento ya decía `resolvedOrderPaymentMethod`.** El orquestador se desvió de su propio plan
   escrito. Arreglado: Zelle vuelve a ser un slice propio. Commit `63b0a72a`.
   En el resumen multi-store (que es un split de DOS vías efectivo/tarjeta, no un desglose de
   canales) el lado no-efectivo pasa a ser el **complemento** de efectivo en vez de
   `=== Transferencia`; con la igualdad ingenua **cada orden Zelle habría desaparecido de ambos
   cubos**. Los cubos siguen particionando las órdenes exactamente una vez.
   **Pendiente de decisión del owner**: el cubo `salesCardTotal` se rotula "Pago por Transferencia"
   pero incluye Zelle (ya lo hacía antes). El rótulo es impreciso.
   **Auditoría sin tocar** (decisión del owner): `today-stats.tsx:236,246`,
   `cuadre-por-fechas.tsx:288,294,312,318`, `payment-filter-options.ts:50`,
   `edit-order-modal.tsx:64,86` siguen colapsando Zelle.
2. **El valor del KPI abría el popup fusionado.** El owner pidió que **solo el `(i)`** lo abra.
   Arreglado. Commit `63b0a72a`.

**Lección**: (a) el trabajo sin push no llega al owner, y "verificado en local" no es "entregado";
(b) el orquestador se desvió de una decisión escrita en su propio documento para "mejorar la
consistencia" — la consistencia no autoriza a cambiar un requisito fijado por el owner.

## Criterios de aceptación

1. Módulo MultiMonedas OFF → salida **idéntica** a la actual en todas las vistas del alcance.
2. Módulo ON con 1 sola moneda → **sin filtro**, comportamiento actual.
3. Módulo ON con 2+ monedas → filtro visible, y **sigue visible** después de elegir una moneda.
4. Elegida una moneda, filas y totales muestran **solo** esa moneda, con el helper normal.
5. El PDF de reportes respeta la moneda elegida.
6. En el dashboard, `Tarjeta` **no aparece** en ningún desglose de modos de pago.
7. La grilla de KPIs muestra 4 por fila en desktop y 2 en móvil.
8. El `+` ya no existe; el `(i)` abre la vista fusionada.
9. Un unit test existente de una vista del alcance puede cambiar de expectativa solo por el
   cambio de helper; los E2E **no se tocan**.

## Forecast de entrega (heurística ~400 líneas)

Estimación: **~1 800–2 600 líneas** autoradas (13 tareas, 9 vistas + dashboard + PDF + infra).
**Muy por encima** del presupuesto de revisión de ~400 líneas → **PRs encadenados obligatorios**.
Real medido: **18 commits**, ~2 900 líneas netas en ~20 archivos. Estrategia elegida por el owner:
**commits por unidad de trabajo en `dev`**, push y PR después (los controla el owner); cadena
cacheada `stacked-to-main`. El push de este tramo ya lo autorizó y se hizo.

## Verificación

- Evidencia por tarea: comando ejecutado + resultado observado.
- `git status` no debe mostrar cambios fuera del alcance (backend/E2E intactos).

## Estado

- 2026-09-25: documento creado tras inventario de vistas y 20 rondas de preguntas al owner.
  Decisiones 1–12 fijadas.
- 2026-09-25: estrategia de entrega elegida por el owner → **commits por unidad de trabajo en
  `dev`**, PR y push después (los controla el owner). Cadena cacheada: `stacked-to-main`.
- 2026-09-25: **T1 implementada** (commit `cc6009db`). Infra compartida lista; ninguna vista
  migrada todavía.
- 2026-09-25: **T2 y T3 implementadas** (commits `959f5725` + refactor `02f1afb7`).
  Evidencia: `app/sales` + `app/statistics` + `app/shared/components/multimonedas` →
  **70 archivos / 1458 tests verdes**, `pnpm typecheck` limpio, `eslint --max-warnings=0` limpio.
  Los tests `*-multicurrency.test.tsx` de las dos vistas se actualizaron a propósito (fijaban los
  chips que esta feature elimina); con el módulo OFF la salida es idéntica.
- 2026-09-25: **T4 y T5 implementadas** (commit `a69adb23`), incluyendo ambos modos
  multi-store. `pnpm typecheck` limpio; `pnpm eslint --max-warnings=0` limpio.
  Lección registrada: el writer reportó "todo verde" y una corrida del orquestador falló. La
  investigación mostró que el fallo era **flakiness preexistente por timeout** (ver Hallazgos),
  no una regresión — pero el chequeo del orquestador es lo que lo demostró.
- 2026-09-25: **T6 y T7 implementadas** (commits `39eba2b8` y `8c0ce6c4`). T7 adelantada sobre T6
  por criterio: tenía un bug de correctitud (suma de monedas distintas rotulada CUP), y no tiene
  sentido filtrar un total mal calculado. T6 además corrigió la misma clase de bug en la mitad
  agregada multi-store del cuadre y arregló el reporte del owner de los 4 KPIs por fila.
  Evidencia: `app/statistics` 8/122 + `multistore` verdes; `app/expenses` 8/161 verdes.
- 2026-09-25: **T8 y T9 implementadas** (commits `371cd755` y `bb4a9921`). Evidencia:
  `app/inventory` 23/520 + `app/sales` 59/1332 → juntos 82 archivos / 1852 tests verdes,
  sin errores de tipos.
- 2026-09-25: **T13 y T13b implementadas** (commits `35d55af3` y `d9412068`). El bug de `Tarjeta`
  está cerrado y **los dos dobles conteos** de transferencias USD también (multi-store y
  single-store). El writer demostró ambos bugs con una aserción antes de arreglarlos.
- 2026-09-25: **T11 y T12 implementadas** (commit `85594722`). Grilla a 4 por fila en desktop,
  `+` fuera, popup fusionado tras el icono `(i)`, filtro global y chips informativos.
- 2026-09-25: **T10 implementada** (commit `4feb9ffe`). Las filas del reporte llevan su moneda y
  el PDF la respeta.
- 2026-09-25: **T14 — FEATURE COMPLETA.** `pnpm typecheck` exit 0; `pnpm lint` 4/4 tasks;
  **suite completa: 312 archivos / 4637 tests verdes, `Type Errors: no errors`**.
- 2026-09-25: **push del tramo autorizado por el owner** → `origin/dev` quedó en `b87d7e8c` al
  momento de ese push; los commits posteriores (T6–T14) **están pendientes de push**.
- **Pendiente**: T10 (reportes + PDF), T11/T12 (dashboard: grilla, icono `(i)`, popup fusionado,
  filtro), T14 (checks).

## Hallazgos colaterales registrados (no bloquean)

- **La suite tiene flakiness PREEXISTENTE por timeout.** El timeout por defecto de vitest es
  5000 ms. Los specs "factory"
  (`app/sales/lib/services/__tests__/product-{service,category-service}.factory.test.ts`) usan
  `vi.resetModules()` + `vi.mock` + `import()` dinámico, así que su PRIMER test
  (`FACT-01` / `CAT-FACT-01`) paga la resolución completa del grafo y bajo carga revienta los
  5 s. Evidencia: en HEAD limpio pasan; con el mismo árbol pasan en una corrida y fallan en otra;
  el set de fallos de la suite completa **cambia en cada corrida** (`user-routes`, `my-stores`,
  `auth-store.offline`) con archivos que no tocan ventas. No lo introdujo esta feature.
  **No se toca ninguno de esos tests**: son existentes. Un arreglo legítimo sería subir el
  timeout de esos specs, pero eso requiere autorización explícita del owner.
- `frontend/` (Angular) nunca se leyó en esta investigación: la decisión de layout de
  `7f0544c6` se tomó mirando Angular, y eso no es una razón autorizada en este proyecto.
- `resolveCurrency` (`currency ?? CUP`) hace que una entidad **sin moneda** sea
  indistinguible de una en CUP. No es la causa del reporte del owner (era el rango por defecto
  del dashboard, que excluye HOY), pero el generador de datos demo escribe órdenes sin
  `currency` (`demo-data-generator.ts:118-133`) y `reviveAndBackfillOrder` no la rellena.
- El rango por defecto del dashboard es `[ayer−6, ayer]`: **excluye hoy**
  (`dashboard.tsx:34-37`). El owner ya lo confirmó como causa de su reporte inicial.
