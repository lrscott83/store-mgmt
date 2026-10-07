# Pedidos WhatsApp — visión general (módulo Catálogo Web)

## Objetivo

Permitir que un **cliente anónimo** pida desde la carta digital pública (`/catalog/{slug}`) y que el
**pedido completo llegue al WhatsApp del dueño** mediante un enlace `wa.me`. La tienda gestiona los
pedidos (estado, pago y reparto) desde su panel, y el catálogo público se personaliza con **logo,
banner y paleta de colores**. Todo pertenece al **módulo Catálogo Web**, **reutiliza las entidades de
pedido existentes** y **no altera el catálogo web actual**.

Este documento es el **maestro**: fija las decisiones transversales y el mapa de features. Cada
feature tiene su propio fichero en `odd/tasks/`.

## Contexto verificado (lo que ya existe)

- **Catálogo público anónimo**: SPA `catalog/:storeSlug` → `PublicCatalogController`
  (`/api/v1/public/catalog/{storeSlug}`), resuelto por `Store.CatalogSlug`. Publica directo sobre
  `Product`/`ProductCategory`. **No se modifica su comportamiento.**
- **Módulo Catálogo Web**: `StoreRoleFeatures.WebCatalogAdmin` = `[HasRoles(OwnerAdmin)]` +
  `[HasFeature(FeatureType.WebCatalog=122)]` + `[HasModule(ModuleType.WebCatalog=18)]`.
- **Patrón de sincronización del catálogo**: la vista `/sales/web-catalog` edita en el dispositivo y
  el botón *Sincronizar* hace `POST /v1/catalog/sync` → `SyncCatalogCommand`. Es el modelo a copiar.
- **Pedidos existentes = 100% locales del POS**: `OrderOfflineService` arma el `Order` y lo guarda
  cifrado en localStorage por tienda. **No hay ningún endpoint que cree un `Order` en el servidor.**
- **`Order`**: `StoreId`, `OrderItems`, `Payments`, `OrderType`, `Description`, `Total`, `Currency`,
  `SalePaymentMethod`, `Percent`, `Tax`, `ItemsCount`, `Date`, `TenantId`. **`OrderItem`**:
  `ProductId`, `OrderId`, `Name`, `Quantity`, `Price`, `Currency`, `OrderIndex`.
  **`OrderType`** = `Normal=1, Mayorista=2, Merma=3, Otro=100`.
- **`Store`**: `Name`, `Address?`, `Description?`, `CatalogSlug?`, `CatalogSyncedAt?`. **No** tiene
  teléfono/WhatsApp.
- **Paleta actual por defecto**: `frontend-react/packages/web-common/styles.css` bloque `@theme`
  (`--color-primary: rgb(103 58 183)`, secondary, accent, success, danger, etc.).
- **Migración/script (VPS)**: `backend/scripts/README.md` + `README.md` raíz §4. El último script es
  el **28**; el nuevo es el **29**.
- No existe entidad de **repartidor** ni integración WhatsApp/Twilio/SMS.

## Decisiones cerradas por el owner (2026-10-06)

