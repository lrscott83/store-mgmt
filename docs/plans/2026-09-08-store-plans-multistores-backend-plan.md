# Backend: StorePlans + PlanModule + Módulos MultiStores/WholesaleSales + Precio Warehouses — Plan

- Estado: propuesto (2026-09-08)
- Alcance: **solo backend + migraciones EF + script VPS**. Sin reescritura de gating, sin API, sin frontend en esta iteración.
- Contrato no-negociable: no se toca la lógica que CONSUME el plan (`FilterForBilling`, `ToggleStorePlan`), ni el frontend.

## Contexto y decisiones del usuario (2026-09-08)

| Decisión | Valor |
|---|---|
| Arquitectura de planes | **Gating por StorePlan seleccionado** (el plan determina módulos/features activos) — el gating se implementa en iteración futura; esta iteración crea la infraestructura de datos |
| Catálogo SKU | **Subconjuntos acumulativos** (Gratis ⊆ Pago ⊆ Superior ⊆ VIP) |
| Tabla Plan↔Módulos | **Tabla `StorePlanModule` con conjunto COMPLETO explícito por plan** (no solo los adicionales): Pago lista Gratis+Pago, Superior y VIP listan TODOS |
| Default de tienda nueva | **Plan Pago, sin cobro**: `StorePlanId = Pago (2)`, `PaymentStartDate` sigue `null` (trial). El cobro se activa al pagar |
| Módulo Warehouses | **Actualizar el módulo 13 existente**: `Price 2 → 5`, `PercentDiscountPrice 100 → 50` (efectivo 2.5). Mantiene id/nombre |
| Features Warehouses | **Usar los existentes 36/37** ("Almacenes", "Movimientos de almacén"). Sin cambios de nombres |
| Módulo MultiStores | **Nuevo, id 14**, precio 5, descuento 50% |
| Feature OwnerStores | **Nuevo, id 38**, bajo el módulo 14 |
| Módulo WholesaleSales | **Nuevo, id 12** (no existe; el plan 2026-09-04 es solo frontend, sin implementar). Precio 2, descuento 100% (efectivo 0) |
| Feature WholesaleSales | **Nuevo, id 39** (propuesto, secuencia tras 38), bajo el módulo 12 |
| Alcance de iteración | Solo backend + migración + script VPS |

### Asignación de módulos por plan (conjunto COMPLETO, explícito)

| Plan | Módulos (ids) |
|---|---|
| **Gratis (1)** | Ventas (2), Inventario (3), Sincronización (4), Reportes (5), Gestión (7) |
| **Pago (2)** | = Gratis + Estadísticas (6), Ventas Mayoristas (12), Gastos (8), Facturación (9), Historiales (10), Créditos (11) |
| **Superior (3)** | TODOS los módulos `AvailableToStore` (2,3,4,5,6,7,8,9,10,11,12,13,14) |
| **VIP (4)** | TODOS los módulos `AvailableToStore` (2,3,4,5,6,7,8,9,10,11,12,13,14) |

> Por decisión del usuario: "por ahora el Superior y VIP los tendrán todos". Administración (1) nunca entra (no es `AvailableToStore`).

> ⚠️ **Autorización E2E otorgada (2026-09-08)**: la actualización de precios del módulo 13 rompe `WarehousesCatalogTests`
> (afirma `Price=2f`, `PercentDiscountPrice=100f`, precio efectivo 0, `GetCurrentPrice(2,100,0)`).
> El usuario eligió "Actualizar módulo 13 existente" con la advertencia explícita de que rompe esos E2E,
> lo que constituye autorización para modificar **solo los tests estrictamente afectados por el cambio de precio**.
> No se toca ningún otro test.

## Estado actual (verificado 2026-09-08)

- **No existe** entidad/enum de plan. El plan se deriva de `Store.PaymentStartDate` (null=Free, no-null=Paid) en 17 sitios.
- `FilterForBilling` (StoreBillingUtils) filtra módulos por `billing.Status`: NoAplica → todos; Vencido → solo `PriceIncluded`; resto → todos.
  Se usa en `GetMeQuery`, `ExportOfflineRosterQuery`, `HasPermissionAttribute`.
- Módulo **Warehouses 13** ya existe ("Almacenes", price 2, discount 100%, efectivo 0) + features 36/37 (script 11 de 2026-09-05).
- **WholesaleSales NO existe** como módulo ni feature backend. Solo existe el plan frontend sin implementar
  (`docs/plans/2026-09-04-wholesale-sales-plan.md`) y el enum `OrderType.Mayorista = 2`.
