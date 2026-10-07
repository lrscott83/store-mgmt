# Migraciones — Guía rápida

## Flujo completo: migración EF Core → script SQL

### 1. Crear la migración EF Core

```bash
cd backend
dotnet ef migrations add <NombreMigracion> --project src/Infrastructure --startup-project src/SMCA.WebApi
```

Esto genera dos archivos en `src/Infrastructure/Migrations/`:
- `YYYYMMDDHHMMSS_<Nombre>.cs` — la migración (Up/Down)
- `YYYYMMDDHHMMSS_<Nombre>.Designer.cs` — snapshot del modelo

Para migraciones de **datos puros** (UPDATE, INSERT), edita el `.cs` y usa `migrationBuilder.Sql(...)` en `Up()` / `Down()`. El `Up()` se genera vacío.

### 2. Aplicar la migración contra las bases de datos

```bash
# Dev (smca)
dotnet ef database update --project src/Infrastructure --startup-project src/SMCA.WebApi \
  --connection "Host=localhost;Database=smca;Username=postgres;Password=postgres"

# Test (smca_test)
dotnet ef database update --project src/Infrastructure --startup-project src/SMCA.WebApi \
  --connection "Host=localhost;Database=smca_test;Username=postgres;Password=postgres"
```

> **Nota:** El `--connection` apunta a la BD exacta. El startup project carga `appsettings.Development.json` por defecto, pero `--connection` lo sobreescribe.

Verificar aplicacion:
```sql
SELECT "MigrationId" FROM "__EFMigrationsHistory" WHERE "MigrationId" LIKE '%<Nombre>%';
```

### 3. Crear el script SQL equivalente

Crea un archivo en `backend/scripts/` con la convencion:

```
NN-nombre-descriptivo.sql
```

donde `NN` es el siguiente numero secuencial (ver archivos existentes).

El script debe incluir:
1. Header con nombre, migracion EF y fecha
2. `BEGIN;` / `COMMIT;` (transaccion)
3. Los UPDATE / INSERT / DELETE necesarios
4. `INSERT INTO "__EFMigrationsHistory" ... ON CONFLICT ("MigrationId") DO NOTHING;`
5. SELECT de verificacion

Ejemplo basado en `09-update-module-prices.sql`:

```sql
-- =====================================================
-- 10: Descripcion corta
-- Migracion EF: YYYYMMDDHHMMSS_NombreMigracion
-- =====================================================

BEGIN;

-- SQL de la migracion (copiar del .cs, pero en SQL plano)
UPDATE "Tabla" SET "Columna" = valor WHERE condicion;

-- Registrar migracion en el historial de EF Core
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('YYYYMMDDHHMMSS_NombreMigracion', '8.0.3')
ON CONFLICT ("MigrationId") DO NOTHING;

COMMIT;

-- Verificar
SELECT * FROM "Tabla" WHERE condicion;
```

El `ProductVersion` debe coincidir con el que registro `dotnet ef database update` (verificar con `SELECT "ProductVersion" FROM "__EFMigrationsHistory" WHERE "MigrationId" = '...'`).

### Scripts aplicados

