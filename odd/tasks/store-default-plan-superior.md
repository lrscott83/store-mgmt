# Plan por defecto de tienda nueva: Superior

## Objetivo

Toda tienda **nueva** (auto-registro y `POST /api/v1/stores`) nace en el plan **Superior (3)** y con
**todos los módulos del plan Superior que estén `IsActive = true` y `AvailableToStore = true`**.
Hoy nace en **Pago (2)** con el catálogo de Pago.

## Decisiones del owner (2026-10-11)

- **Solo creación.** El `UpdateStore` (nombre/otros) y el cambio de plan (`ChangeStorePlan` /
  `ToggleStorePlan`) **no se tocan**. El update no fija plan; su único gate de plan (WholesaleSales 12
  solo con Superior/VIP) ya es plan-aware.
- El set de módulos al crear se deriva **del plan Superior**, filtrado por `IsActive` y
  `AvailableToStore`. Excluye por construcción el **único módulo VIP-only (16, Múltiples pagos)** y
  cualquier módulo no disponible o inactivo.
- **Se elimina `ModuleIds` del `POST /v1/stores`** (request + frontend): ya no se usa; el server
  otorga el catálogo del plan. Se quita del DTO/comando, del validador y del formulario React.
- Solo tiendas **nuevas**; no se migran las Pago existentes.
- **Se reemplaza** la invariante `store-birth-pago-only` (2026-09-25) por `store-birth-superior`.

## Alcance (superficies de producción)

- `Domain/Entities/Stores/Store.cs`: default `storePlanId` → Superior en los overloads de `Create`.
- `Application/Services/Stores/CreateStoreService.cs`: crea la tienda en Superior y deriva los
  módulos del plan Superior filtrado (`IsActive && AvailableToStore`); deja de recibir `moduleIds`.
- `Domain/Interfaces/Services/Stores/ICreateStoreService.cs`: firma sin `moduleIds`.
- `Application/Services/Authentication/RegisterService.cs`: usa el servicio (sin cargar Pago ni pasar
  módulos).
- `Application/Features/StoreManagement/Stores/Commands/CreateStore/CreateStoreCommand.cs` (+
  `CreateStoreCommandValidator.cs`): **quita `ModuleIds`** del comando/validador.
- i18n: limpiar claves que queden sin uso por este cambio (p.ej. `ModuleNotAvailableForPagoPlan` si
  deja de usarse).
- Frontend: `CreateStorePayload` sin `moduleIds`; quitar su envío en `edit-store.tsx` /
  `my-stores.tsx`; ajustar `create-store-modal.tsx` si expone la selección.

## Cobertura E2E exigida (100%)

1. Tienda nueva (registro y POST create) → `StorePlanId = Superior` + **exactamente** los módulos del
   plan Superior con `IsActive && AvailableToStore`.
2. **VIP-only (16)** nunca aparece (no está en Superior) — test explícito.
3. Un módulo del plan Superior con **`AvailableToStore = false`** **no** se otorga (flip + restore).
4. Un módulo del plan Superior con **`IsActive = false`** **no** se otorga (flip + restore).
5. `/me` de la tienda nueva expone el mismo universo.

## Tests existentes a actualizar

- E2E: `Stores/StoreBirthPagoOnlyTests.cs` (reescritura: birth-superior), `Stores/StoreCreatePlanTests.cs`,
  los que asertan Pago en el alta (`Auth/…`, `Owners/…`), y `Features/PedidosModulesSeedTests` si aplica.
- `Application.Tests`: `CreateStoreCommandHandlerTests`, `CreateStoreCommandValidatorOwnerTests`,
  `CreateStoreServiceTests`, `RegisterServiceModuleTests`, `RegisterServiceRegistrationTests`,
  `RegisterServiceReSellerTests`, `RegisterServiceTestFixture` — todo lo que afirme **Pago por defecto
  al crear** pasa a **Superior**. NO tocar los que usan Pago como plan de ejemplo no relacionado con el
  alta (Billing, ToggleStorePlan, mappings, GetAdminPlans…).

## Progreso

- 2026-10-11 — Documento creado. Decisiones del owner arriba.
- 2026-10-11 — Implementado y verificado:
  - Producción: `Store.Create` default → Superior; `ICreateStoreService`/`CreateStoreService` derivan el
    catálogo del plan Superior (`Module.IsActive && Module.AvailableToStore`); `RegisterService` sin
    carga de plan Pago ni módulos; `CreateStoreCommand`+validator sin `ModuleIds`.
  - Frontend: `CreateStorePayload` sin `moduleIds`; `edit-store.tsx`/`my-stores.tsx` dejan de enviarlo;
    se elimina la resolución del plan Superior en el create.
  - Tests: `Application.Tests` y E2E actualizados a Superior; `StoreBirthPagoOnlyTests` reemplazado por
    `StoreBirthSuperiorTests` (BS1-3) + `StoreBirthCatalogFlagTests` (AvailableToStore/IsActive falsos
    no se otorgan, con restore en `finally`).
  - Verificación: build 0 errores; Domain.UnitTests 165/165; Application.Tests 1229/1229;
    E2E backend 715/715 (suite completa, exit 0); frontend typecheck/lint OK + tests stores 172.
- Pendiente: commit + push (decisión del owner).
