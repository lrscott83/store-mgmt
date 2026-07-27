# Features E2E Tests

## Intent

Implement E2E tests for all 3 `FeaturesController` endpoints against real Postgres, pinning behavior + auth + activate non-idempotent contract. Leverage existing auth-e2e harness (DbTestHelpers, StoreSeed, ApiResponse, WebAppFixture).

## Scope

### In Scope
- **3 endpoints**: `GET all/{includeInactive}`, `POST activate`, `GET available`
- **37 tests** across 9 files + 1 `FeatureSeed` helper under `SMCA.WebApi.E2ETests/Features/`
- **Inline auth matrix**: 401/403 per endpoint (NOT delegated to existing auth tests)
- **activate snapshot/restore**: seed snapshot BEFORE, restore in `finally` (shared seed mutation)
- **09c gap scenarios**: non-bool route, 405 verbs, unordered pin, DTO shape, Administration exclusion, inactive module/feature, Egress create/duplicate, missing row tolerance, inactive Management module
- **Fixed discrepancies**: `CleanupStoresAdminAsync` (was `CleanupStoresAdminUserAsync`), `float StatisticsPrice` (was `decimal`)

### Out of Scope
- Dead handler gate tests (deferred to handler unit tests per plan §7)

## Approach

Reuse existing `[Collection("e2e")]` harness. SuperAdmin seed cheapest passing actor. Activate tests snapshot `Module(6,5)` + `Feature(60,50,33)` before, restore in `finally`. 09c gap tests extend `FeatureSeed` with insert/delete helpers for inactive features, inactive modules, Egress management.

## Files

| File | Tests | Role |
|------|-------|------|
| `Features/FeatureSeed.cs` | helper | Snapshot/restore + gap helpers |
| `FeaturesListTests.cs` | 4 | Happy path, toggle, DTO shape, no-order |
| `FeaturesListAuthTests.cs` | 5 | 401/403 + malformed token |
| `FeaturesActivateTests.cs` | 2 | Snapshot, non-idempotent pin |
| `FeaturesActivateAuthTests.cs` | 4 | 401/403 |
| `FeaturesAvailableTests.cs` | 2 | SuperAdmin + StoresAdmin |
| `FeaturesAvailableAuthTests.cs` | 4 | 401/403 matrix |
| `FeaturesListGapTests.cs` | 4 | Non-bool, shape, unordered, malformed |
| `FeaturesActivateGapTests.cs` | 5 | Egress create/dup, missing row, 405, body |
| `FeaturesAvailableGapTests.cs` | 7 | Admin excl, inactive, order, 405, MGMT |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| NoTracking on DbContext — `FindAsync` misses restore | High | FeatureSeed.RestoreAsync must use `.AsTracking()` or attach before SaveChangesAsync |
| activate mutates SHARED seed — tests collide | Med | Snapshot BEFORE, restore in `finally` + `[Collection("e2e")]` serializes per-class |
| FK on TodayReports(50) deletion | Med | Check StoreRoleFeature refs; delete/recreate child rows or pick FK-free target |
| Verb-mismatch tests: ASP.NET may return 404 not 405 | Low | Use `BeOneOf(404, 405)` like the test plan does for non-bool |

## Known Bugs (pinned, not fixed)

- **activate non-idempotent return**: 1st call → `true`, 2nd → `false`. Pin both; update if contract is later made idempotent.
- **Dead handler gates** (redundant `IsSuperAdmin` checks in `activate`/`available`): unreachable — covered by handler unit tests in separate task.

## Rollback

Revert the commit: `git revert HEAD`. Tests only — no prod code change, zero deployment risk.

## Dependencies

E2E harness already exists on disk (auth-e2e pilot completed). No external dependencies.

## Success Criteria

- [ ] All 37 tests pass against real Postgres (`dotnet test --filter Features`)
- [ ] activate tests leave shared seed exactly as found (verified by snapshot diff before/after)
- [ ] Auth matrix: each endpoint rejects 4 actor types (no-token + 3 role types) correctly
