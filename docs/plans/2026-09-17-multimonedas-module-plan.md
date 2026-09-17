# Plan — Módulo MultiMonedas (15) para planes Superior y VIP

**Fecha:** 2026-09-17 · **Rama:** dev · **Estado:** EN IMPLEMENTACIÓN

## 1. Resumen

Nuevo módulo **MultiMonedas (15)** — replicando el patrón exacto de MultiStores (14) — asignado a los planes **Superior y VIP**. Con el módulo activo se puede **seleccionar la moneda** (CUP, USD, EUR, CLA, MLC, CAD, MXN) en toda forma que capture precio/costo. **Regla de carrito:** una orden no puede mezclar productos de monedas distintas. **Etiqueta de moneda siempre visible** en los precios de producto ("2 000 CUP"), sin el signo `$` (incluye header y carrito). Totales mezclados se **desglosan por moneda** (nunca se suman monedas distintas). Migración EF + backfill + script VPS.

## 2. Backend (patrón exacto de MultiStores)

| Pieza | Cambio |
|---|---|
| `Domain/Common/Enums/ModuleType.cs` | `MultiMonedas = 15` (`[Description("Múltiples monedas")]`) |
| `Domain/Common/Enums/FeatureType.cs` | `MultiMonedas = 43` (`[Description("MultiMonedas")]`) |
| `ModuleEntityTypeConfiguration.cs` | Seed `Module.Create(15, "Múltiples monedas", 125, false, 3, 0, 100, true, true)` (precio 3 USD, 100 % descuento) |
| `FeatureEntityTypeConfiguration.cs` | Seed `Feature.Create(43, "MultiMonedas", "...", module 15, order 76, true, true)` |
| `StorePlanModuleEntityTypeConfiguration.cs` | `(Superior, 15)` y `(VIP, 15)` |
| **Migración EF** | `Add-MultiMonedas-Module`: InsertData Module(15)/Feature(43) + backfill de tiendas existentes (clase `MultiMonedasModuleBackfill.cs`, espejo de `WarehousesModuleBackfill`) |
| **Backfill** | Tiendas `StorePlanId IN (3,4)` → `StoreModule(15)` + `StoreRoleFeature` feature 43 para roles OwnerAdmin/StoreUser, `ON CONFLICT DO NOTHING` |
| **Script VPS** | `backend/scripts/13-20260917-Add-MultiMonedas-Module.sql` — mismo contenido que la migración + registro en `__EFMigrationsHistory` (patrón del script 12) |
| `RegisterCommand` / `StoreRoleFeatureGenerator` / `ChangeStorePlan` | **Cero cambios**: iteran el catálogo, el módulo se propaga solo |

## 3. Frontend — módulo y gates

- `EModules.MultiMonedas = 15` + `EFeatures.MultiMonedas = 43` en `packages/domain/src/enums`.
- Gate: `isModuleAvailable(user, EModules.MultiMonedas)` (idéntico a MultiStores).

## 4. Frontend — formato de moneda

- Util `formatMoneyWithCurrency(amount, currency)` → `"2 000 CUP"`, `"10 USD"` (mantiene agrupamiento NBSP, sufijo del código en lugar del `$`).
- Aplica a: precios de producto (listas de venta), carrito (ítems + total del header/cart shell), cotización y rangos mayoristas, modales de producto.
- Agregados históricos legacy (cuadres, gastos, créditos) no cambian salvo convivencia de monedas (§6).

## 5. Frontend — selector de moneda

- En toda forma con precio/costo: producto (+ mayoristas), entradas de inventario, gastos, venta. `<select>` con los 7 códigos, default CUP, visible **solo con MultiMonedas activo**; sin el módulo todo queda CUP.
- La moneda se guarda en `currency` de los modelos (ya existe — FROZEN).
- Créditos/pagos heredan la moneda de la orden.

## 6. Regla de carrito — una sola moneda por orden

- `currency-guard.ts` (espejo de `order-type-guard.ts`): primer ítem fija `cartCurrency`; producto de otra moneda → alerta bloqueante, no se agrega (también en escáner).
- `Order.currency` = moneda del carrito.
- **Totales por moneda**: ventas del día, órdenes, dashboard, cuadre, créditos agrupan por moneda; total primario (CUP) + chips de desglose ("30 USD · 5 EUR").

## 7. Tests E2E

**Nuevos (libres):**
- Backend `MultiMonedasModuleTests.cs`: catálogo (15 en Superior/VIP, no en Gratis/Pago), register propaga 15/43, cambio de plan, `/me`, billing Vencido, backfill.
- Frontend Playwright `multimonedas.spec.ts`: selector con/sin módulo, producto USD muestra "10 USD", carrito rechaza mezcla, total del header con moneda.

**EXISTENTES que rompen — permiso 1 a 1 (innegociable):**

| # | Test | Qué prueba | Causa simple | Propuesta |
|---|---|---|---|---|
| B1 | `StorePlanCatalogTests.cs:72` | Catálogo de planes bien formado | Conjunto exacto de módulos de Superior sin 15 | Añadir 15 a la lista esperada |
| B2 | `StoreCreatePlanTests.cs:110,146` | Tienda nueva recibe catálogo completo | Lista exacta de ids disponibles creció | Añadir 15 a las dos listas |
| B3 | `StorePlanChangeTests.cs:128,331` | Activos/inactivos tras cambio de plan | Conjuntos exactos incluyen 15 para Superior/VIP | Añadir 15 donde corresponda |
| B4 | `AuthMePlanModulesTests.cs:127,425` | `/me` expone módulos/features | Lista exacta + mapa `14 => [38]` sin `15 => [43]` | Añadir el par y el id |
| B5 | `ExportOfflineRosterPlanTests.cs` (7 sitios) | Roster offline respeta módulos/features | Fixtures y mapas sin 15/43 | Añadir `(15,3,100)` y `15 => [43]` |
| F1 | `csv-import-duplicate-reimport.spec.ts` | Reimportar CSV actualiza precios | Precio muestra "150 CUP" no "$150" | Cambiar expectativas |
| F2 | `mayorista-sale.spec.ts` | Venta mayorista completa | Precios con etiqueta de moneda | Cambiar a "9 CUP", "216 CUP"… |
| F3 | `create-sale.spec.ts` | Venta normal completa | Precio con etiqueta | Ajustar texto esperado |

## 8. Unit tests (libres)

- `enums.test.ts`: EModules/EFeatures MultiMonedas.
- `currency-guard.test.ts`: paridad de reglas.
- `format-money-with-currency.test.ts`: formato NBSP + sufijo, negativos, cero.
- Agregador por moneda: mezcla no suma.
- Backend `Application.Tests`: seeds del catálogo, paridad FeatureType.

## 9. Verificación (Readme del root)

- Frontend: `tsc --noEmit` + `eslint --max-warnings=0` + `vitest` completo.
- Backend: `dotnet build` + `Application.Tests` (no E2E salvo suite nueva + autorizados 1 a 1).

## 10. Orden de implementación

1. Este doc → 2. Backend enums + seeds + migración + backfill + script VPS → 3. Frontend enums/gates → 4. Formato con moneda + displays → 5. Selector en forms → 6. currency-guard + agregaciones por moneda → 7. Unit tests → 8. E2E nuevos → 9. Verificación.