- `ModuleType` termina en Warehouses=13; **el id 12 está libre** (salta de Credits=11 a Warehouses=13).
- `ApplicationDbContext` registra configs en **lista manual** (`AddConfiguration()`), no `ApplyConfigurationsFromAssembly`.
- Patrón catálogo: `Module` (`Entity<int>` + `HasData`, sin TenantId, sin query filter).
- Patrón de creación de varios módulos en una migración: `20250804193255_Add-Expenses-Billing-Histories-Credits-Modules`.
- Patrón cambio de precios: `20260901163808_UpdateModulePricesV3` (UPDATE `Module` + sincroniza `StoreModule` snapshots).

## Diseño

### 1. Entidad `StorePlan` + enum `StorePlanType`

- Enum `StorePlanType` (int) en `Domain/Common/Enums/`: **Gratis=1, Pago=2, Superior=3, VIP=4**, con `[Description]` en español.
- Entidad `StorePlan : Entity<int>` en `Domain/Entities/Plans/`:
  - `Name` (string), `Order` (int), `IsActive` (bool).
  - Precio de plan y cobro real: **TBD** (iteración de gating futura).
- `StorePlanEntityTypeConfiguration`: `HasKey`, `HasData` con los 4 planes (patrón Module), **sin** query filter.

### 2. Tabla `StorePlanModule` (relación Plan ↔ Módulo)

- Entidad `StorePlanModule` en `Domain/Entities/Plans/` (join, patrón `StoreModule`):
  - `PlanId` (int), `ModuleId` (int), PK compuesta (`PlanId`, `ModuleId`).
  - FKs: → `StorePlan` (Restrict), → `Module` (Restrict). Sin TenantId (catálogo global).
- `StorePlanModuleEntityTypeConfiguration`: `HasKey(x => new { x.PlanId, x.ModuleId })`, `HasData` con la
  asignación **completa y explícita** de la tabla "Asignación de módulos por plan".
- ⚠️ **Orden de semillas**: el `HasData` de `StorePlanModule` NO puede insertar filas con `ModuleId` 12/14
  hasta que existan esos módulos (FK Restrict). Por eso la migración de la tabla relación va DESPUÉS de las
  migraciones que crean los módulos nuevos (ver Migraciones).

### 3. `Store.StorePlanId`

- `int` **requerido**, FK → `StorePlan`, `DeleteBehavior.Restrict`.
- Default en BD: `DEFAULT 2` (Pago) — protege inserts fuera de EF.
- Default en código: `CreateStoreService.CreateStoreAsync` fija `StorePlanId = (int)StorePlanType.Pago` al crear.
  ⚠️ OJO: EF insertará `0` si no se setea explícitamente (int no nullable, default CLR 0) → violaría la FK.
  `Store.Create` debe recibir/acomodar el `storePlanId` (p.ej. parámetro con default `StorePlanType.Pago`).
- `PaymentStartDate` **se mantiene null** para tiendas nuevas (trial sin cobro, decisión del usuario).

### 4. Registro en `ApplicationDbContext`

- `DbSet<StorePlan>` + `DbSet<StorePlanModule>` + `ApplyConfiguration` de ambas en `AddConfiguration()`.

### 5. Módulo `MultiStores` (14) + feature `OwnerStores` (38)

- `ModuleType.MultiStores = 14`.
- Módulo 14: Name "MultiStores" (o "Múltiples tiendas", confirmar), `Order=120`, `PriceIncluded=false`, `Price=5`,
  `PercentDiscountPrice=50`, `DiscountPrice=0`, `AvailableToStore=true`, `IsActive=true`.
- `FeatureType.OwnerStores = 38`, Name "OwnerStores" (o "Mis tiendas"), `ModuleId=14`, `Order=74`, `AvailableToStore=true`, `IsActive=true`.
- **Sin asignación per-store inicial** (sin backfill a `StoreModule`/`StoreRoleFeature`): el gating no se toca en esta iteración.

### 6. Módulo `WholesaleSales` (12) + feature `WholesaleSales` (39)

- `ModuleType.WholesaleSales = 12` (id libre; no existe hoy).
- Módulo 12: Name "Ventas Mayoristas", `Order=115`, `PriceIncluded=false`, `Price=2`, `PercentDiscountPrice=100`,
  `DiscountPrice=0` (→ efectivo 0), `AvailableToStore=true`, `IsActive=true`.
- `FeatureType.WholesaleSales = 39` (propuesto, secuencia tras OwnerStores=38), Name "WholesaleSales"
  (o "Ventas Mayoristas"), `ModuleId=12`, `Order=75`, `AvailableToStore=true`, `IsActive=true`.
- **Sin asignación per-store inicial** (idem MultiStores).

### 7. Actualización Warehouses (13) → precio 5 / 50%

