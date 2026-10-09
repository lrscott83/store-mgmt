# Pedidos WhatsApp — carrito y pedido del cliente (F3)

## Objetivo

Dar al **cliente anónimo** un **carrito propio del storefront** (separado del carrito del POS), un
**checkout anónimo** (nombre + teléfono + dirección solo si es a domicilio + notas opcionales) y la
creación del pedido contra el servidor mediante
`POST /api/v1/public/ordering/{storeSlug}/orders`, que **calcula el total en servidor** y guarda el
**snapshot** de cada línea en `OrderItem`. Incluye la consulta pública por **código + teléfono**.

## Problema

El catálogo público (`/catalog/{storeSlug}`) muestra productos pero **no tiene carrito ni checkout**.
El único carrito existente es `useCartStore` del POS (persistido en la clave `lizoft-cart`), que
pertenece a la operación interna de la tienda y **no debe reutilizarse** ni compartir estado con el
cliente. Además **no existe endpoint** que cree un pedido online.

## Por qué

- Un **store separado** (D13) aísla el carrito del cliente del carrito del vendedor: sin él, los
  productos del cliente podrían aparecer en la venta del POS y viceversa.
- Calcular el total en servidor elimina la manipulación del precio por parte del cliente y garantiza
  el snapshot correcto.
- La consulta por código + teléfono da al cliente una vía de autoservicio sin cuenta ni login.

## Alcance

### Autorizado

- UI React (`frontend-react/`), dentro del catálogo público (sin romper el catálogo actual):
  - Store de carrito propio del storefront.
  - Componentes de carrito, checkout y estado del pedido.
  - Cliente API de pedidos públicos.
  - Tests unitarios nuevos.
- Backend:
  - `CreateOnlineOrderCommand` (definido en F2) expuesto por
    `PublicOrderingController` (`[AllowAnonymous]`).
  - `GetPublicOrderStatusQuery` (`code` + `phone`).
- Claves i18n nuevas.

### Fuera de alcance

- No se modifica el catálogo web existente ni su UI.
- No se reutiliza `useCartStore` ni la clave `lizoft-cart`.
- **Sin moneda propia**: precios y moneda vienen del catálogo/producto (A3 eliminada).
- No se crea cuenta de cliente; el cliente es **anónimo** (D4).
- No se implementa el enlace `wa.me` (F4), el dashboard (F5), ventas (F6) ni repartidores (F7).
- Sin QR (D9). Sin método/tipo de pago (D3/D6).

## Dependencias

- F2: entidades, enums y `CreateOnlineOrderCommand`.
- F1: `GET /api/v1/public/ordering/{storeSlug}/config` (tipos de entrega, mínimo, envío, horarios,
  paleta/logo/banner).
- F8: la página pública aplica logo, banner y paleta de la tienda.
- Patrón público: `PublicCatalogController` + `GetPublicCatalogQuery`
  (`IStoreRepository.GetStoreByCatalogSlugAsync`).
- Catálogo React: `app/catalog/routes/public-catalog.tsx`, `app/routes.ts`.

## Decisiones del owner aplicables

| # | Decisión | Cómo aplica a F3 |
| --- | --- | --- |
| D4 | Cliente anónimo: nombre + teléfono + dirección (solo domicilio) | Formulario de checkout. |
| D3 | Pago manual en entrega/recogida | No hay pasarela; el pedido nace `Pending`. |
| D6 | Reutilizar `Order`/`OrderItem`; snapshot en `OrderItem` | `CreateOnlineOrderCommand` guarda el snapshot. |
| D11 | Flujo de estados | El pedido nace en `New`. |
| D13 | Carrito storefront separado; clave propia | Store dedicado del storefront. |
| D14 | Sin sincronización POS ↔ backend | El pedido vive solo en el servidor. |
| D16 | Horarios/zonas = texto simple | La disponibilidad se muestra como texto; no bloquea en v1. |
| D17 | `OrderType.WhatsApp = 101` | El pedido online usa ese `OrderType`. |
| — | Precios/moneda | **Fuera de alcance**: vienen del catálogo. |

## Decisiones resueltas y notas

**No quedan decisiones abiertas bloqueantes para F3.** Las antiguas A1/A2/A3 quedaron resueltas así:

- **A1 → D15**: quién administra el pedido (F5) es **StoreUser + OwnerAdmin** (`OnlineOrdersAdmin`);
  no afecta al cliente anónimo ni al contrato del carrito.
- **A2 → D16**: horarios y zonas son **texto simple**; la validación de disponibilidad no bloquea en
  v1 más allá de `Enabled`.
- **A3 → ELIMINADA**: el total y el snapshot usan la **moneda del catálogo/producto**; no hay moneda
  configurable de pedidos online.

## Diseño técnico

### UI React — store del storefront (D13)

- `app/catalog/lib/storefront-cart-store.ts`: store Zustand con `persist` y **clave propia**
  (propuesta: `lizoft-catalog-cart`; **nunca** `lizoft-cart`).
- Estado: `items: { product, quantity }[]`, `addItem`, `removeItem`, `updateQuantity`, `clear`,
  `total` (solo presentación; el total real lo fija el servidor). Sin `orderType`, sin `payments`, sin
  `clientName` del POS.
- El carrito se aísla por tienda/slug (propuesta: incluir `storeSlug` en el estado o en la clave) para
  no mezclar pedidos entre catálogos.

### UI React — componentes

- `app/catalog/components/storefront-cart.tsx`: carrito lateral/modal con cantidades y subtotal.
- `app/catalog/components/storefront-checkout.tsx`: formulario
  - `customerName` (requerido), `customerPhone` (requerido, formato validado),
    `deliveryType` (Pickup/Delivery según config),
  - `deliveryAddress` (requerido **solo** si `Delivery`),
  - `notes` (opcional).
- `app/catalog/routes/public-catalog.tsx`: punto de integración; se añade la entrada al carrito y el
  flujo de checkout **sin alterar** la vista de catálogo existente. Aplica logo, banner y paleta de F8.
- `app/catalog/lib/ordering-api.ts` (propuesta): `getOrderingConfig(slug)`,
  `createOrder(slug, payload)`, `getOrderStatus(slug, code, phone)`.

### Backend — endpoints

| Método | Ruta | Controlador | Permiso |
| --- | --- | --- | --- |
| POST | `/api/v1/public/ordering/{storeSlug}/orders` | `PublicOrderingController` | anónimo |
| GET | `/api/v1/public/ordering/{storeSlug}/orders/{code}` | `PublicOrderingController` | anónimo (requiere teléfono) |

**Payload propuesto de `POST`** (el cliente **no** envía precios ni total):

```json
{
  "customerName": "…",
  "customerPhone": "…",
  "deliveryType": "Pickup | Delivery",
  "deliveryAddress": "…",
  "notes": "…",
  "items": [{ "productId": "…", "quantity": 2 }]
}
```

**Servidor** (F2): resuelve la tienda por slug, valida `Enabled`, valida tipo de entrega, recalcula
precios con los productos publicados (y toma la **moneda del catálogo**), aplica `DeliveryFee`,
valida `MinimumOrderAmount`, crea el `Order` (`New`/`Pending`, `OrderType = WhatsApp`) con el snapshot
en `OrderItem` y devuelve `{ id, code, total, currency }`.

**Consulta por código + teléfono** (`GetPublicOrderStatusQuery`): `GET … /orders/{code}?phone=…`.
Debe coincidir **código + teléfono** (ambos) para devolver estado y pago. Respuesta acotada al estado
(`Status`, `PaymentStatus`, `DeliveryType`, `Total`, `Currency`, líneas), sin exponer datos internos.

### Validaciones y anti-abuso (propuesta)

- `customerPhone` con formato mínimo; `Delivery` exige `deliveryAddress`.
- Carrito no vacío; cantidades enteras > 0; ítems deben existir y estar **publicados**.
- Recalcular total siempre; ignorar cualquier precio del cliente.
- `MinimumOrderAmount` y `DeliveryFee` desde la config.
- Límite de tasa por IP/slug para `POST` (riesgo declarado en el maestro).
- `Code` corto, aleatorio y único por tienda; la consulta exige teléfono como segundo factor débil.

## Tareas

