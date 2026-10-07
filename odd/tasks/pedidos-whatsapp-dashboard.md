# Pedidos WhatsApp — dashboard de pedidos y pago (F5)

## Objetivo

Añadir la vista **"Pedidos"** del panel: **listar y filtrar** los pedidos online leídos **desde el
servidor**, **cambiar el estado** (`New → Accepted → Preparing → Ready → Delivered` + `Cancelled`),
**marcar el pago** (`Pending`/`Paid`) y **asignar repartidor**. Expone los endpoints de gestión JWT
bajo `/api/v1/online-orders`. La gestionan **OwnerAdmin y StoreUser**.

## Problema

Aunque F3/F4 creen y envíen pedidos, la tienda no tiene dónde verlos ni gestionarlos. No existen
endpoints de listado, cambio de estado, pago ni asignación, ni una vista que los consuma. El POS
local no sirve: el pedido online vive **solo** en el servidor (D10/D14).

## Por qué

- El ciclo de vida del pedido (D11) y el pago (D12) necesitan una interfaz operativa; sin ella la
  feature no cierra el circuito.
- Leer **desde el servidor** (D10) es obligatorio: el pedido online no está en localStorage del POS.
- Concentrar en una vista el estado, el pago y el reparto evita saltar entre pantallas para operar un
  pedido.
- D15 pide que el **StoreUser** pueda operar el día a día; una feature propia (`OnlineOrdersAdmin`)
  incluye OwnerAdmin + StoreUser sin abrir la configuración.

## Alcance

### Autorizado

- Backend (módulo Catálogo Web): `GetOnlineOrdersQuery`, `GetOnlineOrderByIdQuery`,
  `UpdateOrderStatusCommand`, `UpdateOrderPaymentStatusCommand`, `AssignOrderDriverCommand`, y
  `OnlineOrdersController` con `[HasPermission(StoreRoleFeatures.OnlineOrdersAdmin)]`.
- UI React: vista **Pedidos**, ruta y entrada de menú, componentes de lista/filtros/detalle, cliente
  API JWT, i18n y tests unitarios nuevos.

### Fuera de alcance

- No se implementa el enlace `wa.me` (F4), las métricas/historial de Ventas (F6) ni el CRUD de
  repartidores (F7) — aunque la asignación consume datos de F7.
- No se sincroniza nada con el POS (D14).
- No se añade método/tipo de pago (D3/D12).
- **No hay estado "En camino"** (D18).
- No se altera el catálogo web ni su UI.

## Dependencias

- F2: entidades, enums, feature `OnlineOrdersAdmin`, reglas de transición; `Order.Code`, `Status`,
  `PaymentStatus`, `DriverId`.
- F3/F4: generan los pedidos que aquí se gestionan.
- F7: tabla `DeliveryDriver` para poblar el selector de reparto.
- Patrón de controlador de gestión: `CatalogController` (`[HasPermission(WebCatalogAdmin)]`).

**Frontera con F7 (resuelta 2026-10-07).** F5 es la **dueña única** de la asignación de repartidor:

- **T5** (`AssignOrderDriverCommand`) valida que el `DriverId` existe, es de la tienda y está activo.
- El filtro `driverId` de `GetOnlineOrdersQuery` es lo que permite leer los pedidos de un repartidor.

F7 soltó ambas por redundantes y ya no las implementa. Si ves esas validaciones descritas en el
documento de F7, ese documento está desactualizado — la fuente es esta.

## Decisiones del owner aplicables

| # | Decisión | Cómo aplica a F5 |
| --- | --- | --- |
| D3 | Pago manual en entrega/recogida | Marcar `Paid` a mano, sin pasarela. |
| D5 | Repartidores con asignación | Asignar `DriverId` desde el pedido. |
| D10 | Panel desde el servidor (online) | Listado y acciones contra la API. |
| D11 | Flujo de estados | Acción "cambiar estado". |
| D12 | Pago Pendiente/Pagado | Acción "marcar pago". |
| D14 | Sin sincronización POS ↔ backend | El panel no lee el POS. |
| D15 | StoreUser gestiona pedidos/ventas/repartidores; OwnerAdmin configura | Feature `OnlineOrdersAdmin` (OwnerAdmin + StoreUser). |
| D18 | Sin estado "En camino" | El flujo no lo ofrece. |

## Decisiones resueltas y notas

**No quedan decisiones abiertas bloqueantes para F5.** Las antiguas A1/A5/A6 quedaron resueltas así:

- **A1 → D15**: la gestión de esta vista es de **OwnerAdmin + StoreUser** vía la feature
  `OnlineOrdersAdmin` (no `WebCatalogAdmin`, que queda para la configuración). La propuesta original
  de" solo OwnerAdmin" queda descartada.
- **A5 → D18**: **no** hay estado "En camino".
- **A6 → confirmado**: la vista se llama **"Pedidos"**; ruta propuesta `/sales/online-orders` →
  `sales/routes/ordering-orders.tsx`.

## Diseño técnico

