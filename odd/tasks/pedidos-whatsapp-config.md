# Pedidos WhatsApp — configuración (F1)

## Objetivo

Añadir la vista **"Pedidos WhatsApp"** de configuración dentro del módulo Catálogo Web
(`ModuleType.WebCatalog = 18`): un **interruptor** para habilitar/deshabilitar el pedido online
(desactivado por defecto) y, al habilitarlo, **todas las configuraciones de pedidos** de la tienda
(número de WhatsApp, tipos de entrega, envío, mínimo, horarios y zonas de reparto). La vista se
guarda en el servidor con un botón **Sincronizar**, gemelo del *Sincronizar Catálogo*
(`POST /v1/catalog/sync`), y publica la config al catálogo público mediante
`GET /api/v1/public/ordering/{storeSlug}/config`. **La moneda no se configura aquí**: los precios y
la moneda vienen del catálogo.

## Problema

Hoy el catálogo web publica productos, pero **no existe ninguna manera de configurar el pedido
online**: no hay entidad de configuración, ni interruptor de habilitación, ni endpoint público que
diga si la tienda acepta pedidos, qué tipos de entrega ofrece o a qué WhatsApp se envían. Sin esta
pieza, el resto de features (carrito, pedido, envío) no tienen origen de configuración ni puerta de
entrada.

## Por qué

Separar la configuración de pedidos en su propia vista y su propia fila por tienda
(`StoreCatalogSettings`) permite:

- Mantener el pedido **desactivado por defecto** (restricción de negocio) sin tocar el catálogo.
- Reusar el patrón ya validado del catálogo (`Sincronizar Catálogo` → command + endpoint de gestión)
  para que la UI y el flujo de guardado sean reconocibles.
- Entregar al storefront una lectura pública acotada (`Enabled`, tipos de entrega, envío, mínimo,
  horarios) sin exponer datos sensibles de la tienda.

## Alcance

### Autorizado

- Backend (módulo Catálogo Web, sin crear módulo nuevo):
  - Entidad `StoreCatalogSettings` (nueva, por tienda; la define F2).
  - `GetStoreCatalogSettingsQuery` y `UpsertStoreCatalogSettingsCommand` (destino del botón
    Sincronizar).
  - `GetPublicOrderingConfigQuery`.
  - Endpoints de gestión `GET/PUT /api/v1/online-ordering/settings` y público
    `GET /api/v1/public/ordering/{storeSlug}/config`.
- UI React (`frontend-react/`):
  - Vista `sales/routes/` para **Pedidos WhatsApp** (interruptor + configuraciones + botón
    Sincronizar).
  - Entrada en `app/routes.ts` y en `shared/lib/config/menu-config.ts`.
  - Claves i18n en `shared/lib/i18n/es.ts`.
  - Tests unitarios nuevos en `__tests__/`.

### Fuera de alcance

- **No se altera** el catálogo web existente (queries públicas, `SyncCatalogCommand`, campos de
  catálogo e imágenes) ni su UI.
- **Marca del catálogo** (logo, banner, paleta): se configura en la **vista actual Catálogo Web** y
  es F8; aquí solo se definen/leen sus columnas en la tabla compartida.
- No se implementa la creación de pedidos, el carrito, el envío a WhatsApp, el dashboard, las ventas
  ni los repartidores (features F2–F7).
- No se crea módulo nuevo: todo cuelga de `ModuleType.WebCatalog = 18`. La feature de **gestión**
  (pedidos/ventas/repartidores) se crea en F2 (`OnlineOrdersAdmin`); esta vista de **configuración**
  es `WebCatalogAdmin` (OwnerAdmin).
- Sin moneda configurable: los precios/moneda vienen del catálogo.
- Sin QR (D9).

## Dependencias

- F2 (persistencia) define la tabla `StoreCatalogSettings` como entidad EF y la migración + script
  29; F1 describe su contrato de lectura/escritura de pedidos.
- F8 (marca) comparte la misma tabla y añade las columnas `LogoKey?`/`BannerKey?`/`PaletteId`.
- Patrón de referencia: `CatalogController`
  (`backend/src/SMCA.WebApi/Controllers/v1/CatalogController.cs`) y `SyncCatalogCommand`
  (`Application/Features/WebCatalog/Sync/Commands/SyncCatalog/`).
- Patrón público: `PublicCatalogController` (`[AllowAnonymous]`, rutas `~/api/v1/public/...`) y
  `IStoreRepository.GetStoreByCatalogSlugAsync`.
- Entrada de menú y rutas: `frontend-react/apps/web-store-pos/app/routes.ts`,
  `shared/lib/config/menu-config.ts`.

## Decisiones del owner aplicables

