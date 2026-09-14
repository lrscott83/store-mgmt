# Plan — Paridad de precios de pago entre la vista de tiendas del Owner y la del SuperAdmin

- **Fecha:** 2026-09-15
- **Ámbito:** Backend (endpoints de listado + E2E) y un fix puntual en el frontend.
- **Estado:** Diagnóstico verificado en código; implementación con TDD (E2E backend primero).

## 1. Objetivo

Que el **precio de pago** mostrado para una misma tienda sea **idéntico** en las dos vistas:
- **Owner** — "Mis tiendas" (`GET /v1/stores/my-stores` → `OwnerStoreDto`, tarjeta `owner-store-card.tsx`).
- **SuperAdmin** — listado de tiendas (`GET /v1/stores/by-current-user` rama SuperAdmin → `StoreDto`, tarjeta `store-card-list.tsx`).

Y que ese precio sea el **canónico del plan** de la tienda (Σ de los `currentPrice` de los módulos pagos **activos** de su snapshot).

## 2. Cómo se calcula hoy el precio (verificado)

Ambas tarjetas derivan el precio **en el cliente** desde el snapshot de módulos de la tienda (`StoreModule` → `ModuleDto`):

| Vista | Endpoint | Datos | Derivación en cliente |
|---|---|---|---|
| Owner my-stores | `my-stores` → `GetAllStoresByOwnerUserIdAsync` / `GetAllStoresWithModulesAsync` (SuperAdmin) | `OwnerStoreDto.Modules` (snapshot) | `mergeStoreModules(catálogo, snapshot)` → Σ `!priceIncluded` |
| SuperAdmin listado | `by-current-user` → `GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync` / `GetActiveStoresByUserIdAsync` | `StoreDto.Modules` (snapshot) | Σ `store.modules.filter(!priceIncluded)` (sin merge) |

El mapping `StoreModule → ModuleDto` (ModuleProfile) usa `sm.Price` (snapshot congelado) y `CurrentPrice` con los descuentos del snapshot — idéntico para ambas vistas. La diferencia está en **qué filas y qué catálogo** entran a la suma.

## 3. Causas raíz encontradas

### CAUSA-1 (frontend, la que hace que las dos vistas no coincidan)
`owner-store-card.tsx` suma **todo el catálogo** de módulos pagos, no solo los de la tienda:

```ts
const paidModules = modules.filter((m) => !m.priceIncluded);   // modules = mergeStoreModules(catalog, snapshot)
```

`mergeStoreModules` devuelve **una entrada por cada módulo del catálogo**; los que la tienda NO tiene quedan `selected: false` **con precios del catálogo**. El filtro no exige `selected`, así que para una tienda en **Pago** (que no tiene Almacenes/MultiStores) la tarjeta del Owner suma también esos módulos del catálogo → precio inflado. En una tienda **Superior** (todos los módulos seleccionados) ambas vistas coinciden, por eso el bug solo se ve con otros planes. La tarjeta del SuperAdmin suma solo `store.modules` (snapshot puro) → correcto.

### CAUSA-2 (backend, las dos vistas comparten el defecto vs. la vista de plan)
`GetAllStoresByOwnerUserIdAsync`, `GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync` y `GetActiveStoresByUserIdAsync` incluyen `StoreModules` **sin filtrar `sm.IsActive`**, mientras que la vista de plan (`GetStoreByIdIncludingModulesAsync`) sí filtra `.Where(sm => sm.IsActive)`. Tras cualquier cambio de plan (`ChangeStorePlanCommand` hace soft-delete de las filas fuera del universo), las filas inactivas con precios viejos **se siguen sumando** en los dos listados.

### CAUSA-3 (comportamiento legacy documentado, NO se corrige en este plan)
`ToggleStorePlanCommand` (botón binario Activar/Desactivar plan del SuperAdmin) al pasar a pago activa **TODOS** los módulos pagos del catálogo (no solo los del plan Pago) con `StorePlanId = Pago`. El precio mostrado en ambas vistas es consistente (Σ catálogo pago completo), pero difiere del precio canónico del plan Pago. Queda fuera de alcance: cambiarlo altera el contrato del toggle (spec `store-plan-toggle`); se documenta aquí.

## 4. Cambios

### 4.1 Backend — E2E nuevos (TDD, rojo primero)
**Nuevo fichero:** `SMCA.WebApi.E2ETests/Stores/StoreListPriceParityTests.cs`

Siembra un owner con **cuatro tiendas** (mismo patrón de `DisapprovedStoreBillingViewsTests`):
1. **Gratis** — solo módulos free (`PriceIncluded=true`).
2. **Pago** — universo Pago: free + miembros del plan, precios de snapshot explícitos (p.ej. 100 c/u) para no acoplarse al catálogo.
3. **Superior** — free + todos los pagos.
4. **Pago-tras-bajada** — filas de Superior soft-deleted (`IsActive=false`) + filas Pago activas (simula un cambio Superior → Pago).

Asertos por tienda:
- **PARIDAD:** los `(moduleId, price, currentPrice)` de los módulos pagos son **idénticos** en `my-stores` (owner) y `by-current-user` (SuperAdmin).
- **CANÓNICO:** Σ `currentPrice` de pagos activos == esperado por plan (0 / ΣPago / ΣSuperior / ΣPago).
- **SIN FILAS MUERTAS:** la tienda 4 no aporta precios de filas `IsActive=false` (con CAUSA-2 viva, este test falla en ambos endpoints → rojo).

### 4.2 Backend — fix CAUSA-2
`StoreRepository`: añadir `.Where(sm => sm.IsActive)` al `Include(s => s.StoreModules)` de:
- `GetAllStoresByOwnerUserIdAsync`
- `GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync`
- `GetActiveStoresByUserIdAsync`

(misma forma que `GetStoreByIdIncludingModulesAsync`. Consumidores que solo leen Id/Name/IsActive — roster export, GetMe — no cambian de resultado.)

### 4.3 Frontend — fix CAUSA-1
`owner-store-card.tsx`: `paidModules` filtra solo los módulos **seleccionados** de la tienda:

```ts
const paidModules = modules.filter((m) => !m.priceIncluded && m.selected);
```

Tests unitarios: `owner-store-card.test.tsx` con catálogo completo (módulos pagos no seleccionados presentes) fijando que el precio no cambia al ampliar el catálogo; aserción de paridad con `store-card-list.test.tsx`.

## 5. Verificación
1. E2E backend nuevo en rojo (reproduce CAUSA-2) → fix → verde; suite relacionada (`MyStoresTests`, `DisapprovedStoreBillingViewsTests`, `StorePlanActivation*`) en verde.
2. Frontend: tests targeted + suite completa + typecheck.

## 6. Fuera de alcance
- CAUSA-3 (contrato del toggle binario) — documentado, sin cambios.
- Precios por plan del catálogo (`GetPlansQuery`) — no se tocan.
