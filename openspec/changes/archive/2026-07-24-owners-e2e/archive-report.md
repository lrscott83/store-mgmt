# Archive Report: owners-e2e

**Archived**: 2026-07-24
**Status**: ✅ PASS WITH WARNINGS

---

## Change Summary

Covered all 5 `OwnersController` endpoints (List, GetById, Create, Update, Delete) with exhaustive E2E tests — happy paths, validation errors, handler gate role exclusions, and the confirmed delete-500 NRE bug. No application code changes.

## What Was Delivered

| Metric | Value |
|--------|-------|
| Test files | 9 files in `SMCA.WebApi.E2ETests/Owners/` |
| Total tests | 25 (22 planned, 3 extra from scope expansion) |
| Endpoints covered | 5 (List, GetById, Create, Update, Delete) |
| App code changes | **NONE** — pure test-only change |
| Tasks | 10/10 complete |

### Delivered Files

| File | Tests | Description |
|------|-------|-------------|
| `OwnersListTests.cs` | 2 | SuperAdmin + ReSeller list (200) |
| `OwnersGetByIdTests.cs` | 3 | Happy, nonexistent, empty GUID |
| `OwnersCreateTests.cs` | 1 | Full persistence (Tenant+User+Owner+Role) |
| `OwnersCreateValidationTests.cs` | 7 | Empty Login/Password/FullName/Cellphone, invalid Email, nonexistent ReSellerId, duplicate Login |
| `OwnersUpdateTests.cs` | 4 | Happy update + nonexistent Id + empty FullName + invalid Email |
| `OwnersDeleteTests.cs` | 3 | Bug-pin 500 + nonexistent Id + ReSeller guard |
| `OwnersCreateGapTests.cs` | 1 | Create as ReSeller (200) |
| `OwnersUpdateGapTests.cs` | 2 | Empty CellPhone + nonexistent ReSellerId |
| `OwnersListGapTests.cs` | 2 | `includeInactive` true/false |

## Test Results Summary

- **25/25 tests PASS** (100%)
- **Full suite** (148 total E2E tests across all suites): all pass
- **Environment**: Real Postgres `smca_test`
- **Build**: No build config changes (SDK-style .csproj)

## Known Bugs Still Open

| Bug | Endpoint | Detail |
|-----|----------|--------|
| **Delete-500 NRE** | `DELETE /api/v1/Owners/{id}` | `_storeUserRepository` declared at line 19 but never injected into `DeleteOwnerCommandHandler` constructor (lines 24-40). NRE at line 74 on any authorized delete. **Status**: bug-pinned in test as expected 500. Fix when DI is corrected. |

## Design Decisions Followed

| Decision | Chosen Approach |
|----------|----------------|
| Helpers | Inline (file-static) per file — no shared helper class |
| SuperAdmin auth | `SeedSuperAdminAsync` — matches existing E2E pattern |
| ReSeller auth | `SeedUserWithRoleAsync` — lighter than AuthzSeed |
| CellPhone casing | Create → `Cellphone` (lower-p), Update → `CellPhone` (upper-P) — matches validators exactly |
| Field naming | Single `_f: AppTestFactory` field |

## Artifact Lineage (Observation IDs)

| Artifact | Engram ID | Filesystem |
|----------|-----------|------------|
| `explore` | — | `openspec/changes/archive/2026-07-24-owners-e2e/explore.md` |
| `proposal` | #232 | `openspec/changes/archive/2026-07-24-owners-e2e/proposal.md` |
| `spec` | #233 | `openspec/changes/archive/2026-07-24-owners-e2e/spec.md` + `openspec/specs/owners/spec.md` |
| `design` | — | `openspec/changes/archive/2026-07-24-owners-e2e/design.md` |
| `tasks` | — | `openspec/changes/archive/2026-07-24-owners-e2e/tasks.md` |
| `verify-report` | #237 | `openspec/changes/archive/2026-07-24-owners-e2e/verify-report.md` |
| `archive-report` | _(current)_ | `openspec/changes/archive/2026-07-24-owners-e2e/archive-report.md` |

## Risks Carried Forward

| Risk | Severity | Recommendation |
|------|----------|----------------|
| Delete-500 NRE blocks delete happy path | HIGH | Fix `DeleteOwnerCommandHandler` DI (inject `IStoreUserRepository`), then update bug-pin test to expect 200 |
| FeatureType.Owners without `[HasModule]` | MEDIUM | Future E2E exploration needed for StoreUser-with-Owners-feature behavior |
| EF Core NoTracking on FullName persistence | LOW | Document app-level limitation in design doc if needed |

## Next Recommendations

1. **Fix the delete-500 NRE bug** — inject `IStoreUserRepository` into `DeleteOwnerCommandHandler`, then update `Delete_owner_currently_returns_500` to assert 200 instead
2. **No other follow-up** — all 5 endpoints have full coverage, all 25 tests pass consistently