### Backend — endpoints de gestión (JWT + `OnlineOrdersAdmin`)

| Método | Ruta | Command/Query | Notas |
| --- | --- | --- | --- |
| GET | `/api/v1/online-orders` | `GetOnlineOrdersQuery` | filtros: `status`, `paymentStatus`, `deliveryType`, `driverId`, `from`, `to`, `search` (código/teléfono), paginación |
| GET | `/api/v1/online-orders/{id}` | `GetOnlineOrderByIdQuery` | detalle con líneas |
| PATCH | `/api/v1/online-orders/{id}/status` | `UpdateOrderStatusCommand` | valida transición (F2) |
| PATCH | `/api/v1/online-orders/{id}/payment` | `UpdateOrderPaymentStatusCommand` | `Pending`/`Paid` |
| PATCH | `/api/v1/online-orders/{id}/driver` | `AssignOrderDriverCommand` | `DriverId` (o null para desasignar) |

- `OnlineOrdersController` (`[HasPermission(StoreRoleFeatures.OnlineOrdersAdmin)]`).
- Todas las consultas filtran por la tienda actual (`StoreId` del contexto) — aislamiento por tienda.
- `UpdateOrderStatusCommand` usa la tabla de transiciones de F2 y rechaza inválidas (400 propuesto).

### UI React (propuesta)

- Ruta: `route('sales/online-orders', 'sales/routes/ordering-orders.tsx')` (propuesta); entrada en
  `menu-config.ts` gateada por la feature `OnlineOrdersAdmin`.
- `OrderingOrdersPage`:
  - Tabla/lista con columnas: código, cliente/teléfono, tipo de entrega, total, estado, pago,
    repartidor, fecha.
  - Filtros: estado, pago, tipo de entrega, repartidor, rango de fechas, búsqueda por
    código/teléfono.
  - Acciones por pedido: cambiar estado (según transiciones válidas, **sin "En camino"**), marcar pago
    (`data-testid="order-payment-{id}"`), asignar repartidor (selector poblado desde F7).
  - Refresco manual y/o polling ligero (**propuesta**); lectura siempre contra el servidor.
- Cliente API en `app/sales/lib/ordering/` (propuesta).

## Tareas

- [ ] **T1** — `GetOnlineOrdersQuery` (filtros + paginación + aislamiento por tienda).
- [ ] **T2** — `GetOnlineOrderByIdQuery` (detalle con líneas).
- [ ] **T3** — `UpdateOrderStatusCommand` (transiciones válidas).
- [ ] **T4** — `UpdateOrderPaymentStatusCommand`.
- [ ] **T5** — `AssignOrderDriverCommand` (validar que el `DriverId` sea de la tienda y activo).
- [ ] **T6** — `OnlineOrdersController` con `[HasPermission(OnlineOrdersAdmin)]` y rutas.
- [ ] **T7** — Vista `ordering-orders.tsx` (lista, filtros, acciones).
- [ ] **T8** — Registrar ruta + menú.
- [ ] **T9** — Claves i18n.
- [ ] **T10** — Tests unitarios nuevos (queries/commands con Moq; componente).
- [ ] **T11** — Verificación (build/tests backend, `typecheck`/`lint`/`vitest`).

## Criterios de aceptación

1. La vista lista pedidos leídos del servidor; recargar mantiene el estado.
2. Filtrar por estado/pago/tipo/repartidor/fechas/búsqueda devuelve el subconjunto correcto.
3. Cambiar estado solo permite transiciones válidas; una inválida se rechaza. No existe "En camino".
4. Marcar pago alterna `Pending`/`Paid` y persiste en servidor.
5. Asignar repartidor de la tienda actualiza el pedido; no se puede asignar un repartidor ajeno.
6. Los endpoints exigen `OnlineOrdersAdmin` (OwnerAdmin y StoreUser entran; sin la feature, 403).
7. El pedido ajeno (otra tienda) no aparece ni se puede modificar.

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

- **Feature de gestión sin mapeo**: `OnlineOrdersAdmin` debe tener su `[HasFeature]`/`[HasModule]`.
- **Filtrado por tienda**: olvidar el filtro expone pedidos de otra tienda.
- **Transiciones inconsistentes**: centralizar la regla en dominio (F2), no duplicarla.
- **Polling y carga**: paginar y no traer todo el histórico (eso es F6).

## Siguiente paso

Implementar F5 tras F2 y F7 (para el selector de repartidores).

## Progreso

- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: gestión por OwnerAdmin + StoreUser (`OnlineOrdersAdmin`,
  D15); sin "En camino" (D18); vista "Pedidos" confirmada (A6); "Decisiones abiertas" → "Decisiones
  resueltas y notas". Sin implementación.
- 2026-10-07 — **Frontera con F7 resuelta.** Se documenta que F5 es la dueña única de la asignación de
  repartidor (T5 + filtro `driverId`), y que F7 soltó esas tareas por redundantes. No cambia ninguna
  tarea de este documento: T5 y el filtro ya existían aquí. Sin implementación.
