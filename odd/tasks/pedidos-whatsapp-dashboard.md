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

- [x] **T1** — `GetOnlineOrdersQuery` (filtros + paginación + aislamiento por tienda). Commit `f2dfd14c`.
- [x] **T2** — `GetOnlineOrderByIdQuery` (detalle con líneas). Commit `f2dfd14c`.
- [x] **T3** — `UpdateOrderStatusCommand` (transiciones válidas). Commit `8458fb91`.
- [x] **T4** — `UpdateOrderPaymentStatusCommand`. Commit `8458fb91`.
- [x] **T5** — `AssignOrderDriverCommand` (validar que el `DriverId` sea de la tienda y activo). Commit `8458fb91`.
- [x] **T6** — `OnlineOrdersController` con `[HasPermission(OnlineOrdersAdmin)]` y rutas. Commit `8458fb91`.
- [x] **T7** — Vista `ordering-orders.tsx` (lista, filtros, acciones). Commit `b674a881`.
- [x] **T8** — Registrar ruta + menú. Commit `b674a881`.
- [x] **T9** — Claves i18n. Commit `b674a881`.
- [x] **T10** — Tests unitarios nuevos (queries/commands con Moq; componente). Commits `f2dfd14c`, `8458fb91`, `b674a881`, `be568bab`.
- [x] **T11** — Verificación (build/tests backend, `typecheck`/`lint`/`vitest`). Ver evidencia abajo.

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

## Ruta de implementación (ODD) y disparadores

F2 (dependencia dura) está **implementado y verificado**. F7 lo está haciendo otro agente en paralelo; F5
integra contra su contrato `GET /api/v1/delivery-drivers?activeOnly=`. F3/F4 no bloquean la construcción
(solo la disponibilidad de datos reales en runtime).

| Unidad de trabajo | Tareas | Ruta | Disparador / evidencia |
| --- | --- | --- | --- |
| Backend — consultas + repo | T1, T2 | Delegada (escritor) | Escritura ≥2 ficheros no triviales; `IOrderRepository.GetByStoreIdAsync` no pagina (`IOrderRepository.cs:21`) → requiere método nuevo |
| Backend — commands + controller | T3, T4, T5, T6 | Delegada (escritor) | Escritura ≥2 ficheros; `NoTracking` global obliga a `Update` explícito antes de `SaveChangesAsync` |
| Backend — tests | T10 (backend) | Delegada (escritor) | Preparación + escritura |
| Frontend — vista + ruta + menú + i18n + cliente + tests | T7, T8, T9, T10 (front) | Delegada (escritor) | Escritura ≥2 ficheros; no existe `EFeatures.OnlineOrders` (`enums/index.ts:60`) |
| Verificación | T11 | Delegada (verificador) | Comandos de verificación de la sección homónima |

Commits por unidad de trabajo en la rama actual (`test`), stageando **solo** los ficheros de F5 (hay otro
agente trabajando F7 en paralelo sobre el mismo checkout). Estrategia de entrega: `ask-on-risk`.

## Evidencia de verificación (2026-10-07)

| Comando | Resultado |
| --- | --- |
| `dotnet build src/SMCA.sln` | `Build succeeded. 192 Warning(s), 0 Error(s)` (sin `error MSB`) |
| `dotnet test src/Application.Tests/…` | **886 passed (886)**, 0 fallos (spot check del padre: 886/886) |
| `dotnet test src/Domain.UnitTests/…` | **154 passed (154)**, 0 fallos |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` (`--max-warnings=0`) | exit 0 |
| `pnpm vitest run app/sales/routes/__tests__/` | **332 passed (332)**, 20 ficheros, sin errores de tipo |
| E2E | **No se tocaron** (`git show --name-only` de los 4 commits: 0 rutas en `SMCA.WebApi.E2ETests/` y `frontend-react/e2e/`) |

Criterios de aceptación 1–7: **pass** (verificación read-only con evidencia `path:line`). Hallazgos de la
verificación independiente: **D1** (nombre de repartidor en la lista siempre nulo — faltaba `.Include(o =>
o.Driver)`) y **D2** (el filtro `to` excluía el día final por el binding a medianoche) — **ambos corregidos**
en `be568bab`, con RED real y tests (886 verdes).

### Follow-ups (no bloqueantes)

- **F5-F1** — Sin cobertura E2E del seam HTTP (403 real, aislamiento por tienda en PostgreSQL). El fix de
  D1 se probó con `InMemory`; el `LEFT JOIN` de Npgsql no queda probado. Requiere E2E nuevo (autorización).
- **F5-F2** — Mensajes de error de los handlers son literales en inglés, no claves `IStringLocalizer`
  (`Resources/` quedó fuera del alcance de las unidades).
- **F5-F3** — El estado de filtros/página es solo estado React; recargar resetea a página 1 sin filtros.
- **F5-F4** — `GetPagedByStoreIdAsync`/`GetByIdWithItemsAsync` sin test contra PostgreSQL (mismo seam que
  F2-R2).

## Siguiente paso

F5 implementado y verificado en `test`. Pendiente: revisión nativa (RDD, sobre de consentimiento emitido) y
decisión de entrega por el owner (presupuesto de ~400 líneas superado → estrategia por aplicar).

## Progreso

- 2026-10-07 — **F5 implementado (T1–T11).** Cuatro commits de unidad de trabajo: `f2dfd14c` (queries +
  extensión aditiva de `IOrderRepository`/`OrderRepository` + DTOs), `8458fb91` (commands estado/pago/
  repartidor + `OnlineOrdersController`), `b674a881` (vista `ordering-orders.tsx`, ruta, menú, i18n,
  cliente API, `EFeatures.OnlineOrders=123`), `be568bab` (fix D1 `.Include(Driver)` + D2 rango de fechas
  inclusivo). Verificación T11: 886+154 tests backend, 332 vitest, typecheck/lint limpios; 2 defectos
  medios hallados y corregidos con RED. E2E intactos. Revisión nativa: `assess` → risk `medium`,
  `review_due` (`slice_budget_reached`, 4375 líneas); preflight STATUS + START emitieron el sobre de
  consentimiento `consent/v3` (pendiente de decisión del owner). Sin push.
- 2026-10-07 — Arranque autorizado por el owner ("F5, ya F7 lo está haciendo otro agente"). Exploración
  read-only completada (patrones de controller/query/command, API de F2, patrones React). Puntos abiertos
  detectados: falta `EFeatures.OnlineOrders = 123` en `@store-mgmt/domain`; no hay tipos espejo de pedido
  online; `IOrderRepository` no tiene filtrado/paginación; sin tipo de página compartido. Sin escrituras aún.
- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: gestión por OwnerAdmin + StoreUser (`OnlineOrdersAdmin`,
  D15); sin "En camino" (D18); vista "Pedidos" confirmada (A6); "Decisiones abiertas" → "Decisiones
  resueltas y notas". Sin implementación.
- 2026-10-07 — **Frontera con F7 resuelta.** Se documenta que F5 es la dueña única de la asignación de
  repartidor (T5 + filtro `driverId`), y que F7 soltó esas tareas por redundantes. No cambia ninguna
  tarea de este documento: T5 y el filtro ya existían aquí. Sin implementación.
