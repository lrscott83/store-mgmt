# store-module-global-active-enforcement

Objective: un módulo con `Module.IsActive == false` (inactivo GLOBAL) es invisible e inaplicable
para las tiendas en TODO: no se muestra en el popup de módulos de la tienda, no cuenta en el
precio, no aparece en los permisos (claims del JWT ni `FeatureIds` de `/me` ni el roster
offline). Además, al desactivar un módulo globalmente se **desactivan en cascada** sus filas
`StoreModule` de todas las tiendas.

Branch: `test`. Runner: backend `dotnet test`.

## Specs

S1 — Precio: la regla única (`ModulePriceCalculator`) excluye SIEMPRE los módulos con
     `Module.IsActive == false` → card (Owner y SuperAdmin), cobro, por-cobrar. (Criterio 10.)

S2 — Permisos: un feature de un módulo globalmente inactivo NO aparece ni en los claims del JWT
     (`UserRoleRepository.GetUserFeatureIdsForClaims`) ni en `FeatureIds` de `/me`
     (`FeatureRepository.FilterAvailableToStoreByIds`, usado por `AllowedFeaturesService`) ni en
     el roster offline (`ExportOfflineRoster`).

S3 — Cascada: al guardar `PUT /v1/modules/pricing` una fila con `IsActive=false`, todas las
     filas `StoreModule` de ese módulo en TODAS las tiendas quedan `IsActive=false`. Solo
     `StoreModule` (no `StoreRoleFeature`). Reactivar NO hace nada más.

S4 — Popup por tienda: el read lista las filas propias de la tienda EXCEPTO las de módulos
     globalmente inactivos, y el total tampoco las cuenta (ajuste de `a2aab3f1`, sin revert).

S5 — Todo lo demás igual: el filtro solo es por `Module.IsActive`; `AvailableToStore`/features no
     cambian su semántica.

## Tasks

- [x] T1 — Precio: `ModulePriceCalculator` filtra por `Module.IsActive` (tolerante si la
        navegación no está cargada: unit tests/servicios puros); `Module` cargado en todos los
        call sites reales (OwnerRepository +StoreModules.ThenInclude(Module)).
- [x] T2 — Claims: `UserRoleRepository.GetUserFeatureIdsForClaims` + `Feature.Module.IsActive`.
- [x] T3 — `/me` + roster: `FeatureRepository.FilterAvailableToStoreByIds` + `Module.IsActive`.
- [x] T4 — Cascada en `UpdateModuleCatalogPricingCommand` (solo `StoreModule`, todas las tiendas;
        `IStoreModuleRepository.GetAllActiveByModuleIdsAsync`; solo transición activo→inactivo).
- [x] T5 — Popup read: excluye módulos globalmente inactivos (ajuste de `a2aab3f1`).
- [x] T6 — E2E backend: `StoreModuleGlobalActiveEnforcementTests` (cascada, precio, `/me`) 3/3.

## Verificación (2026-10-14)

- `Domain.UnitTests` 165/165 (incluye el nuevo `CalculateTotal_storeModule_globallyInactiveModule_contributesZero`).
- `Application.Tests` 1309/1309.
- `SMCA.WebApi.E2ETests` **757/757** (suite completa del backend).
- Nuevo `StoreModuleGlobalActiveEnforcementTests` 3/3 (cascada, precio, `/me`).
- `UpdateModuleCatalogPricingCommandHandlerTests` actualizado al ctor nuevo (mock de `IStoreModuleRepository`).
- Nota honesta: el fix se aplicó antes de escribir los E2E de precio/cascada; no se demostró
  el estado ROJO previo en esta corrida (el test de `/me` sí nace del comportamiento nuevo).

## Log

L1 (request del owner, verbatim, 2026-10-14):

> "si los modulos no estan activos globalmente entonces para las tiendas no se muestran esos
> modulos ni estaran disponibles para nada ni para cuando se autentique con los permisos ni
> cuando se calcule el precio"

L2 (aclaraciones): criterio nuevo = precio 10; "activo globalmente" es como está (solo
`Module.IsActive`); cascada solo `StoreModule`; reactivar no hace nada más; el filtro va a todo
lo que se necesite (incluye roster offline); sin backfill de datos existentes.

L3 (huecos, auditoría 2026-10-14):
- `UserRoleRepository.GetUserFeatureIdsForClaims:43-52` (claims) — falta `Feature.Module.IsActive`.
- `FeatureRepository.FilterAvailableToStoreByIds:18-23` (`/me` `FeatureIds` + roster) — falta.
- `ModulePriceCalculator.CalculateTotal/CalculateBaseTotal(StoreModule)` — falta `Module.IsActive`.
- `GetStoreModulePricingQuery` (popup) — lista filas de la tienda fuera del catálogo (fix `a2aab3f1`).
- `UpdateModuleCatalogPricingCommand` — sin cascada.
Ya filtran: `StoreRoleFeatureRepository:46/68/80`, `StoreModuleRepository:22`,
`FeatureRepository:35`.
