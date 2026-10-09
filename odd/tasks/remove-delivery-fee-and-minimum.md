# Quitar costo de envío e importe mínimo del pedido online

## Objetivo

Eliminar **el costo de envío** (`DeliveryFee`/`deliveryFee`) y **el importe mínimo del pedido**
(`MinimumOrderAmount`/`minimumOrderAmount`) de **toda la lógica**: backend y frontend. Es como si
nunca hubieran existido.

## Decisiones del owner (2026-10-08)

- **Fuera de backend y UI; en la BD NO se tocan las columnas.** La entidad y su configuración EF
  siguen mapeadas, pero dejan de usarse. Sus valores actuales se ignoran.
- **Sin migración** (las columnas se quedan).
- **El envío (costo) desaparece; recogida / a domicilio y la dirección se mantienen.**
- **F4-R3 se cierra con option B**: el resumen de WhatsApp se arma con el **snapshot persistido del
  servidor** (líneas + subtotal + total), no con el carrito del cliente. Con el envío eliminado, el
  total del servidor es subtotal + 0.

## Alcance

### Backend

- `PublicOrderingConfigDto`: fuera `DeliveryFee` y `MinimumOrderAmount` (contrato público).
- `CreateOnlineOrderCommandHandler`: `total = subtotal` (sin envío); **sin validación de mínimo**.
  Extender `OnlineOrderCreatedDto` con `Subtotal` y `Lines` (nombre, cantidad, precio) tomados del
  snapshot persistido (`OrderItem`), para el resumen del frontend.
- `StoreCatalogSettingsDto`, `UpsertStoreCatalogSettingsCommand` (+ validator) y
  `GetStoreCatalogSettingsQuery`: fuera los dos campos (no se leen ni se escriben).
- i18n: fuera `OnlineOrderBelowMinimumAmount`.
- Entidad `StoreCatalogSettings` y `StoreCatalogSettingsEntityTypeConfiguration`: **intactas**.
- Comentarios de DTOs que dicen "con el envío dentro": actualizar.

### Frontend (`frontend-react/`)

- `catalog-http-service.ts`: `PublicOrderingConfig` sin `deliveryFee`/`minimumOrderAmount`;
  `PublicOrderCreated` con `subtotal` y `lines` (espejo del DTO).
- `ordering-http-service.ts`: `OrderingSettings`/`OrderingSettingsPayload` sin los dos campos.
- `whatsapp-order-link.ts`: fuera `deliveryFee` y la línea "Envío"; `lines`/`subtotal`/`total` del
  resumen pasan a ser los del servidor (option B).
- `storefront-checkout.tsx`: sin bloques de envío ni de mínimo; el aviso de WhatsApp se arma con
  `result.data.lines`/`subtotal`/`total`. **F4-R2**: el paso de aviso (`buildWhatsAppOrderLink` +
  `window.open`) sale del `try/catch` del POST, para que un fallo al avisar no reporte como fallado
  un pedido ya guardado.
- `ordering-settings.tsx` (vista F1): fuera los inputs y el mapeo de `deliveryFee`/`minimumOrderAmount`.
- i18n: fuera `ORDERING_SETTINGS.DELIVERY_FEE`, `ORDERING_SETTINGS.MINIMUM_ORDER_AMOUNT`,
  `CHECKOUT.DELIVERY_FEE`, `CHECKOUT.MINIMUM_ORDER`.
- Cerrar los hallazgos F4-R1/R2/R4/R5/R6 (tests) del doc `pedidos-whatsapp-envio.md`.

## Fuera de alcance

- No se toca `frontend/` (Angular), ni los E2E, ni las columnas de la BD.
- No se cambia la modalidad de entrega ni la dirección.

## Criterios de aceptación

1. No queda ninguna referencia a envío/mínimo en la lógica backend ni en la UI (sí en entidad/EF/BD).
2. Un pedido online se crea con `total = subtotal`; el mínimo no bloquea.
3. La respuesta de creación incluye el snapshot de líneas y el subtotal; el resumen de WhatsApp se
   arma con ellos.
4. Un fallo al armar/abrir el aviso no reporta como fallado un pedido ya guardado (F4-R2).
5. Backend y frontend en verde.

