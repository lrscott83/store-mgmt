# Plan — Pago 0 por tienda (100% descuento) + precio con descuento tachado en vistas de superadmin

Fecha: 2026-09-05 · Estado: propuesta para revisión (sin implementar)
Ámbito: backend (`backend/src`) + frontend React (`frontend-react/apps/web-store-pos`, `frontend-react/packages/domain`).

## Objetivo

1. Agregar en la vista de **tiendas del superadmin** (`/admin/stores`) la opción de dejar el **pago de la tienda en 0**: todos los módulos de pago que tiene activos quedan con **100% de descuento**. Incluye acción **Restablecer** para volver a los precios del catálogo.
2. Mostrar en la tarjeta de tienda el mismo formato de precio que la vista de propietarios: **`$5 en 1 tienda (2026-10-31)`** (total actual + próxima fecha de cobro).
3. En **las dos vistas** (propietarios `/admin/owners` y tiendas `/admin/stores`), cuando haya precio de descuento, mostrar el **precio que deberían pagar tachado en rojo** y al lado el **precio de la oferta**.

## Estado actual (verificado en código)

- **`StoreModule`** (`Domain/Entities/StoreModules/StoreModule.cs`) ya tiene por tienda: `Price` (base), `ModulePrice`, `ModulePercentDiscountPrice`, `ModuleDiscountPrice` — copia del descuento de catálogo hecha al activar el plan (`ToggleStorePlanCommand.ApplyFreeToPaid`). **No requiere migración.**
- **Precio actual** = `CurrentPriceServiceUtils.GetCurrentPrice(Price, ModulePercentDiscountPrice, ModuleDiscountPrice)` (`Domain/Common/Utils`).
- **`StoreDto`** (`Application/Dtos/StoreManagement/StoreDto.cs`) ya serializa `Modules` (con `Price`, `CurrentPrice`, `DiscountText`) vía `StoreProfile` → `ModuleProfile` (map `StoreModule → ModuleDto`). **`NextPaymentDate` existe en el DTO pero nadie lo llena** (AutoMapper no lo mapea; queda `0001-01-01`).
- **`OwnerStoreModuleDto`** ya tiene `StoreModuleTotalCurrentPrice` (suma de precios actuales) y `NextDueDate` (enriquecido en `GetAllOwnersQuery.EnrichNextDueDates` con `StoreBillingUtils.GetNextDueDate`). **No tiene** el total "sin oferta" para el tachado.
- **Frontend**: `StoreCardList` (`admin/stores/components/store-card-list.tsx`) se usa en `/admin/stores` **y** en el tab Tiendas de `owner-edit`; hoy no muestra precio ni fecha. `OwnerCardList` ya muestra `{total} en {N} tiendas ({fechas})` (`admin/owners/components/owner-card-list.tsx:100-109`).
- **Guards de los comandos de cobro/plan** (`ToggleStorePlanCommand`, `RegisterStorePaymentCommand`): SuperAdmin o ReSeller dueño de la tienda — patrón a copiar.

## Decisiones confirmadas

1. **Mecanismo**: descuentos **por tienda** reutilizando `ModulePercentDiscountPrice`/`ModuleDiscountPrice` de `StoreModule` (sin migración; el precio base `Price` se preserva).
2. **Pago 0 = 100% de descuento en todos los módulos de pago, y punto.** No hay totales arbitrarios ni reparto de descuento (`$5 en 1 tienda (2026-10-31)` es solo el **formato de visualización**, no una acción).
3. **Permisos**: SuperAdmin + ReSeller dueño (mismos guards que `ToggleStorePlan`/`RegisterStorePayment`).
4. **Acción Restablecer**: sí — limpia el descuento por tienda devolviendo a cada `StoreModule` el descuento vigente de su `Module` de catálogo.

### Semántica del "precio que deberían pagar" (tachado)

- **Precio de oferta** (ya existe): suma de `GetCurrentPrice(Price, ModulePercentDiscountPrice, ModuleDiscountPrice)`.
- **Precio "deberían pagar"** (nuevo): suma de `GetCurrentPrice(Price, Module.PercentDiscountPrice, Module.DiscountPrice)` — el precio **efectivo de catálogo** (incluye descuentos estándar del catálogo, excluye el beneficio por tienda). Con la tienda sin override ambos totales coinciden y **no** se muestra tachado.

## Cambios — Backend

### B1. Comando `SetStoreZeroPaymentCommand` (nuevo)

Ubicación: `Application/Features/StoreManagement/Stores/Commands/SetStoreZeroPayment/` (patrón `ToggleStorePlanCommand`).