- Catálogo: `UPDATE "Module" SET "Price"=5, "PercentDiscountPrice"=50, "DiscountPrice"=0 WHERE "Id"=13`.
- Sincronizar snapshots: `UPDATE "StoreModule" SET "Price"=5, "ModulePrice"=5, "ModulePercentDiscountPrice"=50, "ModuleDiscountPrice"=0 WHERE "ModuleId"=13 AND "ModulePriceIncluded"=false`
  (patrón `UpdateModulePricesV3`). Efectivo resultante: 2.5.
- Features 36/37: **sin cambios**.

## Migraciones EF (4, secuenciales)

1. `Add-StorePlans` — tabla `StorePlan` + seed 4 planes + columna `Store.StorePlanId` con `DEFAULT 2` + FK Restrict.
   - Up: `CreateTable(StorePlan)`, `HasData`, `AddColumn(Store.StorePlanId)`, backfill `UPDATE "Store" SET "StorePlanId" = 2`, `AddForeignKey`.
   - Down: inverso (Drop FK, columna, tabla).
2. `Add-WholesaleSales-And-MultiStores-Modules` — módulos 12 y 14 + features 38 y 39 (INSERTs con id explícito,
   patrón `20250804193255_Add-Expenses-Billing-Histories-Credits-Modules`).
   - Down: DeleteData 39, 38, 14, 12 (orden FK features antes que módulos).
3. `Add-StorePlanModules` — tabla relación + seed completo (ya pueden existir los módulos 12/14).
   - Up: `CreateTable(StorePlanModule)`, `HasData`, FKs.
   - Down: Drop tabla.
4. `Update-Warehouses-Price` — los dos UPDATE del punto 7.
   - Down: revertir a `Price=2, PercentDiscountPrice=100, DiscountPrice=0` (catálogo + snapshots).

## Script VPS (`backend/scripts/`)

Un script **por migración** (convención 1:1 del repo, como el 11):

- `12-20260908-Add-StorePlans.sql`
- `13-20260908-Add-WholesaleSales-And-MultiStores-Modules.sql`
- `14-20260908-Add-StorePlanModules.sql`
- `15-20260908-Update-Warehouses-Price.sql`

Cada uno con header (nombre + migración EF + fecha + parity), `BEGIN;`/`COMMIT;`, inserts/updates con
`ON CONFLICT DO NOTHING` donde aplique, seq fixups (donde hay inserts explícitos), registro en
`__EFMigrationsHistory`, bloque ROLLBACK comentado y verificaciones.

## E2E existentes afectados (autorizados 2026-09-08)

- `Warehouses/WarehousesCatalogTests.cs`:
  - `Migration_seeds_module_13_with_paid_zero_effective_price` → price 2, discount 100, efectivo 0 → **5 / 50 / 2.5**.
  - `Current_price_of_module_13_is_zero` → `GetCurrentPrice(5,50,0) = 2.5` (renombrar test).
- Auditar durante apply (solo si el precio los afecta): `WarehousesBillingTests`, `WarehousesCreateStoreTests`,
  `WarehousesRuntimePathsTests`, `FeaturesActivateTests` (usa `FindAsync(36)`, no afirma precio).

> Los módulos/features NUEVOS (12/14, 38/39) no rompen E2E existentes: no hay test que afirme su ausencia.

## Fuera de alcance (iteraciones futuras)

- Reescribir `FilterForBilling`/`ToggleStorePlan`/`GetStorePlan` para que `StorePlan` sea la decisión de verdad
  (CONSUMIR `StorePlanModule`).
- Precios de los planes, cobro real, período trial.
- API/frontend para ver/cambiar el plan.
- Backfill de `StoreModule`/`StoreRoleFeature` para MultiStores/WholesaleSales (cuando el gating exista).

## Verificación

1. `dotnet build backend/src/SMCA.sln` (o proyectos afectados).
2. `dotnet test backend/src/Application.Tests/Application.Tests.csproj`.
3. `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` (PostgreSQL `smca_test` local) —
   esperar los tests de Warehouses actualizados en verde y el resto intacto.
4. Migraciones locales: `dotnet ef database update` contra `smca` y `smca_test`.
5. Revisar que las 4 migraciones generen los scripts VPS con parity.
6. Verificar la asignación `StorePlanModule` tras la migración: 4 planes con sus módulos completos.

## Impacto visible (único de esta iteración)

Nuevas tiendas se crean con plan **Pago** (antes: sin plan registrado). El gating real sigue por
`PaymentStartDate` hasta la iteración de reescritura. La tabla `StorePlanModule` queda lista para
el gating futuro, con la asignación completa por plan.