## Comandos de verificación

```bash
cd backend
dotnet build src/SMCA.sln
dotnet test src/Application.Tests/Application.Tests.csproj

cd ../frontend-react/apps/web-store-pos
pnpm vitest run app/catalog/ app/sales/
pnpm lint
```

## Progreso

- 2026-10-08 — Documento creado. Decisiones del owner arriba. Sin implementación.
- 2026-10-08 — **Backend hecho** (este writer). Sin migración y sin tocar la entidad ni su
  `EntityTypeConfiguration`: las columnas `DeliveryFee`/`MinimumOrderAmount` siguen en la BD y
  quedan sin uso; sus valores antiguos se ignoran.
  - `PublicOrderingConfigDto` y `StoreCatalogSettingsDto`: fuera los dos campos.
  - `UpsertStoreCatalogSettingsCommand` (+ validator) y `GetStoreCatalogSettingsQuery`: ya no leen
    ni escriben los dos campos. El validador pasa de tres reglas a dos (las de importe
    desaparecen; la clave i18n `LessThanOrEqualTo` la siguen usando otros validadores).
  - `CreateOnlineOrderCommandHandler`: `total = subtotal`, sin validación de mínimo. Sin cambios en
    `ResolveDeliveryType`, `ValidateDeliveryAddress` ni `EnsureSingleCurrency`.
  - `OnlineOrderCreatedDto` ampliado: `(Id, Code, Subtotal, Total, Currency, Lines, WhatsappNumber)`
    con `OnlineOrderCreatedLineDto(Name, Quantity, Price)` leído del snapshot PERSISTIDO
    (`OrderItem` ordenado por `OrderIndex`) — F4-R3 option B.
  - i18n: fuera `OnlineOrderBelowMinimumAmount` (es y en). Las claves de modalidad/dirección, sin
    tocar.
  - Tests de Application actualizados: fuera los de envío y mínimo; nuevos
    `Handle_WithDelivery_ShouldNotAddAnyFee_TotalEqualsSubtotal` y
    `Handle_ShouldReturnThePersistedLineSnapshot` (este último verificado con sonda de mutación:
    construir `Lines` desde `resolvedLines` en vez de `order.OrderItems` lo hace fallar).
    `UpdateStoreCatalogBrandingCommandHandlerTests` sigue protegiendo la fila compartida, ahora
    sobre las columnas de pedidos que SÍ existen.
  - Verificación: `dotnet build src/SMCA.sln` → `Build succeeded`, 0 errores (buscado también
    `error MSB`, no solo `error CS`); `dotnet test src/Application.Tests/Application.Tests.csproj`
    → **1156/1156 verdes**; grep de `DeliveryFee|MinimumOrderAmount|OnlineOrderBelowMinimumAmount`
    en `src/Application` y `src/Application.Tests` → 0 coincidencias (solo sobreviven la entidad,
    su configuración EF y las migraciones/snapshot).
  - **Pendiente (otro writer):** todo `frontend-react/` y sus claves i18n
    (`ORDERING_SETTINGS.DELIVERY_FEE`, `ORDERING_SETTINGS.MINIMUM_ORDER_AMOUNT`,
    `CHECKOUT.DELIVERY_FEE`, `CHECKOUT.MINIMUM_ORDER`) y el consumo de `subtotal`/`lines` en el
    resumen de WhatsApp. Sin tocar: `frontend/` (Angular), E2E, entidad, migraciones.
  - **Fuera de superficie, pendiente de aviso:** dos menciones en prosa que quedaron obsoletas y no
    se tocaron por no estar en la lista de archivos autorizados —
    `Application/Features/OnlineOrdering/Commands/CreateOnlineOrder/CreateOnlineOrderCommandValidator.cs:9`
    ("el mínimo, el envío") y su test homónimo
    `Application.Tests/Features/OnlineOrdering/CreateOnlineOrderCommandValidatorTests.cs:11`.
    `Application/Dtos/OnlineOrdering/OnlineOrderingDtos.cs` sí quedó limpio porque sí estaba autorizado.
