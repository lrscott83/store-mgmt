# Warehouses Module Catalog Specification

**Domain**: `warehouses-module-catalog` — Module 13 catalog row, features 36/37, pricing, and enum wiring. NEW capability (full spec).

## Purpose

Define the catalog shape and authorization wiring that make Warehouses a first-class paid module (effective price 0) so the menu appears for store owners without any manual `activate` call.

## Requirements

### WMC-1 — Module catalog row

The system MUST seed a `Module` row with Id=13 (`ModuleType.Warehouses`, "Almacenes"), `IsActive=true`, `PriceIncluded=false`, `Price=2`, `PercentDiscountPrice=100`, `DiscountPrice=0`, `AvailableToStore=true`, via `HasData` so migrations apply it to every environment.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Row exists post-migration | Fresh database, migrations applied | Catalog is queried | Module 13 exists with exactly the values above |
| 1b | Effective price is zero | Module 13 loaded | `GetCurrentPrice(2, 100, 0)` is evaluated | Result is 0 |

### WMC-2 — Feature catalog rows

The system MUST seed `Feature` rows Id=36 ("Almacenes", warehouse CRUD) and Id=37 (`WarehouseStockMovements`, "Movimientos de almacén"), both with `ModuleId=13`, `AvailableToStore=true`, `IsActive=true`. Feature 36 MUST stop being runtime-only.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Features exist post-migration | Fresh database, migrations applied | Catalog queried | 36 and 37 exist under module 13, active, available |
| 2b | No duplicate from activate | Feature 36 pre-seeded | `POST /api/v1/Features/activate` runs | No duplicate row, no error (create-branch inert) |

### WMC-3 — Enum and role wiring

`ModuleType.Warehouses` MUST equal 13; `FeatureType.WarehouseStockMovements` MUST equal 37. `StoreRoleFeatures` MUST contain `WarehousesAdmin` (feature 36, module 13) and `WarehouseStockMovementsAdmin` (feature 37, module 13), both gated to `RoleType.OwnerAdmin` ONLY. `StoreRoleFeature` generation MUST NOT grant 36/37 to `StoreUser` through these entries.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Generator emits OwnerAdmin rows only | Generator invoked with features [36, 37] | StoreRoleFeatures generated | Exactly two rows: (OwnerAdmin, 36), (OwnerAdmin, 37); no StoreUser row |

### WMC-4 — Menu visibility for owners

After assignment, an OwnerAdmin of a store with module 13 active MUST see the warehouses menu entry (frontend gate: feature 36). A StoreUser without the feature MUST NOT.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Owner sees menu | OwnerAdmin re-login, module 13 active on store | getMe payload built | FeatureIds contain 36 (and 37), StoreModuleIds contain 13 |

## Verification Criteria

- [ ] Module 13 row shape exact (WMC-1) on migrated `smca_test`
- [ ] Features 36/37 seeded under module 13 (WMC-2); activate idempotent
- [ ] Generator emits OwnerAdmin-only rows (WMC-3)
- [ ] getMe exposes 36/37 + module 13 for OwnerAdmin (WMC-4)