| # | Decisión | Respuesta |
| --- | --- | --- |
| D1 | Alcance | **Backend + UI React**. El catálogo web actual no se altera. |
| D2 | Pedido → WhatsApp | **Enlace `wa.me` del cliente.** Sin API de WhatsApp. |
| D3 | Pago | **Manual, se cobra en la entrega o en la recogida.** |
| D4 | Cliente | **Anónimo**: nombre + teléfono + dirección (solo si es a domicilio). |
| D5 | Repartidores | **Tabla nueva** por tienda, con asignación de pedidos. |
| D6 | Entidades de pedido | **Reutilizar `Order`/`OrderItem`** y **extenderlas**. `OrderItem` = snapshot. **Sin método/tipo de pago.** |
| D7 | Config | **Tabla nueva por tienda** (una sola; ver D19). |
| D8 | Vistas | **Separadas por página**: "Pedidos WhatsApp" (config), Pedidos, Ventas, Repartidores. |
| D9 | QR | **Sin QR.** |
| D10 | Panel de pedidos | **Desde el servidor (online).** |
| D11 | Estados | **Nuevo → Aceptado → En preparación → Listo → Entregado** (+ **Cancelado**). |
| D12 | Pago | Estado simple: **Pendiente / Pagado**. |
| D13 | Carrito | Storefront separado del `useCartStore` del POS (clave propia, no `lizoft-cart`). |
| D14 | POS ↔ backend | **Sin sincronización**; la tabla `Order` del backend es solo de pedidos online. |
| D15 | Permisos | **StoreUser** gestiona pedidos, ventas y repartidores. **OwnerAdmin** configura (marca + config de pedidos). |
| D16 | Horarios/zonas | **Texto simple** configurable. |
| D17 | `OrderType` | **Añadir `WhatsApp=101`.** |
| D18 | Estado "En camino" | **No** en v1. |
| D19 | Marca y config | Logo, banner y **paleta predefinida** se guardan en **la misma tabla por tienda** que la config de pedidos; se configuran en la **vista actual Catálogo Web** (`/sales/web-catalog`). Paleta por defecto: **la actual**. |
| — | Precios/moneda | **Fuera de alcance**: los precios y la moneda vienen del catálogo. |

## Restricciones (no negociables)

- **No alterar el comportamiento del catálogo web existente** (queries públicas, `SyncCatalogCommand`,
  campos de catálogo e imágenes) ni su UI. Lo nuevo se construye al lado, colgado del mismo módulo.
- **Todo cuelga del módulo Catálogo Web**: no se crea un módulo nuevo. El pedido por WhatsApp viene
  **desactivado por defecto** y se habilita en la vista de configuración.
- **Angular es legacy**: `frontend/` no se lee, no se cita, no se compara.
- **E2E intocable**: no se modifican tests E2E ni sus support files.
- **Migración/script**: la migración EF es la fuente; el `.sql` se **genera** con
  `dotnet ef migrations script` y se guarda en `backend/scripts/NN-...sql` (ver sección dedicada).
- El POS no escribe ni lee pedidos online; el backend no recibe ventas del POS.

## Arquitectura transversal

### Flujo end-to-end

1. El cliente abre la carta pública (`/catalog/{slug}`), con el **logo, banner y paleta** de la tienda.
2. Arma el **carrito** (storefront, estado en el cliente, clave propia — D13).
3. Rellena **nombre, teléfono** y, si es a domicilio, **dirección**; notas opcionales (D4).
4. Al confirmar, hace `POST` → el backend **crea el `Order`** (server-side) con sus `OrderItem`
   (snapshot) y devuelve un **código de pedido**.
5. El cliente abre **`wa.me/<whatsappTienda>?text=<resumen + código>`** (D2).
6. La tienda ve el pedido en el **panel** (servidor — D10), cambia estado (D11), marca pago (D12) y
   asigna repartidor (D5). Lo gestiona **OwnerAdmin o StoreUser** (D15).
7. El pedido queda en **Ventas**.

> Si la tienda no ha habilitado y sincronizado la config, el pedido online no está disponible.

### Aislamiento POS ↔ backend (D14)

- **POS → backend**: las ventas del POS siguen solo en el dispositivo (localStorage cifrado).
- **Backend → POS**: los pedidos online viven solo en el servidor.
- La tabla `Order` del backend pasa a contener **exclusivamente pedidos online**.
- El carrito del storefront es un store propio; **no** usa `useCartStore` ni `lizoft-cart`.

### Permisos (D15)

- **Configuración y marca** (vista Catálogo Web actual y vista "Pedidos WhatsApp"): `WebCatalogAdmin`
  (OwnerAdmin).