- 2026-10-08 — **Frontend hecho** (este writer). Contrato del backend ya consumido; nada de E2E ni
  de `frontend/` (Angular) tocado.
  - `catalog-http-service.ts`: `PublicOrderingConfig` sin `deliveryFee`/`minimumOrderAmount`;
    `PublicOrderCreated` gana `subtotal` y `lines` (`PublicOrderCreatedLine { name, quantity,
    price }`) como espejo de `OnlineOrderCreatedDto`/`OnlineOrderCreatedLineDto`.
  - `ordering-http-service.ts`: `OrderingSettings` y `OrderingSettingsPayload` sin los dos campos;
    el doc-comment del payload deja de prometer "los importes viajan ya en número".
  - `whatsapp-order-link.ts`: fuera `deliveryFee` de `WhatsAppOrderLinkInput` y fuera el bloque
    `Envío`. `lines`/`subtotal`/`total` no se tocan en el helper: los imprime tal cual, y ahora
    quien llama les pasa los del servidor.
  - `storefront-checkout.tsx`: fuera los bloques `checkout-delivery-fee` y `checkout-minimum`
    (**option B**): el resumen se arma con `result.data.lines.map(...)`, `result.data.subtotal` y
    `result.data.total`. El `subtotal` local del carrito sigue usándose para el resumen del modal
    (es de presentación; el aviso tampoco lo recalcula).
    **F4-R2**: el POST queda aislado en su propio `try/catch`; el aviso
    (`buildWhatsAppOrderLink` + `window.open` + `setWhatsapp`) va en un segundo, y `onCreated` se
    llama SIEMPRE tras un alta exitosa, incluido `staffMode`.
  - `ordering-settings.tsx`: fuera los dos campos de `OrderingForm`/`toForm`/`toPayload`, los dos
    inputs y el helper `amount()`, que queda sin uso y desaparece.
  - i18n: fuera exactamente las cuatro claves (`ORDERING_SETTINGS.DELIVERY_FEE`,
    `ORDERING_SETTINGS.MINIMUM_ORDER_AMOUNT`, `CHECKOUT.DELIVERY_FEE`, `CHECKOUT.MINIMUM_ORDER`).
  - Tests: los cuatro archivos autorizados actualizados (fixtures de `PublicOrderingConfig` y de
    `OrderingSettings`, y los dos `createPublicOrder` de `public-catalog.test.tsx` que ahora
    necesitan `subtotal`/`lines`). Nuevos: el resumen con el snapshot del servidor (option B) y
    F4-R1/R2/R4/R5/R6. Los fixtures de `PublicOrderingConfig` de `storefront-checkout-staff.test.tsx`
    y `storefront-flow.test.tsx` llevan ya `carouselImages: []`/`dailyImages: []`, lo que además
    **resuelve** el único error de `pnpm typecheck` que venía de la tanda anterior.
  - Verificación observada: `pnpm vitest run app/catalog/ app/sales/` → **82 archivos / 1685
    tests verdes**, `Type Errors: no errors`; `pnpm exec eslint` sobre los 11 archivos tocados →
    limpio (exit 0); `pnpm typecheck` → limpio (exit 0); los 11 archivos verificados estables frente
    a `prettier` (byte a byte sobre una copia).
  - Sondas de mutación (cada fix revertido rompe el test que lo fija): `created.lines`/
    `created.subtotal` → carrito → cae el test del snapshot del servidor; el aviso dentro del
    `try/catch` del POST → cae el de "un fallo al abrir WhatsApp no reporta el pedido como
    fallido"; sin `setWhatsapp(null)` en el efecto de `open` → cae el de "al reabrir el checkout el
    aviso desaparece".
  - **Fuera de superficie, pendiente de aviso:** dos menciones que quedaron obsoletas y NO se
    tocaron (no estaban autorizadas):
    - `app/shared/lib/config/menu-config.ts:178` y `:191` — el texto de ayuda del ítem "Pedidos
      WhatsApp" sigue **prometiendo al dueño** que puede configurar "el costo del envío, el importe
      mínimo". Es ayuda de usuario que miente, no solo un comentario obsoleto.
    - `app/catalog/lib/storefront-cart-store.ts:49` — doc-comment de `total()`: "el servidor
      recalcula precios, envío y mínimo al crear la orden".