- [x] **T1** — Store `storefront-cart-store.ts` con clave propia (`lizoft-catalog-cart`) y aislamiento por slug (`itemsByStore`).
- [x] **T2** — Componente carrito + integración en `public-catalog.tsx` (botón con badge).
- [x] **T3** — Componente checkout (campos, validaciones, tipo de entrega condicional).
- [x] **T4** — Cliente API: `createPublicOrder`/`getPublicOrderStatus` en `catalog-http-service.ts` (junto a `getPublicOrderingConfig`, sin servicio nuevo).
- [x] **T5** — Backend: `CreateOnlineOrderCommand` **rehecho público por slug** (resuelve tienda+tenant por slug, lectura anónima) y expuesto en `PublicOrderingController`.
- [x] **T6** — Backend: `GetPublicOrderStatusQuery` (código + teléfono, 404 uniforme).
- [x] **T7** — Validaciones/anti-abuso: formato, mínimos, **rate limit `OnlineOrderPolicy`** (20/10 min por IP+slug).
- [x] **T8** — Claves i18n.
- [x] **T9** — Tests unitarios nuevos (store, componentes, query/command).
- [x] **T10** — Verificación (`typecheck`/`lint`/`vitest`, build/tests backend).

## Criterios de aceptación

1. El cliente puede añadir/quitar productos y ver el carrito sin que el POS (`lizoft-cart`) se vea
   afectado.
2. Con la config deshabilitada, el checkout no permite enviar el pedido.
3. `POST .../orders` crea el `Order` con `OrderType = WhatsApp`, total calculado en servidor y
   snapshot en `OrderItem`.
4. Un precio manipulado por el cliente **no** altera el total; la moneda se toma del catálogo.
5. `Delivery` sin dirección y `Pickup` con dirección quedan rechazados/ignorados según regla.
6. `GET .../orders/{code}` solo devuelve datos si el teléfono coincide.
7. El catálogo público existente sigue funcionando igual.

## Comandos de verificación

```bash
cd frontend-react/apps/web-store-pos
pnpm typecheck
pnpm lint
pnpm vitest run app/catalog/

cd ../../../backend
dotnet build src/SMCA.sln
dotnet test src/Application.Tests/Application.Tests.csproj
```

## Riesgos

- **Creación anónima**: necesita validación y límite de tasa.
- **Aislamiento por slug**: filtrar estrictamente por tienda en cada endpoint público.
- **Total manipulado**: recalcular siempre en servidor.
- **Colisión de claves de carrito**: verificar que la clave nueva no sea `lizoft-cart` y aislar por
  slug.
- **Enum privado de la respuesta**: no filtrar datos internos de la tienda en la consulta pública.

## Decisiones resueltas durante la implementación (2026-10-07)

| # | Punto | Decisión | Motivo |
| --- | --- | --- | --- |
| I1 | Contrato F2↔F3 (tienda) | `CreateOnlineOrderCommand` **rehecho público por slug** | El endpoint es anónimo; la versión de F2 leía `IHttpContextService` (JWT) → vacío. Ahora resuelve por `GetStoreByCatalogSlugAsync` y `tenantId = store.TenantId`. |
| I2 | Config en el alta | `GetPublicByStoreIdAsync` | El filtro de tenant anula la lectura de sesión en anónimo. |
| I3 | Estado del pedido | Nuevo `GetPublicByCodeAsync` con `IgnoreQueryFilters` | `Order` tiene filtro de tenant; `GetByCodeAsync` se deja intacto. |
| I4 | Pickup | **Ignora** la dirección (null) | No rechazar al cliente por un campo que no aplica. |
| I5 | Rate limit | Policy `OnlineOrderPolicy`: 20/10 min, partición IP+slug | Ya había infra (`AddRateLimiter`); se añade la tercera policy. |
| I6 | Carrito | Un store con `itemsByStore: Record<slug, …>`, clave `lizoft-catalog-cart` | Aísla por tienda sin varias claves; no toca `lizoft-cart`. |
| I7 | Enums en el contrato público | Numéricos | El proyecto no usa `JsonStringEnumConverter`; el frontend mapea por valor. |
| I8 | Código del pedido | El checkout muestra el código; el enlace `wa.me` es F4 | Fuera de alcance de F3. |

## Evidencia de verificación (2026-10-07)

| Comando | Resultado |
| --- | --- |
| `dotnet build src/SMCA.sln` | 0 errores |
| `dotnet test Application.Tests` | **829 passed** (+47) |
| `dotnet test Domain.UnitTests` | 154 passed |
| `turbo typecheck` / `lint` | 0 errores |
| `vitest app/catalog/` | **46 passed** |
| E2E | No se corrió (excluido) |

