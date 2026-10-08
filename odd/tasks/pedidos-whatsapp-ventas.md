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

- [x] **T1** — `GetOnlineOrderStatsQuery` + `OnlineOrderStatsDto`. Commit `14bd3ada`. Revisión nativa
  `review-e3fa56dee5229ec4` (lens `review-reliability`) **approved + acknowledged**.
- [x] **T2** — Endpoint `GET /api/v1/online-orders/stats` en `OnlineOrdersController`. Commit `14bd3ada`.
- [x] **T3** — Vista `ordering-sales.tsx` (filtros + métricas + historial). Commit `e3a1c218`. Revisión
  nativa `review-1efd9968b04e4d99` **approved + acknowledged**.
- [x] **T4** — Registrar ruta + menú. Commit `e3a1c218`.
- [x] **T5** — Claves i18n. Commit `e3a1c218`.
- [x] **T6** — Tests unitarios nuevos (query con datos sembrados; componente). Commits `14bd3ada`, `e3a1c218`.
- [x] **T7** — Verificación (build/tests backend, `typecheck`/`lint`/`vitest`). Ver evidencia abajo.

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

## Ruta de implementación (ODD) y disparadores

F2 y F5 están implementados y verificados; F6 reutiliza `OnlineOrdersController` y su permiso.

| Unidad de trabajo | Tareas | Ruta | Disparador / evidencia |
| --- | --- | --- | --- |
| Backend — stats + endpoint | T1, T2 | Delegada (escritor) | ≥2 ficheros; `IOrderRepository` necesita agregación nueva (aditiva) y el controlador una acción |
| Frontend — vista + ruta + menú + i18n + tests | T3, T4, T5, T6 | Delegada (escritor) | ≥2 ficheros; reutiliza `ordering-http-service` y `EFeatures.OnlineOrders=123` |
| Verificación | T7 | Delegada (verificador) | Comandos de la sección homónima |

**Revisión nativa (RDD, on):** se ejecuta **tras cada commit, en el checkout principal, con HEAD fijado en
ese commit** y `--base-ref` = el commit anterior (candidato = una sola unidad). NO usar worktrees: el
transporte del plugin (`opencode-review-transport.ts`) lanza el reviewer con `cwd =` el directorio de la
sesión, por lo que un binding creado en un worktree no es releable.

## Siguiente paso

F6 implementado, revisado (2/2 unidades `approved` + `acknowledged`) y verificado. La entrega
(commit/push/PR) es decisión del owner.

## Follow-ups (no bloqueantes)

### Unidad 1 (backend)

- **R3-001** (WARNING) — La agregación nueva de `OrderRepository.GetStatsByStoreIdAsync`
  (Count/Sum condicionales dentro de `GroupBy(_ => 1)` + subconsulta de moneda) solo se prueba con el
  provider **InMemory**; no hay test contra Npgsql, así que un fallo de traducción o de materialización
  decimal/null daría un 500 en runtime con la suite verde. Destino: test de integración/E2E nuevo.
- **R3-002** (SUGGESTION) — Un rango invertido (`From` > `To`) no se valida ni se cubre: devuelve el
  mismo DTO a cero que un periodo genuinamente vacío. Destino: F6 (validación/UX).

### Unidad 2 (frontend)

- **R3-01** (WARNING) — `loadStats`/`loadOrders` sin cancelación ni guarda de orden: una respuesta
  lenta anterior puede sobrescribir datos más nuevos (cambiar filtros en rápida sucesión). Sin test de
  resolución fuera de orden.
- **R3-02** (WARNING) — El filtro por `New` (enum `0`) no tiene test y su conversión depende de
  `withoutEmptyFilters` (que no debe usar truthiness o descartaría el 0 en silencio).
- **R3-03** (SUGGESTION) — `isLoadingStats`/`isLoadingOrders` solo pasan a `false`; no hay feedback de
  carga tras la primera lectura.
- **R3-04** (SUGGESTION) — `formatOrderDate` (sufijo `Z`/`Invalid Date`) sin test; la columna DATE no
  se asserta.
- **R3-05** (SUGGESTION) — Los asserts de desglose fijan ordinales de enum en crudo en vez de
  referenciar los miembros.

## Evidencia de verificación (T7, 2026-10-08)

| Comando | Resultado |
| --- | --- |
| `dotnet build src/SMCA.sln` | `Build succeeded`, 0 errores (sin `error MSB`) |
| `dotnet test src/Application.Tests/…` | **931 passed (931)**, 0 fallos (spot check del padre) |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` (`--max-warnings=0`) | exit 0 |
| `pnpm vitest run app/sales/routes/__tests__/` | **349 passed (349)**, 21 ficheros, sin errores de tipo |
| E2E | No se tocaron |

## Progreso

- 2026-10-08 — **F6 completo (T1–T7).** Commits `14bd3ada` (backend stats + endpoint) y `e3a1c218`
  (vista Ventas + ruta + menú + i18n + cliente + tests). Revisión nativa por commit en el checkout
  principal: unidad 1 `review-e3fa56dee5229ec4` y unidad 2 `review-1efd9968b04e4d99`, **ambas `approved`
  + `acknowledged`** (autoridad quemada); 7 hallazgos advisory no bloqueantes (2 WARNING + 2 WARNING +
  3 SUGGESTION) listados arriba. Verificación: 931 backend + 349 vitest, typecheck/lint limpios.
- 2026-10-08 — **Unidad 1 (T1+T2) implementada y revisada.** Commit `14bd3ada`; 43 tests nuevos
  (26 handler + 17 repositorio con InMemory real); `Application.Tests` 931/931. Revisión nativa por
  commit en el checkout principal: `approved` + `acknowledged` (autoridad quemada), 2 hallazgos
  advisory (R3-001 WARNING, R3-002 SUGGESTION). Nota de proceso: el review por commit con HEAD fijado
  SÍ funciona (a diferencia de intentarlo por worktrees).
- 2026-10-08 — Arranque autorizado por el owner ("commit y push, luego pasa para F6 y que sí se pueda
  hacer RDD"). F5 ya pusheado a `origin/test`. Ruta y disparadores fijados; revisión nativa planificada
  por commit en el checkout principal. Sin escrituras aún.
- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: acceso StoreUser (`OnlineOrdersAdmin`, D15); moneda del
  catálogo (A3 eliminada); sin "En camino" (D18); vista "Ventas" confirmada (A6);
  "Decisiones abiertas" → "Decisiones resueltas y notas". Sin implementación.
