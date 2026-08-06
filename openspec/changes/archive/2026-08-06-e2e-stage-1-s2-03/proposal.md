# Proposal: Document the OwnerAdmin Can Create Stores — POST /v1/stores Authorization Gap (H-10)

## Intent

S2-03 asserts an OwnerAdmin cannot create a store. That holds only via a frontend accident (`paramId ?? selectedStoreId ?? ''` + `Boolean()`, `edit-store.tsx:33-34`) — the backend has no guard (H-10): `POST /v1/stores` lacks an action-level `[HasPermission]` (`StoresController.cs:83-85`), and `CreateStoreCommand.cs:50-61` explicitly admits OwnerAdmins and re-points their `SelectedStoreId`. Add 2 **passing** .NET E2E tests that document the current defective behavior, pinning the security gap so a future fix cannot land silently. Per the E2E rule: add-only, zero edits to existing tests, zero production code.

## Scope

### In Scope
- New file `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs`, 2 tests:
  1. OwnerAdmin with Stores feature (73) → `POST /api/v1/stores` → 201, store + `StoreModule` persisted, `SelectedStoreId` re-pointed to the new store.
  2. StoreUser with feature 73 (passes class gate; not SuperAdmin/OwnerAdmin) → 400 BadRequest (documents 400-not-403).
- Cleanup honoring seeded-graph order (new store first, then fixture graph).

### Out of Scope
- No production code change — H-10 fix decision deferred to AUTH-facing plans.
- No Playwright (S2-03 UI bullets stay PENDIENTE).
- No edits to existing E2E tests (anonymous 401 already covered, `StoreCreateTests.cs:101`).
- No OwnerAdmin-without-feature scenario (403 at filter; not a story bullet).

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `authorization-e2e`: ADDED requirements under R2 (Stores enforcement window) pinning current behavior — OwnerAdmin direct `POST /v1/stores` → 201 + persistence + `SelectedStoreId` re-point; StoreUser-with-feature-73 → 400 (not 403). Delta MUST carry the coupling note: when H-10 is fixed, these pins flip and MUST be updated in the same change.

## Approach

Per explore.md recommendation: new `[Collection("e2e")]` class mirroring `StoreCreateTests` (request body / persistence asserts) and `StoreAuthorizationTests` (seed/cleanup). Test 1 seeds `StoreSeed.SeedStoresAdminUserAsync`; test 2 seeds `AuthzSeed.SeedStoreUserAsync(factory, grantedFeatureId: AuthzSeed.StoresFeatureId)`. Re-point asserted via DB read with `IgnoreQueryFilters()` (global tenant filter on `User`). Both seeds already proven by passing tests — no seed-helper changes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs` | New | 2 tests documenting H-10 current behavior |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cleanup order: re-pointed `SelectedStoreId` targets new store sharing fixture owner | Med | Delete new store graph first, then `CleanupStoresAdminAsync` |
| Tests pin defective behavior; H-10 fix flips them red | High | Coupling warning in proposal + delta spec: fix MUST update these tests in same change |
| Query filters / NoTracking on DB reads | Med | `IgnoreQueryFilters()`; seeds use `Add(...)` (tracked) — no query-then-mutate |

## Rollback Plan

Delete the single new test file — no other file touched. No migrations, config, or production impact.

## Dependencies

- PostgreSQL `smca_test`; `WebAppFixture` applies migrations.
- Existing seeds (`StoreSeed.SeedStoresAdminUserAsync`, `AuthzSeed.SeedStoreUserAsync`) — unchanged.

## Success Criteria

- [ ] Both new tests pass against real Postgres; they document 201 + persistence + re-point, and 400-not-403.
- [ ] `git diff` confirms add-only: zero changes to existing E2E files, zero production code.
- [ ] Future-fix coupling warning present in proposal and delta spec.