## Hallazgos de la revisión nativa (RDD) — TODOs rastreados (2026-10-07)

- [x] **F3-R1** (WARNING · backend) — El bypass del filtro de tenant en `Order` solo se prueba con EF InMemory, no con PostgreSQL real. Destino: F3/E2E (requiere autorización).
  - **Cerrado (2026-10-09)** con E2E nuevo: `Orders/PublicOrderingReadE2ETests.cs` (4 casos) + seed local `Orders/PublicOrderingSeed.cs`. El alta usa la vía de producción `Order.CreateOnline` y la lectura entra por el cliente HTTP **anónimo** contra `smca_test`. R1-1 (200 con código/total/snapshot), R1-2 (**la sonda que hace que R1-1 signifique algo**: con un tenant ajeno la consulta filtrada devuelve 0 filas y la que ignora el filtro devuelve 1, y un contexto sin tenant tampoco la ve — sin esta prueba el 200 de R1-1 no distinguiría "el bypass funciona" de "el filtro no llega a SQL en este Provider"), R1-3 (código inexistente y teléfono que no coincide → 404, uniforme) y R1-4 (el mismo código desde el slug de otra tienda → 404).
- [x] **F3-R2** (WARNING · backend) — La partición del rate limit lee el slug de `RouteValues`; no se prueba que el middleware corra después del routing (podría colapsar a IP-only). Destino: F3.
  - **Cerrado (2026-10-09)** con E2E nuevo: `Orders/PublicOrderingRateLimitE2ETests.cs` (3 casos), reutilizando el mismo seed. Los unitarios de `OnlineOrderRateLimitPolicyTests` **pasarían igual con el middleware antes del routing** — inyectan `RouteValues` a mano sobre un `DefaultHttpContext`, o sea que suponen un routing que el pipeline no garantiza. Aquí la petición entra por HTTP: R2-1 agota el presupuesto de 20 y el siguiente POST es 429 **y sigue siéndolo** (no es un 429 puntual por reposición: el test no afirma "la 21ª es 429" porque el repositorio es de 2/min y cruzaría una frontera de segmento; afirma que los 20 primeros pasan y el cubo queda cerrado). R2-2 es la del hallazgo: agotado el slug A desde la misma IP, el slug B responde 200 y A sigue en 429 — si la partición colapsara a IP-only, B heredaría el límite. R2-3 fija la normalización (el slug en MAYÚSCULAS cae en el mismo cubo).
- [x] **F3-R3** (WARNING · frontend) — `storefront-order-status` muestra "no encontrado" para **cualquier** error (red/5xx), no solo 404; `ORDER.STATUS_FAILED` queda sin usar. Destino: F3.
  - **Cerrado (2026-10-09).** `catch (err)` discrimina: solo el `404` se pinta como "no encontrado" (sigue siendo uniforme, así que no hace de oráculo); red caída, `5xx` y `429` muestran `ORDER.STATUS_FAILED`, que por fin se usa. Helper local `isNotFound` leyendo `response.status`, el mismo criterio con el que `auth-store.ts` separa veredicto de incidente: en `http-error.ts` no hay helper de status. Tres tests nuevos (sin conexión / 500 / 429) que además niegan el texto de "no encontrado".
- [x] **F3-R4** (WARNING · frontend) — Vaciar el input de cantidad **borra la línea** (`Number('') || 0` → 0 → remove). Destino: F3.
  - **Cerrado (2026-10-09).** El input ignora lo vacío y lo que no sea entero ≥ 1; quitar sigue teniendo sus gestos propios (−, "Quitar", "Vaciar") y el `updateQuantity(<= 0) → remove` del store **no se toca** (lo fija un test y lo usa el botón −). Dos tests: vaciar/borrar el dígito no borra la línea, y el − sigue llegando a `0`.
- [x] **F3-R5** (SUGGESTION · frontend) — Doble-submit del checkout sin test. Destino: F3.
  - **Cerrado (2026-10-09)**, con desviación sobre lo propuesto: el guarda pedido (`if (submitting) return`) **no cerraba la ventana**. El test nuevo (dos clics en el mismo tick con el POST en vuelo) falló con 2 llamadas: dos pulsaciones leen el MISMO estado mientras React no ha re-renderizado, y `disabled` depende de ese mismo render. La guarda real es un espejo del estado en una `useRef` que se escribe antes del primer `await` y se borra en el `finally`; el estado sigue apagando el botón. El estado por sí solo se queda como evidencia del fallo.
