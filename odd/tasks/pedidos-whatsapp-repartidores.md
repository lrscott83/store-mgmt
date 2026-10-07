# Pedidos WhatsApp — repartidores y asignación (F7)

## Objetivo

Añadir la vista **"Repartidores"** del panel con el **CRUD** de `DeliveryDriver` (crear, editar,
activar/desactivar) y la **asignación de pedidos** a repartidores —incluida la lectura de los pedidos
asignados—, a través de los endpoints `/api/v1/delivery-drivers` y de la asignación definida en F5.
La gestionan **OwnerAdmin y StoreUser**.

## Problema

No existe ninguna entidad de repartidor (confirmado en el maestro) ni endpoints para gestionarlos. Sin
ellos, la entrega a domicilio no puede asignarse a una persona y la tienda no puede saber qué
repartidor lleva qué pedido.

## Por qué

- D5 pide una **tabla nueva** de repartidores por tienda con asignación de pedidos.
- Separar la gestión de repartidores (esta vista) de la operación diaria del pedido (F5) mantiene D8 y
  evita mezclar catálogo de personas con ciclo de vida del pedido.
- La asignación necesita validar que el repartidor pertenece a la misma tienda y está activo.
- D15 pide que el **StoreUser** también pueda gestionar repartidores; la feature `OnlineOrdersAdmin`
  (OwnerAdmin + StoreUser) cubre esta vista.

## Alcance

### Autorizado

- Backend: entidad `DeliveryDriver` (definida en F2), repositorio, command/query, y
  `DeliveryDriversController` (`[HasPermission(StoreRoleFeatures.OnlineOrdersAdmin)]`).
- UI React: vista **Repartidores**, ruta y entrada de menú, componentes de lista/formulario, cliente
  API, i18n y tests unitarios nuevos.

### Fuera de alcance

- No se crea seguimiento GPS ni app de repartidor.
- No se implementa el dashboard de pedidos (F5) ni las métricas (F6); esta feature aporta el catálogo
  de repartidores y su asignación.
- No se sincroniza con el POS (D14).
- **Sin estado "En camino"** (D18): el repartidor no introduce un estado nuevo.
- No se altera el catálogo web.

## Dependencias

- F2: entidad `DeliveryDriver`, `IDeliveryDriverRepository`, la FK `Order.DriverId` y la feature
  `OnlineOrdersAdmin`.
- F5: `AssignOrderDriverCommand` (la asignación desde el pedido) consume estos datos.
- Patrón de controlador de gestión: `CatalogController`.

## Decisiones del owner aplicables

| # | Decisión | Cómo aplica a F7 |
| --- | --- | --- |
| D5 | Tabla nueva de repartidores por tienda con asignación | Núcleo de la feature. |
| D8 | Vistas separadas | "Repartidores" es una vista propia. |
| D10 | Panel desde el servidor | CRUD y asignación online. |
| D11 | Estados | `Delivered` marca la entrega; el repartidor no cambia estados salvo lo decidido en F5. |
| D14 | Sin sincronización POS ↔ backend | Repartidores solo del backend. |
| D15 | StoreUser gestiona pedidos/ventas/repartidores | Feature `OnlineOrdersAdmin` (OwnerAdmin + StoreUser). |
| D18 | Sin estado "En camino" | El repartidor no introduce un estado nuevo. |

## Decisiones resueltas y notas

**No quedan decisiones abiertas bloqueantes para F7.** Las antiguas A1/A5/A6 quedaron resueltas así:

- **A1 → D15**: la gestión es de **OwnerAdmin + StoreUser** (`OnlineOrdersAdmin`); la propuesta
  original de "solo `WebCatalogAdmin`" queda descartada.
- **A5 → D18**: **no** hay estado "En camino"; el repartidor no añade un estado nuevo.
- **A6 → confirmado**: la vista se llama **"Repartidores"**; ruta propuesta
  `/sales/online-orders/drivers` → `sales/routes/ordering-drivers.tsx`.

## Diseño técnico

### Entidad `DeliveryDriver` (definida en F2)

`Id`, `StoreId`, `TenantId`, `Name`, `Phone`, `IsActive` (`AuditableEntity<Guid>, ITenantBaseEntity`).

### Backend — endpoints de gestión