- Request: `SetStoreZeroPaymentCommand(Guid StoreId) : ICommand<bool>`.
- Handler:
  1. Guard de rol: `IsSuperAdmin || IsReSeller`; si es ReSeller, verificar dueño (`IsStoreOwnedByReSellerUserAsync`).
  2. Cargar tienda con módulos (`GetStoreWithModulesAndReSellerOwnerAsync`); 400 si no existe / `StoreInactive` / `OwnerUserInactive` (mismas precondiciones que Toggle).
  3. Para cada `StoreModule` **activo y de pago** (`IsActive && !ModulePriceIncluded`): `ModulePercentDiscountPrice = 100`, `ModuleDiscountPrice = 0`. Los módulos gratis (`PriceIncluded`) y los inactivos no se tocan.
  4. Idempotente: re-ejecutar no cambia nada (mismo resultado). `SaveChangesAsync` en una transacción (UnitOfWorkBehaviour ya lo envuelve).
- Endpoint: `PUT /api/v1/stores/{id}/zero-payment` (controller `StoresController`, mismo grupo que `toggle-plan`).

### B2. Comando `ResetStoreModulePricesCommand` (nuevo)

Ubicación: `Application/Features/StoreManagement/Stores/Commands/ResetStoreModulePrices/`.

- Igual guard y precondiciones que B1.
- Para cada `StoreModule` activo de pago: restaurar `ModulePercentDiscountPrice = Module.PercentDiscountPrice` y `ModuleDiscountPrice = Module.DiscountPrice` **desde la entidad `Module` de catálogo** (por `ModuleId`; incluir la nav `StoreModule.Module` o resolver el catálogo por repository, como hace Toggle con `GetAvailableModulesToStore`).
- Idempotente y sin efecto si la tienda nunca tuvo override (queda igual al catálogo).
- Endpoint: `PUT /api/v1/stores/{id}/reset-module-prices`.

### B3. `GetStoresQuery` — enriquecer `NextPaymentDate` y totales

- Enriquecer como hace `GetAllOwnersQuery`: `NextDueDate = StoreBillingUtils.GetNextDueDate(store.PaymentStartDate, trialMonths, lastPaidBeforeDate)` — requiere que la consulta incluya `StorePayments` (verificar/extender `IStoreRepository.GetStoresAsync`; si no incluye, agregar include o un diccionario de últimos pagos por store). Mapear a `StoreDto.NextPaymentDate` (hacerlo `DateOnly?` en el DTO para respetar "free plan → null", alineado con `StorePlanDto`).
- Agregar a `StoreDto` dos totales calculados en `StoreProfile` (evita exponer el descuento de catálogo por módulo al cliente):
  - `TotalCurrentPrice` = suma de precios actuales (oferta).
  - `TotalBasePrice` = suma de precios efectivos de catálogo ("deberían pagar", ver semántica arriba; requiere nav `StoreModule.Module` incluida en la query — verificar `GetStoresAsync`).

### B4. `OwnerStoreModuleDto` — total "deberían pagar"

- Agregar `StoreModuleTotalBasePrice` y calcularlo en `StoreProfile.GetStoreModuleTotalCurrentPrice`-style (`GetStoreModuleTotalBasePrice` con los descuentos de catálogo del `Module`). Verificar que `GetAllOwnersIncludingStoreModulesAsync` / `GetReSellerOwnersIncludingStoreModulesAsync` incluyan la nav `StoreModule.Module`; si no, ampliar el include.

### B5. Tests E2E backend (xUnit, `SMCA.WebApi.E2ETests/Stores/`)

Nuevo archivo `StorePaymentZeroOverrideTests.cs`:

1. SuperAdmin pone pago 0 → todos los `StoreModules` activos de pago con `PercentDiscountPrice=100`; `GET stores` devuelve `TotalCurrentPrice=0` y `TotalBasePrice>0`.
2. Restablecer → `TotalCurrentPrice == TotalBasePrice` y los descuentos por módulo vuelven a los del catálogo (comparar contra una tienda de control sin override).
3. ReSeller dueño puede pagar-0 y restablecer su tienda; ReSeller ajeno → 400 (`StoreNotFound`).
4. StoreUser → 403 (rol guard).
5. Tienda inactiva / owner inactivo → 400.
6. Idempotencia: pago-0 dos veces y reset sin override previo → 200 sin cambios.
7. `NextPaymentDate` presente en `GET /stores` para tienda en plan pago y `null` (o ausente) para free plan.

## Cambios — Frontend

### F1. Dominio (`packages/domain/src/models`)