- [x] **F3-R6** (SUGGESTION · frontend) — Aviso "añadido" con auto-dismiss sin test. Destino: F3.
  - **Cerrado (2026-10-09).** Test con `vi.useFakeTimers({ shouldAdvanceTime: true })`: el aviso aparece, a los 2,5 s se va solo, y añadir OTRO producto a mitad de ciclo reinicia el temporizador (a los 2,5 s del primero el texto sigue ahí). Sin cambio de producción: el comportamiento ya era correcto, lo que faltaba era el test que lo fijara.

## Siguiente paso

F4 (envío del pedido por WhatsApp: enlace `wa.me` con el código y el resumen), luego F5 (dashboard), F6 (ventas), F7 (repartidores).

## Progreso

- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: eliminadas referencias a A1/A3; sin moneda propia; `OrderType = WhatsApp` (D17); horarios/zonas texto (D16). Sin implementación.
- 2026-10-07 — **Implementado en 2 slices** (rama `feat/pedidos-whatsapp-f3-carrito-cliente`, sobre F8):
  `3dd15c16` (backend: alta pública por slug + estado + rate limit) y `dbdddafe` (frontend: carrito +
  checkout + estado). Ambos **revisados y aprobados/acknowledgeados**. Owner resolvió el contrato
  F2↔F3. **Push: no** (F3 sigue local). Ver evidencia y TODOs arriba.
- 2026-10-09 — **Slice frontend cerrado (F3-R3, F3-R4, F3-R5, F3-R6).** El estado del pedido
  discrimina el veredicto (404) del incidente (red/5xx/429); el input de cantidad ya no borra la
  línea al vaciarse; el checkout frena el doble envío; y el auto-dismiss del aviso "añadido" queda
  fijado por test. R3-1 y R3-2 (aviso del checkout) se cerraron en el mismo slice y están anotados en
  `review-findings-cleanup.md`.
  Verificación observada: `pnpm vitest run app/catalog/ app/sales/` → 82 archivos / **1693 tests
  verdes**, `Type Errors: no errors`; `pnpm exec eslint` sobre los 6 archivos tocados → limpio;
  `pnpm typecheck` → **0 errores**. Sondas de mutación sobre los 6 hallazgos: cada fix revertido
  rompe exactamente su test (F3-R4 → 1 rojo; F3-R3 → 3 rojos; F3-R5 → 1 rojo, y el mismo rojo con
  la guarda por estado en lugar de la ref; F3-R6 → 1 rojo; R3-1 → 2 rojos por cada mitad del fix;
  R3-2 → 1 rojo). Sin commit (writer acotado).
- 2026-10-09 — **Slice backend cerrado (F3-R1, F3-R2).** E2E nuevos contra PostgreSQL real, sin tocar
  producción ni ningún E2E existente: `Orders/PublicOrderingReadE2ETests.cs` (4),
  `Orders/PublicOrderingRateLimitE2ETests.cs` (3) y el seed local `Orders/PublicOrderingSeed.cs`.
  El seed es LOCAL a propósito: `WebCatalogSeed` y `AuthzSeed` son del harness compartido y aquí
  hacen falta filas que ellos no crean (el `StoreCatalogSettings` con pedidos abiertos y un `Order`
  con líneas); el `CatalogSlug` se fija EN EL alta del store porque `ApplicationDbContext` es
  NoTracking y un `UPDATE` posterior no se escribiría. El slug lleva GUID → cada prueba tiene su
  cubo de rate limit y el suite no se pisa a sí mismo.
  Verificación observada: `dotnet build src/SMCA.sln` → **Build succeeded**, 0 errors, sin `error MSB`;
  `--filter PublicOrderingReadE2ETests` → **4/4**; `--filter PublicOrderingRateLimitE2ETests` → **3/3**
  (ambos con `[E2E Guard] … Database=smca_test`). Nombres verificados con `--list-tests` **sin**
  `--filter` antes de correr, porque un sufijo mal escrito hace que el filtro no matchee nada y la
  corrida salga vacía sin error. Sin commit (writer acotado).
