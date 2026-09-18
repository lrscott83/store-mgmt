# Dashboard POS para dueño del negocio

> **Actualizado 2026-09-17** con el alcance acordado en la sesión de análisis.
> **Estado: plan cerrado (sin pendientes), sin implementar.** Alcance elegido: **A — datos + filtro sobre la vista actual** (sin rediseño estructural).

## Objetivo

Ver cómo se comporta el negocio de forma general, sin ranking entre tiendas y sin desgloses horarios.
El dashboard debe ser mobile friendly, con cards apiladas, útil para tomar decisiones rápidas.

## Planes detallados (temas complejos)

- **Moneda** (regla por moneda, "+" y popup de desglose): `docs/plans/2026-09-17-dashboard-moneda-plan.md`
- **Ganancia y margen con monedas mixtas** (decisión B1 + trabajo futuro): `docs/plans/2026-09-17-dashboard-ganancia-monedas-mixtas-plan.md`

## Filtro global de fechas

- **Componente**: `app/shared/components/date-range-filter/date-range-filter.tsx` (el mismo que ya usa Créditos). No se modifica el componente compartido.
- **Ubicación**: arriba de todo, antes de las cards.
- **Aplica a**: las 8 cards (excepto Créditos por cobrar), ambas gráficas, ambos donuts y ambas tablas.
- **Default**: `start = ayer − 6 días`, `end = ayer` → **7 días inclusivos que terminan en el día de ayer**.
- **"Limpiar"**: restaura el default (nunca "todo el histórico"). Se implementa en el handler del dashboard; Créditos conserva su comportamiento actual.
- **Ventana de consulta**: los servicios filtran con `date < endDate`, así que el rango se pasa semiabierto `[start, end + 1 día)` (patrón ya probado en Créditos).
- **Datos**: servicios offline locales (almacenamiento del dispositivo). No hay consulta al backend.

## KPIs finales (8 cards)

Todas por **periodo seleccionado**, sin "Hoy". **Todos los tipos de orden suman** (Normal, Mayorista, Merma, Ajuste, Otro) — decisión explícita del negocio.

| Card | Cálculo |
|---|---|
| Ventas | Σ total de órdenes activas del rango |
| Gastos | Σ gastos activos del rango (módulo Gastos) |
| Ganancias Bruta | Σ ganancia por venta (precio × cantidad − costo × cantidad) |
| Ganancias | Ganancias Bruta − Gastos |
| Margen % | Ganancias Bruta ÷ Ventas × 100 |
| Promedio por transacción | Ventas ÷ cantidad de órdenes |
| Unidades/transacción | Σ unidades ÷ cantidad de órdenes |
| Créditos por cobrar | **Global, sin filtro de fecha**: saldo de créditos activos no pagados. Sparkline = saldo al cierre de cada bucket |

- Cada card lleva el trend **"vs anterior"** subrayado; al hacer tap se abre un popup que explica el cálculo y muestra las **fechas del rango anterior** (ventana de igual longitud inmediatamente anterior al rango seleccionado).
- **Créditos por cobrar** no sigue el filtro de fechas (son deudas). Multi-tienda: un valor por tienda + el general de todas.
- Las cantidades ya vienen en unidades: la conversión de paquetes mayoristas se hace en el carrito.
- Cada card incluye una **sparkline**: mini línea con la evolución del KPI en el período, en la **misma granularidad** que las gráficas y en la **moneda principal** de la card (las demás monedas, en el popup "+").
- **Créditos por cobrar** (opción b): su sparkline muestra el **saldo no pagado al cierre de cada bucket** — Σ créditos activos con `date <= fin del bucket` y (`!isPaid` o `paidDate > fin del bucket`). Incluye deudas anteriores al rango (es un saldo, no un flujo), consistente con que la card es global.

## Popups de detalle

- Tap en cualquier card abre un popup **mobile friendly** (pantalla completa en mobile).
- Contenido interno en **cards** (nunca tablas anchas).
- Desglose por card: Ventas → método de pago · Gastos → lista de gastos · Ganancias Bruta → venta vs costo · Ganancias → bruta − gastos · Margen % → fórmula con números · Promedio y Unidades → cantidad de órdenes · Créditos → listado.
- Los montos siguen la **regla de moneda** (ver abajo y plan de moneda).

## Gráficas

