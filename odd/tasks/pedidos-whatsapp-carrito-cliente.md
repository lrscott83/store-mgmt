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

- [ ] **T1** — Store `storefront-cart-store.ts` con clave propia y aislamiento por slug.
- [ ] **T2** — Componente carrito + integración mínima en `public-catalog.tsx`.
- [ ] **T3** — Componente checkout (campos, validaciones, tipo de entrega condicional).
- [ ] **T4** — Cliente API `ordering-api.ts` (config, crear pedido, consultar estado).
- [ ] **T5** — Backend: exponer `CreateOnlineOrderCommand` en `PublicOrderingController`.
- [ ] **T6** — Backend: `GetPublicOrderStatusQuery` (código + teléfono).
- [ ] **T7** — Validaciones/anti-abuso (formato, mínimos, tasa) + tests.
- [ ] **T8** — Claves i18n.
- [ ] **T9** — Tests unitarios nuevos (store, componentes, query/command).
- [ ] **T10** — Verificación (`typecheck`/`lint`/`vitest`, build/tests backend).

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

## Siguiente paso

Cerrar el contrato de `CreateOnlineOrderCommand` con F2; implementar F3 tras F1/F2/F8.

## Progreso

- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: eliminadas las referencias a A1/A3; sin moneda propia
  (viene del catálogo); `OrderType = WhatsApp` (D17); horarios/zonas texto (D16);
  "Decisiones abiertas" → "Decisiones resueltas y notas". Sin implementación.