| # | Decisión | Cómo aplica a F1 |
| --- | --- | --- |
| D1 | Backend + UI React; no se altera el catálogo web | La config se construye al lado, colgada del módulo 18. |
| D7 | Config en tabla nueva por tienda | `StoreCatalogSettings` (una sola tabla; ver D19). |
| D8 | Vistas separadas por página | "Pedidos WhatsApp" es una vista propia. |
| D9 | Sin QR | No se contempla. |
| D2/D3 | Enlace `wa.me`; pago en entrega/recogida | La config guarda el número de WhatsApp; no hay pasarela. |
| D11/D12 | Estados y pago | La config no gestiona estados; los habilita. |
| D15 | StoreUser gestiona pedidos/ventas/repartidores; OwnerAdmin configura | Esta vista de config es `WebCatalogAdmin` (OwnerAdmin). |
| D16 | Horarios/zonas = texto simple | `BusinessHours` y `DeliveryZones` son texto. |
| D19 | Marca y config comparten tabla; la marca se configura en Catálogo Web | F1 escribe solo la config de pedidos; no pisa la marca. |
| — | Precios/moneda | **Fuera de alcance**: los precios y la moneda vienen del catálogo. |

## Decisiones resueltas y notas

**No quedan decisiones abiertas bloqueantes para F1.** Las antiguas A1/A2/A3/A6 quedaron resueltas
así:

- **A1 → D15**: la gestión de pedidos/ventas/repartidores es de **StoreUser + OwnerAdmin** (feature
  nueva `OnlineOrdersAdmin`, definida en F2). Esta vista de **configuración de pedidos** sigue siendo
  de **OwnerAdmin** (`WebCatalogAdmin`), igual que la marca.
- **A2 → D16**: horarios y zonas de reparto se guardan como **texto simple**.
- **A3 → ELIMINADA**: no existe moneda propia de pedidos online. Se elimina
  `StoreCatalogSettings.Currency`; los precios y la moneda **vienen del catálogo**.
- **A6 → confirmado**: los nombres de las vistas son "Pedidos WhatsApp" (config), "Pedidos",
  "Ventas" y "Repartidores".

## Diseño técnico

### Backend

**Entidad `StoreCatalogSettings`** (nueva, por tienda — D7/D19; la crea F2):

- `StoreId` (Guid, único), `TenantId` (Guid), `Enabled` (bool, default `false`),
  `WhatsappNumber` (string?), `PickupEnabled` (bool), `DeliveryEnabled` (bool),
  `DeliveryFee` (decimal), `MinimumOrderAmount` (decimal), `BusinessHours` (string?, D16),
  `DeliveryZones` (string?, D16), `SyncedAt` (DateTime?).
- **Sin** `Currency` (A3 eliminada). La moneda del pedido sale del catálogo/producto.

> La entidad completa (incluidas las columnas de marca `LogoKey?`, `BannerKey?`, `PaletteId` de F8)
> y su migración se detallan en F2. Aquí solo se fija su contrato de pedidos.

**Query de gestión** (auth): `GetStoreCatalogSettingsQuery` → `StoreCatalogSettingsDto`
(`Enabled`, `WhatsappNumber`, `PickupEnabled`, `DeliveryEnabled`, `DeliveryFee`,
`MinimumOrderAmount`, `BusinessHours`, `DeliveryZones`, `SyncedAt`). Devuelve la fila de la tienda
actual; si no existe, valores por defecto con `Enabled = false`.

**Command de gestión** (auth, destino del botón Sincronizar):
`UpsertStoreCatalogSettingsCommand` (upsert por `StoreId`, fija `SyncedAt` con
`IDateTimeProvider`). **Solo escribe las columnas de pedidos**; **no** toca `LogoKey`/`BannerKey`/
`PaletteId` (las escribe F8). Validaciones propuestas (pendientes de confirmar): si `Enabled` y
`PickupEnabled == false` y `DeliveryEnabled == false` → error; si `DeliveryEnabled` y
`WhatsappNumber` vacío → error; `DeliveryFee`/`MinimumOrderAmount` ≥ 0.

**Query pública** (anónima): `GetPublicOrderingConfigQuery(string StoreSlug)` →
`PublicOrderingConfigDto` (`Enabled`, `PickupEnabled`, `DeliveryEnabled`, `DeliveryFee`,
`MinimumOrderAmount`, `BusinessHours`, `DeliveryZones`, y los campos de marca `LogoUrl?`,
`BannerUrl?`, `PaletteId` — ver F8). Resuelve la tienda con
`IStoreRepository.GetStoreByCatalogSlugAsync` (404 uniforme si no hay catálogo, igual que
`GetPublicCatalogQuery`). **No expone** `WhatsappNumber` en el payload público salvo que se confirme
lo contrario (propuesta: el enlace `wa.me` se arma con el número que devuelva el endpoint de pedido
o este config; **pendiente de confirmar**; ver F4).