- **Ventas** y **Ganancias**: se mantienen, ahora por rango con **granularidad adaptativa**:
  - ≤ 31 días → diaria
  - 32–92 días → semanal
  - \> 92 días → mensual
- **Etiquetas del eje X**:
  - Diaria con rango ≤ 7 días → abreviaturas de días: `Lun, Mar, Mié, Jue, Vie, Sáb, Dom`
  - Diaria con rango > 7 días → día del mes: `7, 8, 9` (más legible en mobile)
  - Semanal → `Lun 8 – Dom 14`
  - Mensual → `Sep`
- **Donuts**: método de pago y categoría, **con porcentaje**, **por moneda**, con chips de moneda dentro de la card (orden de prioridad). Con una sola moneda los chips no se muestran.

## Tablas de top-productos

- Se mantienen las 2 listas actuales (mayor ganancia y más vendidos), ahora **por rango**.
- Mezclan todos los tipos de orden; nota visible: **"Incluye todos los tipos de venta (normal, mayorista, merma, ajuste, otro)"**.

## Reglas transversales

### Moneda
- **Nunca se suman monedas distintas**: todo agregado se agrupa por moneda.
- Prioridad de la moneda principal: **USD → EUR → CUP → la de mayor monto**.
- Si hay **2 o más monedas**: valor principal + **"+"** al lado → tap → popup con el monto principal y todas las demás monedas (sin conversión).
- Con **una sola moneda** no hay "+".
- El selector legacy "Moneda: CUP/USD + rate" se **elimina cuando el módulo MultiMonedas está activo**. Sin el módulo todo es CUP y el selector permanece.
- Detalle: `docs/plans/2026-09-17-dashboard-moneda-plan.md`.

### Ganancia con monedas mixtas
- Decisión **B1**: el costo se resta tal cual (sin conversión), igual que el resto de la app; el ítem entra en la ganancia de la moneda de la **venta**.
- Detalle y trabajo futuro: `docs/plans/2026-09-17-dashboard-ganancia-monedas-mixtas-plan.md`.

### Multi-tienda
- Misma vista por tienda en paneles colapsables + vista general agregada.
- **Sin ranking entre tiendas**: orden fijo (alfabético).
- Créditos por cobrar: uno por tienda + el general.

### Mobile
- Cards apiladas, 2 columnas.
- Popups a pantalla completa.
- Listas en cards, no tablas anchas.

### Header
- Nombre del negocio: la tienda seleccionada; "Todas las tiendas" en multi-tienda.

## Mapa: elementos del plan original → destino

| Elemento original | Destino |
|---|---|
| Ventas totales | Card **Ventas** |
| Margen bruto | Card **Ganancias Bruta** |
| Margen % | Card **Margen %** |
| Transacciones | No es card: base de **Promedio** y **Unidades/transacción** (visible en sus popups) |
| Promedio por transacción | Card **Promedio** |
| Unidades por transacción | Card **Unidades/transacción** |
| Crecimiento | Trend **"vs anterior"** en cada card (subrayado + popup con fechas) |
| Distribución por método de pago | **Donut** por moneda |
| Distribución por categoría | **Donut** por moneda |
| Sparklines | **Incluidas** en las cards (evolución del KPI en el período) |
| Insights en lenguaje natural | **Fuera** de esta etapa |
| Alertas por umbral configurables | **Fuera** de esta etapa |
| Navegación inferior (5 pestañas) | **Fuera** de esta etapa (la vista actual mantiene su estructura) |
| Modo offline | **Ya existe**: la app es offline-first |
| Exportar resumen | **Fuera** de esta etapa |
| Notificaciones push | **Fuera** de esta etapa |
| Seguridad por roles | **Ya existe**: `featureLoader([EFeatures.Dashboard])` |
| Tap en card → detalle | **Popups de detalle** (todas las cards) |
| Selector de POS | **Multi-tienda**: por tienda + general (POS = tienda) |
| Sin tablas / sin ranking | Las 2 tablas de top-productos **se mantienen**; el "sin ranking" aplica **entre tiendas** |

## Fuera de alcance (explícito)

- Descuentos y devoluciones: no existen en el modelo; se ignoran en esta etapa.
- Rediseño mobile-first con navegación inferior por pestañas.
- Insights, alertas, push, export.

## Cierre

Decisiones cerradas el 2026-09-17. **Sin pendientes**: listo para implementar.
