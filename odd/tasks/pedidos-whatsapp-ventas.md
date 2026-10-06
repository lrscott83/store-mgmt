# Pedidos WhatsApp — ventas e historial (F6)

## Objetivo

Añadir la vista **"Ventas"** del panel: **historial de pedidos online** con filtros y **métricas**
(cantidad de pedidos, ventas totales, ticket medio, desglose por estado/pago/entrega), alimentada por
el endpoint `/api/v1/online-orders/stats`. Lectura desde el servidor. La gestionan **OwnerAdmin y
StoreUser**.

## Problema

El dashboard (F5) opera el pedido del día, pero no ofrece una lectura histórica agregada. La tienda
no puede saber cuánto vendió por pedidos online en un rango, cuántos quedaron pendientes de pago ni
cómo se reparten por tipo de entrega.

## Por qué

- Un histórico separado del dashboard operativo respeta D8 (vistas separadas por página) y evita
  mezclar operación diaria con análisis.
- Las métricas se calculan en el servidor para no traer todo el histórico al cliente y para que el
  resultado sea consistente.
- D15 pide que el **StoreUser** también pueda consultar ventas; la feature `OnlineOrdersAdmin`
  (OwnerAdmin + StoreUser) cubre esta vista sin abrir la configuración.

## Alcance

### Autorizado

- Backend: `GetOnlineOrderStatsQuery` + endpoint `GET /api/v1/online-orders/stats` en
  `OnlineOrdersController` (`[HasPermission(OnlineOrdersAdmin)]`).
- UI React: vista **Ventas**, ruta y entrada de menú, componentes de filtros/historial/métricas,
  cliente API, i18n y tests unitarios nuevos.

### Fuera de alcance

- No se modifica el dashboard de pedidos (F5) ni sus endpoints.
- No se sincronizan ventas del POS (D14): las métricas son **solo** de pedidos online.
- No se implementa el CRUD de repartidores (F7) ni el enlace `wa.me` (F4).
- **Sin moneda propia** (A3 eliminada): los totales y la moneda vienen del catálogo.
- No se altera el catálogo web.

## Dependencias

- F2: entidades, enums y campos (`Status`, `PaymentStatus`, `DeliveryType`, `Total`, `Currency`,
  `Date`) y la feature `OnlineOrdersAdmin`.
- F5: reutiliza el controlador `OnlineOrdersController` y su permiso.
- Catálogo: la moneda usada para formatear totales sale de los pedidos/productos, no de una config.

## Decisiones del owner aplicables

| # | Decisión | Cómo aplica a F6 |
| --- | --- | --- |
| D8 | Vistas separadas | "Ventas" es una vista propia. |
| D10 | Panel desde el servidor | Métricas calculadas en servidor. |
| D11 | Estados | Desglose por estado. |
| D12 | Pago Pendiente/Pagado | Desglose por pago. |
| D14 | Sin sincronización POS ↔ backend | Métricas solo de pedidos online. |
| D15 | StoreUser gestiona pedidos/ventas/repartidores | Feature `OnlineOrdersAdmin` (OwnerAdmin + StoreUser). |
| D18 | Sin estado "En camino" | El desglose por estado no lo incluye. |
| — | Precios/moneda | **Fuera de alcance**: los totales y la moneda vienen del catálogo. |

## Decisiones resueltas y notas

**No quedan decisiones abiertas bloqueantes para F6.** Las antiguas A1/A3/A5/A6 quedaron resueltas
así:

- **A1 → D15**: el acceso es **OwnerAdmin + StoreUser** (`OnlineOrdersAdmin`); la propuesta original
  de "solo `WebCatalogAdmin`" queda descartada.
- **A3 → ELIMINADA**: las métricas **no** usan una moneda configurable; la moneda sale del catálogo.
- **A5 → D18**: **no** hay estado "En camino" en el desglose.
- **A6 → confirmado**: la vista se llama **"Ventas"**; ruta propuesta `/sales/online-orders/sales` →
  `sales/routes/ordering-sales.tsx`.