**Endpoints propuestos:**

| Método | Ruta | Controlador propuesto | Permiso |
| --- | --- | --- | --- |
| GET | `/api/v1/online-ordering/settings` | `StoreCatalogSettingsController` | `HasPermission(StoreRoleFeatures.WebCatalogAdmin)` |
| PUT | `/api/v1/online-ordering/settings` | `StoreCatalogSettingsController` | `HasPermission(WebCatalogAdmin)` |
| GET | `/api/v1/public/ordering/{storeSlug}/config` | `PublicOrderingController` (`[AllowAnonymous]`) | anónimo |

### UI React (propuesta)

- Ruta: `route('sales/online-orders/settings', 'sales/routes/ordering-settings.tsx')` en
  `app/routes.ts` (ruta y nombre **propuesta**). Entrada en `menu-config.ts` con
  `path: '/sales/online-orders/settings'`, gateada por el módulo Catálogo Web.
- Componente `OrderingSettingsPage`:
  - Interruptor `enabled` con `data-testid="ordering-enabled"`.
  - Panel de configuraciones visible **solo** cuando `enabled` es true.
  - Campos: `whatsappNumber`, `pickupEnabled`, `deliveryEnabled`, `deliveryFee`,
    `minimumOrderAmount`, `businessHours` (texto, D16), `deliveryZones` (texto, D16).
    **Sin** selector de moneda (A3 eliminada).
  - Botón **Sincronizar** con `data-testid="ordering-sync"` → `PUT /v1/online-ordering/settings`;
    muestra `SyncedAt` y estado de éxito/error, igual que la vista de catálogo.
- Cliente API en `app/catalog/lib/` o `app/sales/lib/ordering/` (**propuesta**), reutilizando el
  cliente HTTP existente.

## Tareas

- [x] **T1** — Definir el contrato de `StoreCatalogSettings` (columnas de pedidos) y su mapeo a
  `StoreCatalogSettingsDto`.
- [x] **T2** — `GetStoreCatalogSettingsQuery` (auth, por tienda actual; defaults si no existe).
- [x] **T3** — `UpsertStoreCatalogSettingsCommand` + validator (upsert, `SyncedAt`, sin pisar marca)
  — destino del botón Sincronizar.
- [x] **T4** — `GetPublicOrderingConfigQuery` (anónima, por slug, 404 uniforme).
- [x] **T5** — Controlador de gestión `OnlineOrderingController`
  (`[HasPermission(WebCatalogAdmin)]`, rutas `~/api/v1/online-ordering/settings`) y
  `PublicOrderingController` (`[AllowAnonymous]`, `~/api/v1/public/ordering/{storeSlug}/config`).
- [x] **T6** — Vista `ordering-settings.tsx` (interruptor + panel condicional + botón Sincronizar).
- [x] **T7** — Registrar ruta y entrada de menú (`routes.ts`, `menu-config.ts`).
- [x] **T8** — Claves i18n nuevas en `es.ts`.
- [x] **T9** — Tests unitarios nuevos (query/command con Moq; componente con Testing Library).
- [x] **T10** — Verificación (build backend, tests, `typecheck`/`lint`/`vitest`).

## Criterios de aceptación

1. Existe la vista "Pedidos WhatsApp" y muestra el interruptor con el pedido **desactivado por
   defecto**.
2. Con el interruptor apagado, las configuraciones no se muestran y el storefront no ofrece pedido
   online.
3. Al activar y pulsar **Sincronizar**, el `PUT` persiste la config de pedidos en el servidor y se
   refleja en `SyncedAt`, **sin** borrar los campos de marca.
4. `GET /api/v1/public/ordering/{storeSlug}/config` devuelve `Enabled=false` para una tienda sin
   configurar y `404` para un slug inexistente.
5. Los endpoints de gestión exigen `WebCatalogAdmin` (401/403 sin permiso).
6. La config no modifica ni el catálogo ni su UI existente.

## Comandos de verificación

```bash
# Backend
dotnet build backend/src/SMCA.sln
dotnet test backend/src/Application.Tests/Application.Tests.csproj

# Frontend React
cd frontend-react/apps/web-store-pos
pnpm typecheck
pnpm lint
pnpm vitest run app/sales/routes/__tests__/
```

## Riesgos

- **Endpoints públicos anónimos**: la query pública filtra estrictamente por slug y no expone datos
  internos de la tienda.
- **Exposición del número de WhatsApp**: decidir (ver F4) si viaja en el config público o solo en la
  creación del pedido; por defecto **no** en el config público.
- **Config sin sincronizar**: mientras no se sincronice, el pedido online queda no disponible
  (coherente con el maestro).
- **Tabla compartida con la marca**: los commands de pedidos y de marca deben escribir solo sus
  columnas para no pisarse entre vistas.