- `Store`: `totalCurrentPrice?: number; totalBasePrice?: number; nextPaymentDate?: string | null;` (opcionales, retrocompatible con fábricas/tests).
- `OwnerStoreModule`: `storeModuleTotalBasePrice?: number;`.

### F2. `store-http-service.ts`

- `setStoreZeroPayment(id)` y `resetStoreModulePrices(id)` (PUTs nuevos, patrón `toggleStorePlan`).

### F3. `StoreCardList` (compartido `/admin/stores` + tab Tiendas de owner-edit)

- Línea de precio (formato propietarios): `{formatCurrency(totalCurrentPrice)} en 1 tienda ({nextPaymentDate})` — 1 tienda porque la tarjeta es una sola tienda; ocultar la línea si la tienda es free plan (`paymentStartDate === null`).
- **Con descuento** (`totalBasePrice > totalCurrentPrice`): `~~{formatCurrency(totalBasePrice)}~~` tachado en rojo (`line-through text-danger`) + precio de oferta al lado.
- Acciones nuevas en el `ActionMenu` (solo se renderizan si se pasan los handlers — el tab Tiendas de `owner-edit` puede omitirlos sin cambios):
  - **Poner pago 0** → `confirmDialog` ("todos los módulos de pago quedarán con 100% de descuento") → `setStoreZeroPayment` → recargar.
  - **Restablecer precios** → `confirmDialog` → `resetStoreModulePrices` → recargar.
- i18n (`es.ts`): `STORES.SET_ZERO_PAYMENT`, `STORES.SET_ZERO_PAYMENT_CONFIRM_*`, `STORES.RESET_PRICES`, `STORES.RESET_PRICES_CONFIRM_*`, `STORES.PRICE_IN_STORES` (etiqueta "en {count} tienda(s)").

### F4. `OwnerCardList` (tacha el total del propietario)

- `totalBase = sum(storeModuleTotalBasePrice ?? storeModuleTotalCurrentPrice)`; si `totalBase > totalCurrent`, renderizar tachado rojo + oferta: `~~$10~~ $5 en 1 tienda (2026-10-31)`.

### F5. Wiring `/admin/stores` (`store-list.tsx`)

- Handlers `handleSetZeroPayment` / `handleResetPrices` (confirm → service → `loadStores()`), pasados a `StoreCardList`. El tab Tiendas de `owner-edit` queda solo con el **display** nuevo (heredado por el componente) y sin las acciones (scope: vista de tiendas del superadmin).

### F6. Tests frontend

- Unit `store-card-list.test.tsx`: precio+fecha, tachado cuando `base > current`, sin tachado cuando iguales, oculto en free plan, acciones llaman servicio tras confirmar y no sin confirmar.
- Unit `owner-card-list.test.tsx`: tachado con `storeModuleTotalBasePrice` presente; retrocompatible cuando falta (usa current).
- Unit `store-http-service` : 2 métodos nuevos.
- E2E Playwright (`e2e/store-payment-zero.spec.ts`, opcional/fase 2): superadmin abre `/admin/stores`, pone pago 0, verifica `$0` + tachado; restablece y verifica que el tachado desaparece.

## Impacto

| Área | Impacto |
|------|---------|
| Migraciones BD | **Cero** (se reutilizan columnas existentes de `StoreModule`). |
| Backend | 2 comandos + 2 endpoints; enriquecimiento de `GetStores` (NextPaymentDate + totales) y `OwnerStoreModuleDto` (1 campo); includes de nav `Module`/`StorePayments` a verificar. |
| Frontend | 1 servicio (+2 métodos), 2 tarjetas (display), 1 página (wiring), dominio (campos opcionales), i18n. |
| Otros flujos | `RegisterStorePayment` sigue funcionando (con pago 0 registraría cobro de $0 y avanzaría el ciclo — decisión del superadmin, no se bloquea). `StorePlanDto`/vista del dueño intactos. Sync/export-import offline: no aplica (son vistas online de superadmin). |
| Riesgo | Enriquecer `GetStores` puede tocar el repo `GetStoresAsync` (includes) — verificar rendimiento y que `StorePayments` esté disponible; los totales nuevos son opcionales en el cliente, así que el despliegue frontend/backend puede ser gradual. |

## Pasos de implementación (orden propuesto, TDD)

1. Backend: tests E2E B5 (rojos) → B1/B2 (comandos+endpoints) → verdes.
2. Backend: B3/B4 (totales + NextPaymentDate) con tests de mapeo/queries → verdes.
3. Frontend: F1/F2 unit (rojos) → implementar → verdes.
4. Frontend: F3/F4/F5 unit (rojos) → implementar → verdes; suite completa + typecheck.
5. E2E Playwright F6 y suite backend completa.
