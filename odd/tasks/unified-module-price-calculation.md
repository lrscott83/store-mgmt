# Feature: unified-module-price-calculation

Rama: `dev`. Alcance: **backend (producción, AUTORIZADO explícitamente por el usuario 2026-10-02)** + `frontend-react/` + E2E (**AUTORIZADO** actualizar 4 specs + 1 fixture).

## Objetivo

Un **único método** (backend) y su **espejo en frontend** que, dada una colección de módulos, calcule el precio total aplicando siempre las mismas reglas. Usado en **todos** los lugares que hoy calculan precios de módulos.

## La regla única (definida por el usuario)

Dado un conjunto de módulos, el total suma el **precio efectivo** (`price − price×percent/100 − discount`, topado en 0) **solo** de los módulos que cumplen:

- `IsActive = true` → un módulo **inactivo no suma**. Regla fija, no se toca.
- `PriceIncluded = false` → un módulo **incluido no suma**. Regla fija, no se toca.

El **llamador** decide qué colección pasa: el plan le pasa sus módulos, la tienda los suyos, el modal de precios los marcados. El método aplica las condiciones.

Importante: la agrupación visual por plan **no cambia**. `groupModulesByPlanDelta` sigue particionando las filas (garantiza que las filas aplanadas sean el payload de guardado sin duplicados); lo que cambia es de qué coleção se saca el **total** del pie de cada grupo: la **membresía acumulada** del plan, no el delta.

## Dónde está hoy el cálculo (inventario verificado)

### Ya cumplen la regla (se refactorizan para llamar al método, SIN cambio de número)
- `backend/src/Application/Services/Billing/BillingService.cs:80-83`
- `backend/src/Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommand.cs:78-80`
- `backend/src/Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs:93-96`

### No cumplen (se corrigen)
| Site | Qué calcula | Qué le falta |
|---|---|---|
| `Application/Mappings/Administration/PlanProfile.cs:17-19` | precio del plan | activo + `PriceIncluded` |
| `Domain/Common/Utils/PlanPricingUtils.cs:19-33` | precio del plan (duplicado) | igual; se pliega en el método único |
| `Application/Services/Billing/BillingService.cs:114-118` | monto del mes | precio crudo del catálogo, sin descuento ni activo |
| `Application/Mappings/StoreManagement/StoreProfile.cs:54-57` | total tarjeta owner | cuenta módulos gratis |
| `.../Queries/GetStoreModulePricing/GetStoreModulePricingQuery.cs:87-125` | total lectura modal | sin `PriceIncluded` |
| `.../Commands/UpdateStoreModulePricing/UpdateStoreModulePricingCommand.cs:258-284` | total guardado modal | solo `IsSelected` |
| `.../Commands/UpdateModuleCatalogPricing/UpdateModuleCatalogPricingCommand.cs:119-142` | total catálogo | ni activo ni `PriceIncluded` |
| `app/admin/modules/components/module-catalog-table.tsx:157-158` | pie por plan (**delta**) ← bug reportado | debe usar la membresía acumulada + regla |
| `app/management/stores/components/plan-panels.tsx:105-107` | encabezado del plan | sin condiciones |
| `packages/domain/src/commons/module-pricing.ts:54-62` (`totalCurrentModulePrice`) + `store-module-pricing-modal.tsx:115-124` | total del modal | solo `isSelected` |

## Pasos

### T1 — Backend: método único
- NUEVO en `backend/src/Domain/Common/Utils/`: un calculador con la regla (activo + `!PriceIncluded` + `GetCurrentPrice`, clamp 0, sin redondeo, paridad float32).
- Debe servir las dos formas de entrada que existen en el dominio: módulo de catálogo (`Module`) y snapshot de tienda (`StoreModule`, con sus campos `ModulePriceIncluded`/`ModulePercentDiscountPrice`/`ModuleDiscountPrice`).
- Reemplazar la lógica duplicada de `PlanPricingUtils.Sum`.
- Tests unitarios del método: inactivo no suma, `PriceIncluded=true` no suma, descuentos, clamp en 0, colección vacía.

### T2 — Backend: aplicar en todos los sitios
- Los 6 sitios de la tabla de arriba + refactorizar los 3 que ya cumplen para que llamen al método (mismo número).
- `BillingService.CurrentMonthAmount`: dejar de usar precio crudo del catálogo y pasar a la regla.
- Actualizar los tests unitarios afectados (`BillingServiceTests`, etc.).

### T3 — Backend: forma del wire
- Exponer `IsActive` en `ModuleDto` y `PlanModuleDto` (hoy ausentes).
- Exponer `PriceIncluded` en las filas de store-pricing (`StoreModulePricingRow`, `StoreModulePricingPayload`, `StoreModulePricingReadDto`, y sus equivalentes backend) — hoy la regla no es expresable.
- Cambios ADITIVOS.

### T4 — Frontend: espejo en el dominio
- Espejo del método en `packages/domain/src/commons/module-pricing.ts`, con la misma regla y las mismas condiciones.
- `ModulePricingRow` / filas de store-pricing: añadir `isActive` y `priceIncluded` a los tipos.
- `Module.isActive`, `PlanModule.isActive` en `packages/domain/src/models/store.ts`.
- `currentModulePrice` se conserva (ya es el espejo de `GetCurrentPrice`).

