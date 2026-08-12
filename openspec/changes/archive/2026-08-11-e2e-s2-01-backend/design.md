# Design: e2e-s2-01-backend — Cerrar el hueco E2E de S2-01 (módulos + StoreRoleFeature)

## Technical Approach

New ADD-only test file `backend/src/SMCA.WebApi.E2ETests/Stores/StoreModuleLifecycleTests.cs` affirming aserciones 1–4 of `docs/testing/e2e-stage-1/S2-01-backend.md`: 2 GET tests (R1, R2) + 2 PUT tests (R3, R4). Follows the suite pattern (`[Collection("e2e")]`, `WebAppFixture`, SuperAdmin + `AuthedClient`, cleanup `try/finally`). Every direct read of `StoreModule`/`StoreRoleFeature` uses `.IgnoreQueryFilters()` (tenant filters: `StoreModuleEntityTypeConfiguration.cs:21`, `StoreRoleFeatureEntityTypeConfiguration.cs:19`). No production code, no existing tests touched.

## Architecture Decisions

| # | Decision | Options considered | Choice + rationale |
|---|----------|-------------------|--------------------|
| D1 | R1 precondition | (a) Direct seed of inactive `StoreModule` as Added entity; (b) prior PUT that deactivates | **(a)**. Isolates R1 to the GET include-filter (`StoreRepository.cs:73,83`); a prior PUT couples R1 to the R3 deactivation path — one regression would fail both without saying which. Added entity (`Create` + `IsActive = false` + `Add`) is tracked regardless of global NoTracking — zero trap risk (`DeactivateStoreAsync`'s load+`AsTracking`+mutate also valid but unnecessary) |
| D2 | R2 identity assertion | (a) Assert `ModuleDto.Id` set == DB `ModuleId` set; (b) assert against hardcoded `{7,6}` | **(a)**. `StoreModule` has no row id (composite PK `StoreId+ModuleId`, `EntityTypeConfiguration.cs:25`; non-generic `Entity` base) — the US's "not row id" reduces to "response id == DB `ModuleId`". Reading the DB pins `ModuleProfile.cs:22` and survives catalog additions |
| D3 | R3 seed | (a) Seed SRF with real feature 60 (module 6), role OwnerAdmin; (b) arbitrary feature id | **(a)**. The handler only deactivates SRFs whose `Feature.AvailableToStore && moduleIds.Contains(Feature.ModuleId)` (`StoreRoleFeatureRepository.cs:27-28`) — a foreign feature would be silently ignored and the assert would fail on a wrong seed. FK `Restrict` also requires a real catalog Feature row |
| D4 | R4 expected set | (a) Compute from enum + `HasRoles`; (b) hardcode `{(OwnerAdmin,60)}` | **(a)**. Replicate generator (`StoreRoleFeatureGenerator.cs:17-37`): features of module 6 from `Feature` table (`IsActive && AvailableToStore`), then `StoreRoleFeatures` values where `HasFeature`, one SRF per `GetRoles()` via `GetFeatureType()`. Matches spec R4; robust to catalog/attr changes |
| D5 | Store seeding | Per-test: R1/R3 `StoreSeed.SeedStoreAsync(approved, [7,6])`; R2 `BillingSeed.SeedPaidStoreAsync`; R4 `BillingSeed.SeedFreeStoreAsync` | Existing helpers, correct FK/tenant/UserRole shape; cleanup via `CleanupStoreFixtureAsync` / `BillingSeed.CleanupAsync` respectively |
| D6 | Docs | `S2-01.md` + `S2-01-backend.md` updated; `README.md` untouched | Spec coverage note; README needs no state change |

## Data Flow

```
R1: SeedSuperAdmin ── StoreSeed [7] ── Add StoreModule(6, IsActive=false) ── GET ── assert Modules.Ids == {7} (vs DB {7,6})
R2: SeedSuperAdmin ── SeedPaidStore [7,6] ── GET ── assert Modules.Ids == DB ModuleIds {7,6}
R3: SeedSuperAdmin ── SeedStore [7,6] ── seed SRF(OwnerAdmin, 60) active ── PUT [7] ── assert StoreModule(6).IsActive=false ∧ SRF(60).IsActive=false
R4: SeedSuperAdmin ── SeedFreeStore [7] ── PUT [7,6] ── assert SRF rows == expected((RoleId,FeatureId)) from enum+Feature table, all IsActive=true
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Stores/StoreModuleLifecycleTests.cs` | Create | 4 tests, R1–R4; helpers below |
| `docs/testing/e2e-stage-1/S2-01-backend.md` | Modify | Resolve plan: 4 aserciones cubiertas por `StoreModuleLifecycleTests.cs` (refs por test) |
| `docs/testing/e2e-stage-1/S2-01.md` | Modify | Estado de cobertura .NET: añadir refs a `StoreModuleLifecycleTests.cs` (aserciones líneas 72–73, 76–77) |

## Interfaces / Contracts

Test-class shape (follows `StoreUpdateTests.cs:12-27`):

```csharp
[Collection("e2e")]
public sealed class StoreModuleLifecycleTests
{
    private readonly AppTestFactory _f;
    public StoreModuleLifecycleTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(Guid bodyId, string name, IEnumerable<int> moduleIds); // StoreUpdateTests.cs:23
    private async Task SeedInactiveStoreModuleAsync(Guid storeId, int moduleId, Guid tenantId); // D1: Create+IsActive=false+Add
    private async Task<List<int>> GetStoreModuleIdsAsync(Guid storeId);                    // IgnoreQueryFilters
    private async Task<List<StoreRoleFeature>> GetStoreRoleFeaturesAsync(Guid storeId);    // IgnoreQueryFilters
    private async Task<List<(int RoleId, int FeatureId)>> ComputeExpectedSrfAsync(Guid tenantId, List<int> moduleIds); // D4
}
```

`ComputeExpectedSrfAsync`: `Feature` where `moduleIds.Contains(ModuleId) && IsActive && AvailableToStore` (replicates `FeatureRepository.cs:25-30`), then `((StoreRoleFeatures[])Enum.GetValues(...)).Where(srf => featureIds.Any(srf.HasFeature)).SelectMany(srf => srf.GetRoles().Select(r => ((int)r, (int)srf.GetFeatureType()!.Value)))`. Requires `using Domain.Common.Extensions;` (E2E project references Domain; `BillingSeed.cs` already imports `Domain.Common.*`).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E (real Postgres) | R1 GET excludes inactive module | Seed `[7]` + inactive 6; GET 200; `Modules.Ids == {7}`; DB cross-check `GetStoreModuleIdsAsync` |
| E2E | R2 ids are catalog ids | Paid store `[7,6]`; GET 200; `Modules.Ids` set-equals DB `ModuleId` set |
| E2E | R3 PUT removal deactivates SRF | Seed SRF `(OwnerAdmin, 60)`; PUT `[7]`; 200; StoreModule(6).IsActive==false ∧ SRF(60).IsActive==false (DB, IgnoreQueryFilters) |
| E2E | R4 PUT add generates SRF | Free store; PUT `[7,6]`; 200; SRF (RoleId,FeatureId) set == `ComputeExpectedSrfAsync([6])`, all IsActive==true |

**Test names** (`Verbo_condición_esperado`): `Get_returns_only_active_modules_when_inactive_module_seeded` · `Get_returns_catalog_module_ids` · `Put_removing_module_deactivates_its_store_role_features` · `Put_adding_module_generates_store_role_features`.

**Line estimate**: file ≈ 220 lines (4×~30 + helpers ~70 + scaffolding ~30); doc diffs ≈ +25/−15. Total ≪ 400 ✓.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Pure DB-driven API test file.

## Migration / Rollout

No migration. No feature flags. Rollback: `git reset` of `feat/e2e-s2-01-backend`; new tests are removable without touching the suite.

## Risks for Apply

| Risk | Mitigation |
|------|-----------|
| Read without `.IgnoreQueryFilters()` → 0 rows (tenant filters) | Mandatory on every `StoreModule`/`StoreRoleFeature`/`Feature` read in tests |
| R3 SRF seeded with feature not `AvailableToStore` of module 6 → handler ignores it | Seed real feature `(int)FeatureType.Dashboard` (60), module 6, role `(int)RoleType.OwnerAdmin` (enum `DashboardAdmin`, `StoreRoleFeatures.cs:173-176`) |
| R4 expected hardcoded → fragile | `ComputeExpectedSrfAsync` from enum + Feature table (D4) |
| NoTracking trap on load-then-mutate | R1 uses Added entity; if load-based path used, `AsTracking()` (pattern `DeactivateStoreAsync`) |
| PUT validation rejects body | Body mirrors `StoreUpdateTests.cs:23-27` (non-empty Name, non-empty ModuleIds) |
| `SeedFreeStoreAsync` PUT `[7,6]` auto-sets `PaymentStartDate` (side effect) | Harmless for R4; do not assert PaymentStartDate |

## Open Questions

None — all resolved in spec + verified code reading.
