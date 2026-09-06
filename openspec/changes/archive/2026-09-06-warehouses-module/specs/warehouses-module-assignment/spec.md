# Warehouses Module Assignment Specification

**Domain**: `warehouses-module-assignment` — Migration-driven assignment of module 13 + features 36/37 to stores, and the mirrored VPS script. NEW capability (full spec).

## Purpose

Define how the EF migration grants the Warehouses module and its features to already-existing active stores, and how the VPS SQL script replicates the migration exactly for production.

## Requirements

### WMA-1 — Migration assigns module to existing active stores

The EF migration MUST insert, for every existing store with `IsActive=true`, a `StoreModule` row `(StoreId, ModuleId=13)` with the module's price snapshot (`ModulePrice=2`, `ModulePriceIncluded=false`, `ModuleDiscountPrice=0`, `ModulePercentDiscountPrice=100`, `Price=2`), `TenantId` from the store, `IsActive=true`, audit columns set. Insertion MUST be idempotent (`ON CONFLICT DO NOTHING`) and MUST skip inactive stores.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Active store gets module | One active store exists pre-migration | Migration runs | StoreModule row exists with exact snapshot values |
| 1b | Inactive store skipped | One inactive store pre-migration | Migration runs | No StoreModule row for it |
| 1c | Idempotent re-run | Migration SQL executed twice | Second execution | No duplicate rows, no error |

### WMA-2 — Migration grants features to OwnerAdmin of those stores

The migration MUST insert `StoreRoleFeature` rows `(StoreId, RoleId=OwnerAdmin(2), FeatureId=36)` and `(StoreId, RoleId=2, FeatureId=37)` for every existing active store, with `TenantId` from the store and audit columns set. Idempotent, skipping inactive stores.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | OwnerAdmin rows created | Active store pre-migration | Migration runs | Two SRF rows (36, 37) for RoleId=2 exist |
| 2b | StoreUser gets nothing | Active store pre-migration | Migration runs | No SRF row for RoleId=3 (StoreUser) |

### WMA-3 — New and runtime stores get the module automatically

Because `AvailableToStore=true`, the runtime paths (Register, CreateStore, UpdateStore, ToggleStorePlan Free→Paid) MUST assign module 13 and generate OwnerAdmin features 36/37 with no code change.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Register assigns | New owner+store registration | Register completes | Store has module 13 + OwnerAdmin SRF rows for 36/37 |
| 3b | CreateStore assigns | Admin creates a store with modules | CreateStore completes | Same rows exist |
| 3c | Toggle Free→Paid keeps module | Paid store toggled to Free | Toggle completes | Module 13 StoreModule deactivated (IsActive=false) + SRFs deactivated, consistent with other paid modules |

### WMA-4 — VPS script mirrors the migration

`backend/scripts/11-*.sql` MUST replicate the migration's catalog inserts and per-store INSERT-SELECTs exactly (same values, same idempotency), inside a transaction, with `setval` fix-ups for Feature/Module sequences, a `__EFMigrationsHistory` registration, and verification SELECTs.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Script re-executes migration SQL on seeded store | Active store seeded, migration SQL extracted | Script's per-store block runs against it | Rows identical to migration-applied state |
| 4b | Script idempotent | Script run twice | Second run | No duplicates, no errors |

### WMA-5 — Rollback

The migration `Down` MUST remove per-store rows (StoreRoleFeature first, then StoreModule) and catalog rows. The VPS script MUST document/perform the inverse operations inside a transaction.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Down reverts assignment | Migration applied | Down runs | StoreModule(13)/SRF rows removed; catalog rows removed |

## Verification Criteria

- [ ] Active-store assignment exact shape (WMA-1/2) incl. idempotency
- [ ] Runtime paths assign module 13 (WMA-3)
- [ ] Script 11 parity + idempotency proven (WMA-4)
- [ ] Down reverts cleanly (WMA-5)