- **Gestión de pedidos/ventas/repartidores**: una feature nueva del módulo Catálogo Web que incluya
  **OwnerAdmin + StoreUser** (nombre propuesto: `OnlineOrdersAdmin`).

## Modelo de datos

### Extensión de `Order` / `OrderItem` (D6)

Campos nuevos en **`Order`** (nullable):

- `Code` (string): código público corto, único por tienda.
- `DeliveryType` (`OrderDeliveryType`): `Pickup=0`, `Delivery=1`.
- `Status` (`OrderStatus`): ver *Estados*.
- `PaymentStatus` (`OrderPaymentStatus`): `Pending=0`, `Paid=1`.
- `CustomerName`, `CustomerPhone`.
- `DeliveryAddress?` (solo domicilio), `Notes?`.
- `DriverId?` (FK a `DeliveryDriver`).

**`OrderItem`** ya guarda el snapshot; se conserva. **No** se añade método/tipo de pago.
`OrderType` suma `WhatsApp=101` (D17). **`OrderPayment` no se usa** para pedidos online.

### `StoreCatalogSettings` (nueva, una por tienda — D7/D19)

> Nombre propuesto; debe reflejar que es la config por tienda del catálogo/tienda online.

- **Pedidos (F1)**: `Enabled`, `WhatsappNumber`, `PickupEnabled`, `DeliveryEnabled`, `DeliveryFee`,
  `MinimumOrderAmount`, `BusinessHours` (texto, D16), `DeliveryZones` (texto, D16).
- **Marca (F8)**: `LogoKey?`, `BannerKey?`, `PaletteId` (paleta predefinida; por defecto, la actual).
- **Comunes**: `StoreId` (único), `TenantId`, `SyncedAt`.

### `DeliveryDriver` (nueva, por tienda — D5)

`Id`, `StoreId`, `TenantId`, `Name`, `Phone`, `IsActive`.

## Estados (D11/D12/D18)

- **Pedido** (`OrderStatus`): `New → Accepted → Preparing → Ready → Delivered`; `Cancelled` lateral.
  **Sin** estado "En camino".
- **Pago** (`OrderPaymentStatus`): `Pending → Paid`, marcado a mano al entregar/recoger.

## Endpoints propuestos

Públicos (anónimos, por slug):

- `GET  /api/v1/public/ordering/{storeSlug}/config` (habilitado, tipos de entrega, envío, mínimo,
  horarios, paleta, logo/banner, WhatsApp público si aplica).
- `POST /api/v1/public/ordering/{storeSlug}/orders` (crea el `Order`; total en servidor).
- `GET  /api/v1/public/ordering/{storeSlug}/orders/{code}` (consulta por **código + teléfono**).

De gestión (JWT + permiso):

- `GET/PUT /api/v1/online-ordering/settings` (config + marca; destino del botón *Sincronizar*).
- `GET   /api/v1/online-orders`, `PATCH .../{id}/status|payment|driver`.
- `GET   /api/v1/online-orders/stats`.
- `GET/POST/PATCH /api/v1/delivery-drivers`.

## Migración y script para el VPS (obligatorio)

Una sola migración EF incluye **todos** los cambios (columnas de `Order`, tablas
`StoreCatalogSettings` y `DeliveryDriver`, `OrderType.WhatsApp`). Luego se **genera** el script.

1. `dotnet ef migrations add Add-StoreCatalogSettings-Drivers-OrderFields --project src/Infrastructure --startup-project src/SMCA.WebApi`
2. Aplicar contra `smca` (dev) y `smca_test`.
3. Generar el script **desde la migración** (regla AGENTS.md: solo migración nueva → `-From` la
   **previa** y **sin** `-To`):
   `dotnet ef migrations script <PreviousMigration> --project src/Infrastructure --startup-project src/SMCA.WebApi -o scripts/29-<nombre>.sql`