### T5 — Frontend: aplicar en los sitios
- `module-catalog-table.tsx`: el pie de cada grupo suma la **membresía acumulada** del plan (mapeando `plan.modules` por `moduleId` a la fila editable, para conservar el recálculo vivo por tecla). El grupo catch-all (sin plan que lo reclame) conserva su propia suma.
- `plan-panels.tsx`: encabezado del plan con la regla.
- `store-module-pricing-modal.tsx`: `liveTotal` con el método (colección = filas marcadas); se retira `totalCurrentModulePrice` o pasa a delegar en el método único.
- Tests unitarios de los tres.

### T6 — E2E (autorizado)
- `backend/src/SMCA.WebApi.E2ETests/Stores/StoreModulePricingTests.cs:428-481`
- `backend/src/SMCA.WebApi.E2ETests/Stores/ModuleCatalogPricingTests.cs:275-290`
- `frontend-react/e2e/store-module-pricing.spec.ts` (números `85/90/36/25/8.5 USD`)
- `frontend-react/e2e/module-catalog-pricing.spec.ts:430-452`
- `frontend-react/e2e/support/store-module-pricing-fixture.ts:207-236` (espejo del agrupamiento) y `:437-444` (espejo de la fórmula) — deben reflejar la regla nueva, no solo los números.
- Prohibido tocar CUALQUIER otro E2E.

### T7 — Verificación
- Backend: `dotnet test` Application.Tests + el proyecto de tests. E2E backend requiere PostgreSQL en `localhost:5432` (`smca_test`).
- Frontend: `pnpm turbo run typecheck lint test --force`.
- Reportar números reales; nada de "verde" sin correr.

## Restricciones

- **Nunca** tocar/leer `frontend/` (Angular).
- E2E: solo los 5 archivos de T6.
- No agregar `Co-Authored-By`.
- Sin redondeo nuevo: el clamp en 0 y la fórmula son los existentes; no introducir precisión que no existe.

## Criterios de aceptación

- Un solo método define el total; todo sitio que calcula precio de módulos lo usa.
- Módulo inactivo no suma en ningún sitio. Módulo `PriceIncluded=true` no suma en ningún sitio.
- `admin/modules`: el pie de Superior/VIP refleja la membresía acumulada del plan, no el delta.
- El total del modal de precios de tienda = lo que la tienda paga de verdad.
- typecheck/lint/tests unitarios verdes; E2E actualizados y coherentes con la regla.

## Progreso

- [x] T1 Backend método único — commit `e042072d`
- [x] T2 Backend aplicar en todos los sitios — commit `96a132aa`
- [x] T3 Backend forma del wire — commit `96a132aa`
- [x] T4 Frontend espejo en el dominio — commit `3e05fbad`
- [x] T5 Frontend aplicar en los sitios — commit `3e05fbad`
- [x] T6 E2E autorizados — commit `da8e701b`

## Corrección de un error mío (2026-10-02)

Durante T5 salió a la luz que **8 tests unitarios estaban fallando por la feature anterior** (no por flakiness):

- `storage-keys.test.ts` y `store-data-reset.test.ts` fijaban 15 entidades en `BUSINESS_ENTITY_NAMES`; T1 de la feature de monedas añadió `storeCurrencyConfig` (16).
- `cart-currency-select.test.tsx`: 6 tests fijaban el gate por **módulo 16**; T3 lo cambió a **módulo 15**.

Yo los había atribuido erróneamente a la flakiness conocida de `auth-store.offline` al correr la suite completa. Arreglados en `1ff0fd3d`. La regla para la próxima: cuando la suite completa falla, **aislar cada archivo** antes de declarar "preexistente".

## Evidencia de verificación (2026-10-02)

- Backend `dotnet test src/SMCA.sln` → **EXIT 0**
  - `Domain.UnitTests` 105/105
  - `Application.Tests` 555/555
  - `SMCA.WebApi.E2ETests` **678/678** (con PostgreSQL real en `localhost:5432/smca_test`)
- Frontend `vitest run` (suite completa del app) → **339 archivos / 4973 tests, 0 fallos**
- Frontend `typecheck` y `lint` → exit 0 (`@store-mgmt/domain` y `@store-mgmt/web-store-pos`)
- E2E de Playwright **no ejecutado** (requiere dev server); los specs se actualizaron y se type-checkearon aparte con `tsc --strict` (solo 3 errores preexistentes en el fixture, ninguno de este cambio).

## Resultado final

- Un solo método (`ModulePriceCalculator`) + un solo espejo (`totalModulePricing`). Los 11 sitios de backend y los 3 de frontend pasan por él.
- El bug reportado (`admin/modules` sumando el delta) está corregido: el pie de cada plan usa su membresía **acumulada**.
- El modal de precios de tienda muestra el monto real facturable.
- Wire shape solo aditiva: `ModuleDto.IsActive`, `PlanModuleDto.IsActive`, `PriceIncluded` en las filas de store-pricing y del catálogo.

## Commits (rama dev)

- `e042072d` feat(pricing): add the single module price rule (active and not included)
- `96a132aa` refactor(pricing): route every backend price total through the single rule
- `3e05fbad` refactor(pricing): mirror the single rule in the frontend and apply it
- `1ff0fd3d` test(currency): update storage registry and cart currency gate expectations
- `da8e701b` test(e2e): realign pricing E2E with the single module price rule

Sin push todavía (decisión del usuario).