## Decisiones resueltas durante la implementación (2026-10-07)

| # | Punto | Decisión | Motivo |
| --- | --- | --- | --- |
| I1 | `WhatsappNumber` requerido | **Cuando `Enabled`, siempre** (recogida o envío) | Todo pedido sale por `wa.me`; el plan lo ataba solo a `DeliveryEnabled`. Decidido por el owner. |
| I2 | Lectura pública de `StoreCatalogSettings` | Método nuevo `GetPublicByStoreIdAsync` con `IgnoreQueryFilters()` | El filtro global por tenant anula silenciosamente las lecturas anónimas (`Enabled=false`). `GetByStoreIdAsync` intacto (F2 lo usa con tenant). |
| I3 | Ruta del controlador de gestión | Rutas absolutas `~/api/v1/online-ordering/settings` | `BaseApiController` fija `api/v1/[controller]`; un `[Route]` de clase se combina y expondría `api/v1/OnlineOrdering/...` de más. |
| I4 | `LogoUrl`/`BannerUrl` en el config público | **No** se exponen todavía | No hay writer ni servido de marca (F8); `BelongsToStore` exige `productId`. Se expone `PaletteId` (default). F8 los añadirá. |
| I5 | `WhatsappNumber` en config público | **No** se expone | Plan (riesgo); F4 decide si viaja en la creación del pedido. |

## Evidencia de verificación (2026-10-07)

| Comando | Resultado |
| --- | --- |
| `dotnet build src/SMCA.sln` | Build succeeded, 0 errores |
| `dotnet test src/Application.Tests/…` | **701 passed**, 0 fallos (115 de OnlineOrdering) |
| `dotnet test src/Domain.UnitTests/…` | 154 passed |
| `turbo run typecheck --force --filter=@store-mgmt/web-store-pos` | 5 successful, 0 errores |
| `turbo run lint --force --filter=@store-mgmt/web-store-pos` | 4 successful |
| `vitest run …/ordering-settings.test.tsx` | 13 passed (regresión: 1721 passed) |
| E2E | No se corrió (excluido por el owner) |

## Hallazgos de la revisión nativa (RDD) — TODOs rastreados (2026-10-07)

Advisory, no bloqueantes:

- [ ] **F1-R1** (WARNING) — Endpoints sin test de ruta/permiso (`[AllowAnonymous]` y `[HasPermission]`). Destino: F1 (tests).
- [ ] **F1-R2** (WARNING · backend) — `PaletteId` almacenado vacío/whitespace no cubierto (fallback distinto del null). Destino: F1.
- [ ] **F1-R3** (WARNING · backend) — `MaximumLength` sobre el valor crudo pero se persiste `Trim()`; padding podría rechazarse aunque quepa. Destino: F1.
- [ ] **F1-R4** (WARNING · backend) — `StoreId`/`TenantId` no-Guid (claim corrupto) sin resultado asertado. Destino: F1.
- [ ] **F1-R5** (WARNING · frontend) — Coerción monetaria sin test (vacío/no numérico → 0; negativos pasan). Destino: F1.
- [ ] **F1-R6** (WARNING · frontend) — Tras guardar OK, fallar el reload muestra toast de éxito + error fatal contradictorio y oculta los valores. Destino: F1.
- [ ] **F1-R7** (WARNING · frontend) — Rama de error lanzado en la carga inicial sin test. Destino: F1.
- [ ] **F1-R8/R9** (SUGGESTION · frontend) — `formatSyncedAt` sin test; selectores por testid en vez de role/label. Destino: F1.

## Siguiente paso

F8 (marca: logo/banner/paleta en la vista Catálogo Web; añadirá `LogoUrl`/`BannerUrl` al config
público), luego F3 (carrito/checkout, que fija el contrato de `CreateOnlineOrderCommand` y trae T10).

## Progreso

- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: `OnlineOrderingSettings` → `StoreCatalogSettings`;
  eliminada la moneda configurable (A3); permisos D15; horarios/zonas texto (D16); sin decisiones
  abiertas bloqueantes. Sin implementación.
- 2026-10-07 — **Implementado en 2 slices** (rama `feat/pedidos-whatsapp-f1-config`): `1019d119`
  (backend: query/command/public + controllers + tests) y `e5844dd4` (frontend: vista/ruta/menú/i18n/
  cliente + tests). Ambos **revisados por la revisión nativa (lens reliability), aprobados y
  acknowledgeados**. Owner resolvió I1. La revisión del backend falló 4× por **DNS del proveedor
  `opencode-go` → `opencode.ai`** (`getaddrinfo ENOTFOUND` en el log de OpenCode), no por el código;
  al reintentar con la conectividad de vuelta, aprobó. Ver evidencia y TODOs arriba. Push/PR =
  decisión del owner.
