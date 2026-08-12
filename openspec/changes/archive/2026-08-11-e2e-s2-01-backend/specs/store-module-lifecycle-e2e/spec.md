# store-module-lifecycle-e2e Specification

**Purpose**: E2E coverage (.NET) for the `StoreModule`/`StoreRoleFeature` lifecycle behind `GET /api/v1/stores/{id}` and `PUT /api/v1/stores/{id}` — aserciones 1-4 de la US S2-01 (DG-7). Closes the gap where those assertions were marked `[x]` with no test affirming them. Test file: `backend/src/SMCA.WebApi.E2ETests/Stores/StoreModuleLifecycleTests.cs` (2 tests GET + 2 tests PUT). No production behavior changes; ADD-only.

**Harness**: `[Collection("e2e")]` + `WebAppFixture`; SuperAdmin via `DbTestHelpers.SeedSuperAdminAsync` + `DbTestHelpers.AuthedClient` (SuperAdmin passes `[HasPermission]` without SRF); cleanup in `try/finally`. Every direct read of `StoreModule`/`StoreRoleFeature` MUST use `.IgnoreQueryFilters()` (tenant filters: `StoreModuleEntityTypeConfiguration.cs:21`, `StoreRoleFeatureEntityTypeConfiguration.cs:19`).

## Requirements

### R1: GET returns only active modules (aserción 1)

`GET /api/v1/stores/{id}` SHALL return only the store's active modules: a `StoreModule` with `IsActive = false` MUST NOT appear in `StoreDto.Modules` (include filtrado — `StoreRepository.cs:73,83`).

#### Scenario: Inactive module excluded
- GIVEN a SuperAdmin authenticated, and a store whose modules include 7 (active) and 6 with `IsActive = false` seeded directly in DB (row verified by direct read with `.IgnoreQueryFilters()`)
- WHEN `GET /api/v1/stores/{id}`
- THEN status is 200 and response `Modules` contains module 7 but NOT module 6

### R2: GET module ids are catalog ids (aserción 2)

Each `ModuleDto.Id` in `StoreDto.Modules` SHALL equal the catalog `StoreModule.ModuleId`, not the `StoreModule` row id (`ModuleProfile.cs:22`).

#### Scenario: Ids match catalog
- GIVEN a SuperAdmin authenticated and a paid store via `BillingSeed.SeedPaidStoreAsync` (modules 7 + 6), whose `StoreModule` row ids are read directly with `.IgnoreQueryFilters()`
- WHEN `GET /api/v1/stores/{id}`
- THEN every `Modules[].Id` equals that module's catalog `ModuleId` (7 or 6) and is different from the `StoreModule` row id

### R3: Removing a module deactivates its StoreRoleFeature (aserción 3)

`PUT /api/v1/stores/{id}` whose body omits a currently assigned module SHALL set that module's `StoreModule.IsActive = false` and its `StoreRoleFeature` rows `IsActive = false` (`UpdateStoreCommand.cs:113-131`, via `StoreRoleFeatureRepository.cs:25-32`).

#### Scenario: SRF deactivated on removal
- GIVEN a SuperAdmin authenticated, a store with modules 7 + 6, and active `StoreRoleFeature` rows for feature 60 (module 6, `AvailableToStore`) covering the roles in `HasRoles` — seeded and verified with `.IgnoreQueryFilters()`
- WHEN `PUT /api/v1/stores/{id}` with `moduleIds: [7]`
- THEN status is 200 and, read with `.IgnoreQueryFilters()`, the module 6 `StoreModule` row has `IsActive = false` and every `StoreRoleFeature` of feature 60 has `IsActive = false`

### R4: Adding a module generates StoreRoleFeature (aserción 4)

`PUT /api/v1/stores/{id}` whose body adds a new module SHALL generate `StoreRoleFeature` rows for that module's features, one per role in `HasRoles`, filtered by the `StoreRoleFeatures` enum (`UpdateStoreCommand.cs:133-147`, `StoreRoleFeatureGenerator.cs:17-37`). The expected set MUST be computed from the enum + `HasRoles`, not hardcoded.

#### Scenario: SRF generated on insert
- GIVEN a SuperAdmin authenticated and a free store via `BillingSeed.SeedFreeStoreAsync` (only module 7)
- WHEN `PUT /api/v1/stores/{id}` with `moduleIds: [7, 6]`
- THEN status is 200 and, read with `.IgnoreQueryFilters()`, new `StoreRoleFeature` rows exist for module 6 features (feature 60, `AvailableToStore`) with `IsActive = true`, one per role in `HasRoles`, matching the set computed from `StoreRoleFeaturesExtensions`

## Coverage Note (docs sync)

- **Antes**: `Stores/StoreGetByIdTests.cs` affirms 200 + DTO shape but never `IsActive` nor id identity; `StoreRoleFeature` only asserted in Owners/Features/Users/StoreCreate tests, never on the store-update path.
- **Después**: `StoreModuleLifecycleTests.cs` affirms aserciones 1-4 of S2-01 against real Postgres with `.IgnoreQueryFilters()`.
- **Sync docs**: `docs/testing/e2e-stage-1/S2-01.md` (estado de cobertura .NET) y `S2-01-backend.md` (plan resuelto, 4 aserciones cubiertas); `README.md` sin cambios.