| Método | Ruta | Command/Query |
| --- | --- | --- |
| GET | `/api/v1/delivery-drivers` | `GetDeliveryDriversQuery` (`?activeOnly=`) |
| POST | `/api/v1/delivery-drivers` | `CreateDeliveryDriverCommand` |
| PATCH | `/api/v1/delivery-drivers/{id}` | `UpdateDeliveryDriverCommand` (nombre, teléfono, `IsActive`) |

- `DeliveryDriversController` (`[HasPermission(StoreRoleFeatures.OnlineOrdersAdmin)]`).
- Filtrado estricto por tienda; validar que el repartidor pertenece a la tienda actual.
- **La asignación de pedidos** se realiza con `PATCH /api/v1/online-orders/{id}/driver`
  (`AssignOrderDriverCommand`, definido en F5). Esta feature garantiza que el `DriverId` existe, es de
  la tienda y está activo.
- Lectura de "pedidos del repartidor": propuesta de reutilizar `GetOnlineOrdersQuery` (F5) con filtro
  `driverId=` en lugar de un endpoint nuevo.
- Desactivar un repartidor **no** borra sus pedidos históricos (los pedidos mantienen el
  `DriverId`); los pedidos asignados a un inactivo se reasignan manualmente (**propuesta**).

### UI React (propuesta)

- Ruta: `route('sales/online-orders/drivers', 'sales/routes/ordering-drivers.tsx')` (propuesta);
  entrada en `menu-config.ts` gateada por `OnlineOrdersAdmin`.
- `OrderingDriversPage`:
  - Lista de repartidores con nombre, teléfono, estado activo y número de pedidos asignados
    (**propuesta** de contador).
  - Formulario de alta/edición; interruptor de activo.
  - Desde F5 se asigna el repartidor al pedido; aquí solo se gestiona el catálogo.
- Cliente API en `app/sales/lib/ordering/`.

## Tareas

- [ ] **T1** — `GetDeliveryDriversQuery` (filtro `activeOnly`, por tienda).
- [ ] **T2** — `CreateDeliveryDriverCommand` + validator.
- [ ] **T3** — `UpdateDeliveryDriverCommand` (incluye `IsActive`).
- [ ] **T4** — `DeliveryDriversController` con `[HasPermission(OnlineOrdersAdmin)]`.
- [ ] **T5** — Validar en `AssignOrderDriverCommand` (F5) la pertenencia/actividad del repartidor.
- [ ] **T6** — (Propuesta) contador de pedidos por repartidor o filtro `driverId` en
  `GetOnlineOrdersQuery`.
- [ ] **T7** — Vista `ordering-drivers.tsx` (lista + formulario + activo).
- [ ] **T8** — Registrar ruta + menú.
- [ ] **T9** — Claves i18n.
- [ ] **T10** — Tests unitarios nuevos (commands/queries con Moq; componente).
- [ ] **T11** — Verificación (build/tests backend, `typecheck`/`lint`/`vitest`).

## Criterios de aceptación

1. Se pueden crear, editar y activar/desactivar repartidores de la tienda actual.
2. Un repartidor de otra tienda no se puede asignar ni consultar.
3. La asignación desde un pedido exige un repartidor existente y activo de la tienda.
4. Desactivar un repartidor no borra pedidos ni su historial de asignación.
5. Los endpoints exigen `OnlineOrdersAdmin` (OwnerAdmin y StoreUser).
6. No se toca el POS ni el catálogo web; el repartidor no introduce un estado "En camino".

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

- **Aislamiento por tienda**: validar pertenencia del repartidor en cada operación.
- **Repartidor inactivo con pedidos abiertos**: definir reasignación manual (propuesta).
- **Borrado destructivo**: preferir desactivar a borrar (coherente con el resto del sistema).
- **Feature de gestión sin mapeo**: `OnlineOrdersAdmin` debe tener su `[HasFeature]`/`[HasModule]`.

## Siguiente paso

Implementar F7 antes o en paralelo a F5 (F5 necesita el selector de repartidores).

## Progreso

- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: gestión por OwnerAdmin + StoreUser (`OnlineOrdersAdmin`,
  D15); sin "En camino" (D18); vista "Repartidores" confirmada (A6); "Decisiones abiertas" →
  "Decisiones resueltas y notas". Sin implementación.
