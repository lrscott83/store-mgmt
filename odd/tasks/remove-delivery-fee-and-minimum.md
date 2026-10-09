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
