# Pedidos WhatsApp — repartidores y asignación (F7)

## Objetivo

Añadir la vista **"Repartidores"** del panel con el **CRUD** de `DeliveryDriver` (crear, editar,
activar/desactivar) a través de los endpoints `/api/v1/delivery-drivers`. Es un **catálogo de
personas**: no toca el ciclo de vida del pedido.

La **asignación** de un repartidor a un pedido **no pertenece a esta feature** — vive en F5, junto al
resto de la operación del pedido (estado y pago). F5 ya la define en su `AssignOrderDriverCommand` y ya
filtra `GetOnlineOrdersQuery` por `driverId`. Ver *Frontera con F5*.

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
  `OnlineOrdersAdmin`. **Es la única dependencia dura:** sin ella no compila nada de esta feature.
- Patrón de controlador de gestión: `CatalogController`.

**F7 no depende de F5.** La relación va en el otro sentido: F5 *consume* los datos que aquí se crean
para poblar su selector de reparto. F7 no importa ni modifica ningún archivo de F5.

**F7 no depende de F3 ni de F4.**

## Frontera con F5 (resuelta 2026-10-07)

Las antiguas tareas T5 y T6 de este documento se **eliminaron por redundantes**: F5 ya las cubre.

| Antigua tarea de F7 | Dónde vive de verdad |
| --- | --- |
| Validar que el `DriverId` es de la tienda y está activo | **F5 T5** — `AssignOrderDriverCommand` |
| Contador de pedidos / filtro `driverId` | **F5** — `GetOnlineOrdersQuery` ya lista `driverId` entre sus filtros |

El criterio de aceptación "no se puede asignar un repartidor ajeno" también vive en F5 (su criterio 5).

El motivo no es solo evitar el archivo inexistente: **D8 separa las vistas por responsabilidad.** F7 es
el catálogo de personas; F5 es la operación del pedido. Asignar un repartidor es un acto sobre un
pedido, no sobre un repartidor — por eso su validación pertenece a F5.

**Consecuencia asumida:** si la vista Repartidores quiere mostrar cuántos pedidos lleva cada uno, eso
ya no sale gratis de esta feature: necesita consumir el endpoint de F5 o uno propio.

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
- **La asignación de un pedido a un repartidor NO se implementa aquí.** Vive en
  `PATCH /api/v1/online-orders/{id}/driver` (`AssignOrderDriverCommand`, F5), que es quien valida que el
  `DriverId` existe, es de la tienda y está activo (F5 T5). Ver *Frontera con F5*.
- La lectura de "pedidos del repartidor" tampoco se implementa aquí: `GetOnlineOrdersQuery` (F5) ya
  acepta el filtro `driverId=`.
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
- [ ] **T5** — Vista `ordering-drivers.tsx` (lista + formulario + activo).
- [ ] **T6** — Registrar ruta + menú.
- [ ] **T7** — Claves i18n.
- [ ] **T8** — Tests unitarios nuevos (commands/queries con Moq; componente).
- [ ] **T9** — Verificación (build/tests backend, `typecheck`/`lint`/`vitest`).

## Criterios de aceptación

1. Se pueden crear, editar y activar/desactivar repartidores de la tienda actual.
2. Un repartidor de otra tienda no se puede consultar ni modificar.
3. Desactivar un repartidor no borra pedidos ni su historial de asignación.
4. Los endpoints exigen `OnlineOrdersAdmin` (OwnerAdmin y StoreUser).
5. No se toca el POS ni el catálogo web; el repartidor no introduce un estado "En camino".

> La validación de **la asignación** ("no se puede asignar un repartidor ajeno o inactivo") **no se
> verifica aquí**: vive en F5, criterio 5. Este documento ya no incluye ninguna tarea de asignación.

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

Requiere **F2** (bloqueante dura). Una vez F2 está aplicado, F7 puede implementarse **antes o en
paralelo a F5** (F5 necesita el selector de repartidores), y **F7 no necesita F3 ni F4**.

## Progreso

- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: gestión por OwnerAdmin + StoreUser (`OnlineOrdersAdmin`,
  D15); sin "En camino" (D18); vista "Repartidores" confirmada (A6); "Decisiones abiertas" →
  "Decisiones resueltas y notas". Sin implementación.
- 2026-10-07 — **Frontera con F5 resuelta.** Se eliminaron T5 y T6 (validación de la asignación y filtro
  `driverId`) por **redundantes**: F5 ya las cubre en su T5 y en los filtros de `GetOnlineOrdersQuery`.
  Se quitó el criterio de aceptación de asignación (vive en F5, criterio 5). F7 queda en 9 tareas
  autocontenidas y **sin dependencia de F5**. Motivo de fondo: D8 separa el catálogo de personas (F7)
  de la operación del pedido (F5). Sin implementación.