4. Patch del script generado: `ON CONFLICT ("MigrationId") DO NOTHING;` + header (nombre, migración EF,
   fecha) + `SELECT`s de verificación. **Nunca** escribir el `.sql` a mano.
5. Añadir la fila del nuevo script a la tabla de `backend/scripts/README.md`.
6. **VPS** (ver `README.md` raíz §4): backup **antes**, luego
   `podman exec -i smca_postgres_db psql -U postgres -d smca < backend/scripts/29-<nombre>.sql`.

## Vistas (UI React — D8/D15/D19)

- **Pública**: carrito + checkout + consulta de estado dentro de `/catalog/{slug}`, con logo, banner y
  paleta de la tienda; sin romper el catálogo actual.
- **Catálogo Web actual** (`/sales/web-catalog`, OwnerAdmin): se le añade **logo, banner y paleta**.
- **Pedidos WhatsApp** (OwnerAdmin): config de pedidos (interruptor + config) con botón **Sincronizar**.
- **Pedidos / Ventas / Repartidores** (OwnerAdmin + StoreUser): gestión contra el servidor.

## Propuestas menores (no bloqueantes, ajustables)

- Nombres exactos de las 4 vistas del panel y sus rutas.
- Lista de paletas predefinidas y sus ids.
- Nombre final de la tabla de configuración (`StoreCatalogSettings`) y de la feature de gestión.

## Riesgos

- **Creación anónima**: validación y límite de tasa.
- **Aislamiento por slug**: filtrado estricto por tienda.
- **Total manipulado**: se recalcula en servidor.
- **Config sin sincronizar**: el pedido online queda no disponible.
- **Extender `Order`**: campos nullable; toca producción (aprobado por el owner al pedir añadir campos).
- **Migración/script**: nunca escribir el `.sql` a mano; verificar el `Up` ejecutándolo de verdad.

## Orden de implementación

F2 (base de datos/estados) → F1 (config) → F8 (marca) → F3 (carrito) → F4 (WhatsApp) → F5 (dashboard)
→ F7 (repartidores) → F6 (ventas). La migración+script de F2 cubre las tablas de F8.

## Mapa de features

| # | Feature | Fichero |
| --- | --- | --- |
| F1 | Configuración "Pedidos WhatsApp" + sincronización | `odd/tasks/pedidos-whatsapp-config.md` |
| F2 | Persistencia, `Order` extendida, estados, tablas y **migración+script** | `odd/tasks/pedidos-whatsapp-persistencia.md` |
| F3 | Carrito y pedido del cliente | `odd/tasks/pedidos-whatsapp-carrito-cliente.md` |
| F4 | Envío del pedido por WhatsApp | `odd/tasks/pedidos-whatsapp-envio.md` |
| F5 | Dashboard de pedidos y pago | `odd/tasks/pedidos-whatsapp-dashboard.md` |
| F6 | Ventas / historial | `odd/tasks/pedidos-whatsapp-ventas.md` |
| F7 | Repartidores y asignación | `odd/tasks/pedidos-whatsapp-repartidores.md` |
| F8 | Marca del catálogo (logo, banner, paleta) | `odd/tasks/pedidos-whatsapp-marca-catalogo.md` |

## Siguiente paso

Implementar F2 (incluye la migración y el script 29) y luego F1/F8.

## Progreso

- 2026-10-06 — Primer borrador (entidades nuevas / módulo nuevo / QR) **corregido por el owner**.
  Segunda ronda de decisiones: reutilizar `Order`/`OrderItem`, módulo Catálogo Web, config en tabla
  nueva, vistas separadas, sin QR. Tercera ronda: **marca (logo/banner/paleta)** en la vista Catálogo
  Web con paletas predefinidas, **StoreUser** para gestión, horarios/zonas en texto, `WhatsApp=101`,
  sin "En camino", precios/moneda fuera de alcance. **Migración + script 29** documentados según el
  README. Decisiones D1–D19 cerradas. Sin implementación.