## Diseño técnico

### Backend — endpoint y query

`GET /api/v1/online-orders/stats` en `OnlineOrdersController`
(`[HasPermission(StoreRoleFeatures.OnlineOrdersAdmin)]`).

`GetOnlineOrderStatsQuery(from, to, status?, paymentStatus?, deliveryType?)` →
`OnlineOrderStatsDto` (propuesta):

| Campo | Descripción |
| --- | --- |
| `ordersCount` | Pedidos en el rango. |
| `totalSales` | Suma de `Total` de pedidos no cancelados. |
| `averageTicket` | `totalSales / ordersCount` (0 si vacío). |
| `paidCount` / `paidAmount` | Pago `Paid`. |
| `pendingCount` / `pendingAmount` | Pago `Pending`. |
| `byStatus` | Conteo por `OrderStatus`. |
| `byDeliveryType` | Conteo por `OrderDeliveryType`. |
| `currency` | Moneda del catálogo de los pedidos (no configurable). |

- Filtra por tienda actual y rango de fechas; excluye `Cancelled` de `totalSales` (propuesta).
- El histórico de lista puede reutilizar `GetOnlineOrdersQuery` (F5) con filtros de fecha; la
  agregación es responsabilidad de `GetOnlineOrderStatsQuery`.

### UI React (propuesta)

- Ruta: `route('sales/online-orders/sales', 'sales/routes/ordering-sales.tsx')` (propuesta); entrada
  en `menu-config.ts` gateada por `OnlineOrdersAdmin`.
- `OrderingSalesPage`:
  - Filtros: rango de fechas, estado, pago, tipo de entrega.
  - Tarjetas de métricas (`ordersCount`, `totalSales`, `averageTicket`, `paid`/`pending`).
  - Tabla de historial con paginación.
- Cliente API en `app/sales/lib/ordering/`.

## Tareas

- [ ] **T1** — `GetOnlineOrderStatsQuery` + `OnlineOrderStatsDto`.
- [ ] **T2** — Endpoint `GET /api/v1/online-orders/stats` en `OnlineOrdersController`.
- [ ] **T3** — Vista `ordering-sales.tsx` (filtros + métricas + historial).
- [ ] **T4** — Registrar ruta + menú.
- [ ] **T5** — Claves i18n.
- [ ] **T6** — Tests unitarios nuevos (query con datos sembrados; componente).
- [ ] **T7** — Verificación (build/tests backend, `typecheck`/`lint`/`vitest`).

## Criterios de aceptación

1. El endpoint devuelve métricas coherentes para un rango y las filtra por tienda.
2. `totalSales` excluye pedidos cancelados y usa la moneda del catálogo (`currency` de los pedidos).
3. El historial filtra por fechas/estado/pago/entrega correctamente.
4. Los endpoints exigen `OnlineOrdersAdmin` (OwnerAdmin y StoreUser) y no cruzan datos de otra tienda.
5. La vista no lee el POS.

## Comandos de verificación

```bash
cd backend
dotnet build src/SMCA.sln
dotnet test src/Application.Tests/Application.Tests.csproj

cd ../frontend-react/apps/web-store-pos
pnpm typecheck
pnpm lint
pnpm vitest run app/sales/routes/__tests__/
```

## Riesgos

- **Métricas mal agregadas** (incluir cancelados o mezclar monedas): fijar regla y testear. Como la
  moneda sale del catálogo, asumir una moneda única por tienda para la agregación (**propuesta a
  confirmar** si una tienda publicara productos en monedas distintas).
- **Rendimiento**: agregar en servidor, no traer todo el histórico.
- **Aislamiento por tienda**: filtro obligatorio.

## Siguiente paso

Implementar F6 tras F2 y F5.

## Progreso

- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: acceso StoreUser (`OnlineOrdersAdmin`, D15); moneda del
  catálogo (A3 eliminada); sin "En camino" (D18); vista "Ventas" confirmada (A6);
  "Decisiones abiertas" → "Decisiones resueltas y notas". Sin implementación.
