# Delta for Testing — warehouses-module E2E coverage

**Domain**: `testing` — NEW backend E2E test files for the warehouses module change. Delta spec (ADDED only; no existing test file is modified).

## ADDED Requirements

### WM-TE1 — Catalog post-migration E2E

A NEW E2E test file MUST assert, against the migrated `smca_test` database: Module 13 row shape (all pricing flags, WMC-1), features 36/37 under module 13 (WMC-2), and that `POST /api/v1/Features/activate` stays idempotent with 36 pre-seeded (WMC-2b).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Catalog rows exact | Fixture applied migrations | Test queries Module/Feature | Module 13: Price=2, PercentDiscountPrice=100, DiscountPrice=0, PriceIncluded=false, AvailableToStore=true, IsActive=true; 36/37 under module 13 |
| 1b | Activate idempotent | Feature 36 seeded | activate endpoint called | Succeeds; feature 36 count still 1 |

### WM-TE2 — Assignment SQL re-execution E2E

A NEW E2E test file MUST seed an active store, execute the migration's per-store INSERT-SELECT SQL (extracted verbatim from the migration class) against it, and assert exact StoreModule(13) + StoreRoleFeature(2, 36/37) row shapes (WMA-1a, WMA-2a), including idempotency on second execution (WMA-1c).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Re-executed SQL matches runtime shape | Active store + owner seeded | Migration SQL runs against it | Rows match CreateStoreService-generated shape exactly (snapshot columns, TenantId, IsActive) |
| 2b | Second execution no-op | SQL already applied | SQL runs again | Zero new rows, no error |

### WM-TE3 — Runtime assignment paths E2E

A NEW E2E test file MUST assert Register (WMA-3a) and UpdateStore/ToggleStorePlan (WMA-3b/3c) assign/reactivate module 13 and OwnerAdmin features 36/37 through the normal runtime paths.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Register assigns | New registration request | Register completes | StoreModule(13) + SRF(OwnerAdmin, 36/37) exist |
| 3b | Toggle Paid→Free deactivates | Paid store with module 13 | Toggle to Free | Module 13 StoreModule.IsActive=false + SRFs deactivated |

### WM-TE4 — Billing interaction E2E

A NEW E2E test file MUST assert the module-13 billing shape: Free store with module 13 keeps PlanType "Free" and sees the module (NoAplica passes FilterForBilling); getMe for the store's OwnerAdmin exposes features 36/37 and module 13 (WMC-4a).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Free store keeps module visible | Free store (PaymentStartDate=null) with module 13 | getMe/billing queried | PlanType "Free"; module 13 + features 36/37 exposed to OwnerAdmin |

## Verification Criteria

- [ ] WM-TE1..TE4 files added; zero existing test files modified
- [ ] All new tests green on `smca_test`; existing E2E + unit suites still green