| # | Script | Migración EF | Descripción |
|---|--------|--------------|-------------|
| 01 | `01-From-Initial-To-Add_Reports_Module.sql` | hasta `20250413185015_Add_Reports_Module` | Reordena features/módulos, activa Reports |
| 02 | `02-20250730201548_Add-StoreUsage-Table.sql` | `20250730201548_Add-StoreUsage-Table` | Tabla StoreUsage |
| 03 | `03-Add-Expenses-Billing-Histories-Credits-Modules.sql` | `20250804193255_Add-Expenses-Billing-Histories-Credits-Modules` | Módulos 8-11 (Gastos/Facturación/Historiales/Créditos) |
| 04 | `04-Add-Inventory-Today-Quantities-And-Today-SalesProfit-Features.sql` | `20260309182537_Add-Inventory-Today-Quantities-And-Today-SalesProfit-Features` | Features 34/35 |
| 05 | `05-20260727-Billing-Migrations.sql` | billing 2026-07-27 | Billing/comisiones |
| 06 | `06-20260728-Backfill-PaymentStartDate.sql` | `20260728194358_Backfill-PaymentStartDate-Null` | Limpieza PaymentStartDate |
| 07 | `07-20260804-Add-OfflineRosterTtlDays.sql` | `20260804125006_Add-OfflineRosterTtlDays` | TTL roster offline |
| 08 | `08-20260806-Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays.sql` | `20260806024450_Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays` | PreHash/refresh tokens/DueSoonDays |
| 09 | `09-update-module-prices.sql` | — | Repricing módulos (v2) |
| 10 | `10-update-module-prices-v3.sql` | `20260901163808_UpdateModulePricesV3` | Repricing módulos (v3): Price=2, 50% |
| 11 | `11-20260905-Add-Warehouses-Module.sql` | `20260905224007_Add-Warehouses-Module` | Módulo 13 Warehouses (precio 2, 100% desc) + features 36/37 + asignación a tiendas activas existentes |
| 12 | `12-20260908-Add-StorePlans.sql` | `20260908194349_Add-StorePlans` | Tabla StorePlan (Gratis/Pago/Superior/VIP) + columna Store.StorePlanId (DEFAULT 2) + FK Restrict |
| 13 | `13-20260908-Add-WholesaleSales-And-MultiStores-Modules.sql` | `20260908194626_Add-WholesaleSales-And-MultiStores-Modules` | Módulos 12 (Ventas Mayoristas) y 14 (Múltiples tiendas) + features 38/39 |
| 14 | `14-20260908-Add-StorePlanModules.sql` | `20260908194919_Add-StorePlanModules` | Tabla StorePlanModule + asignación completa por plan |
| 15 | `15-20260908-Update-Warehouses-Price.sql` | `20260908195026_Update-Warehouses-Price` | Precio módulo 13: 2→5, 100%→50% + sync snapshots StoreModule |
| 18 | `18-20260918-Add-MultiPayments-Module.sql` | `20260918131144_Add-MultiPayments-Module-And-Payment-Mirror` | Módulo 16 MultiPayments (precio 10, 50% desc, solo VIP) + feature 44 + tablas espejo OrderPayment/ChannelExchangeRate + backfill tiendas VIP activas |
| 19 | `19-20260918-Add-Elaboration-Module.sql` | `20260918153139_Add-Elaboration-Module` | Módulo 17 Elaboración (precio 3, 100% desc) + features 120/121 + asignación a Superior/VIP y backfill a tiendas activas existentes |
| 20 | `20-20260920-Backfill-WholesaleSales-MultiStores-RoleFeatures.sql` | `20260920120000_Backfill-WholesaleSales-MultiStores-RoleFeatures` | Backfill StoreRoleFeature 39 (Ventas Mayoristas, OwnerAdmin+StoreUser) y 38 (Mis tiendas, OwnerAdmin) para tiendas activas con módulo 12/14 |
| 24 | `24-20260927-Add-WebCatalog-Module.sql` | `20260927175335_Add-WebCatalog-Module` | Módulo 18 Catálogo web (precio 5, 100% desc, Superior) + feature 122 + backfill a tiendas Superior activas |
| 25 | `25-20260927-Catalog-Product-Fields-And-Images.sql` | `20260927185726_Catalog-Product-Fields-And-Images` | Campos del catálogo web en Product (description, %/monto rebajado, IsNew, Image), slug público en ProductCategory/Store + tabla ProductImage (galería) |
| 26 | `26-20260928-Currency-SalePaymentMethod-And-WebCatalog-Vip.sql` | `20260916213905_AddCurrencyToStoreEntities` + `20260917194809_Add-SalePaymentMethod-Pricing` + `20260928191227_Add-WebCatalog-Module-Vip` | Tres fases: (a) columnas Currency en Product/Order/OrderItem/InventoryEntry/InventoryEntryCost (cierra el hueco del 16/09 que rompía el catálogo con `column p.Currency does not exist`); (b) Order.Percent/Tax/SalePaymentMethod (hueco del 17/09); (c) módulo 18 también para VIP (4) + backfill a tiendas VIP activas (planes autocontenidos; corrige D5) |
| 27 | `27-20260930-Add-Messaging.sql` | `20260929172332_AddMessaging` | Tablas `Conversations` y `Messages` (buzón SuperAdmin ↔ Owner, 1:1 por tienda) |
| 27 | `27-20260930-Plan-Module-Convergence.sql` | `20260930090000_PlanModuleConvergence` | Convergencia de planes: reactiva filas soft-deleted del catálogo sin tocar precios negociados |
| 28 | `28-20261003-Add-Notifications.sql` | `20261003221534_AddNotifications` | Tabla `Notifications` + índices por `CreatedAt` y `ReadAt`. Avisa al SuperAdmin (canónico) cuando se registra un propietario: copia nombre del owner, su teléfono y nombre de la tienda, sin FK ni TenantId (destinatario global, no store-scoped) |
| 29 | `29-20261006-Add-StoreCatalogSettings-Drivers-OrderFields.sql` | `20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields` | Pedidos WhatsApp persistencia (F2): 9 columnas de pedido online en `Order` (`Code`, `DeliveryType`, `Status`, `PaymentStatus`, `CustomerName`, `CustomerPhone`, `DeliveryAddress`, `Notes`, `DriverId`) con índice ÚNICO PARCIAL `("StoreId","Code")` filtrado por `"Code" IS NOT NULL`; tablas `DeliveryDriver` (repartidores, D5) y `StoreCatalogSettings` (config + marca en una fila por tienda, `StoreId` único, D7/D19); feature 123 `Pedidos online` bajo el módulo 18 sembrada por `FeatureEntityTypeConfiguration.HasData` (como las otras 43 features) y por tanto emitida como `InsertData` de EF — el script le añade `ON CONFLICT ("Id") DO NOTHING` para que siga siendo idempotente — más `StoreRoleFeature` para OwnerAdmin (2) y StoreUser (3) en las tiendas con módulo 18 (D15) |

### 4. Commit

```bash
git add backend/src/Infrastructure/Migrations/<archivos> backend/scripts/<script>.sql
git commit -m "feat: <descripcion>"
git push
```

## Convenciones

- **Numeracion de scripts**: secuencial, sin ceros a la izquierda (01, 02, ... 10, 11)
- **`ON CONFLICT DO NOTHING`**: siempre incluirlo para que el script sea idempotente (puede ejecutarse multiples veces sin error)
- **Transaccion `BEGIN/COMMIT`**: los scripts de datos siempre dentro de una transaccion
- **`WHERE` explicito**: usar filtros para evitar UPDATE masivos no intencionales
- **Verificar despues**: siempre incluir un SELECT al final que muestre el resultado esperado

## E2E Guard

`Program.cs` incluye un guard que valida que la BD conectada es `smca_test` cuando se ejecuta en modo Testing. Esto solo afecta al runtime de la app, no a `dotnet ef` CLI. Si ves `[E2E Guard] ConnectionStrings:Application -> Database=...` al correr `dotnet ef`, es normal — solo es un log.
