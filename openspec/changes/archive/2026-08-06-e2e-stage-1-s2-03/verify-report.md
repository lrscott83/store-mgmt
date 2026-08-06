```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:0dfed88b53520a6d05ab68929905f5e10efdd707fe738cafac8e992c5eaecaf3
verdict: pass
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 2/2
test_command: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-build --filter "FullyQualifiedName~StoreCreateAuthorizationGapTests"
test_exit_code: 0
test_output_hash: sha256:1b0f8a83a895ab5b0791acfde97638b51106c056ac2e83649cd52fa57588ec67
build_command: dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-dependencies
build_exit_code: 0
build_output_hash: sha256:6b7b993aab4cfd3c57ab5846d3bfe241f549f55b1fa1297131834d10aa667c83
```

## Verification Report

**Change**: e2e-stage-1-s2-03 — Document OwnerAdmin direct POST /v1/stores (H-10 gap) as E2E
**Version**: N/A (first delta for `authorization-e2e`)
**Mode**: Standard (approval/characterization tests; zero production code by mandate — Strict TDD RED not applicable)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 12 |
| Tasks complete | 12 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: ✅ Passed (exit 0)
```text
dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-dependencies
```
(no-dependencies because the dev server may lock bin/Debug; tests ran with `--no-build`.)

**Tests**: ✅ 2 + 57 passed / ❌ 0 failed / ⚠️ 0 skipped
```text
1) Focused: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-build --filter "FullyQualifiedName~StoreCreateAuthorizationGapTests"
   Passed!  - Failed: 0, Passed: 2, Skipped: 0, Total: 2   (exit 0)

2) Regression: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-build --filter "FullyQualifiedName~SMCA.WebApi.E2ETests.Stores"
   Passed!  - Failed: 0, Passed: 57, Skipped: 0, Total: 57  (exit 0)
```
Note: `ErrorHandlerMiddleware` ERR stack traces in both logs are expected — the middleware logs every 4xx-producing exception (including the pinned 400 in test 2). Both runs ended `Passed!`.

**Coverage**: ➖ Not available (E2E approval suite; no coverage tooling configured for the E2ETests project)

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R2.10 | OwnerAdmin with Stores feature creates a store via the API | `StoreCreateAuthorizationGapTests > OwnerAdmin_with_stores_feature_can_create_store_directly_and_repoints_selected_store_id` | ✅ COMPLIANT — passed in focused run |
| R2.11 | StoreUser with Stores feature reaches the handler and is rejected | `StoreCreateAuthorizationGapTests > Store_user_with_stores_feature_gets_400_not_403` | ✅ COMPLIANT — passed in focused run |

**Compliance summary**: 2/2 scenarios compliant

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| R2.10 | ✅ Implemented | 201 Created + Succeeded + `Location == /api/v1/stores/{id}`; `Store` + `StoreModule` rows persisted via `IgnoreQueryFilters`; `User.SelectedStoreId == created && != sa.StoreId` (re-point); ordered cleanup `CleanupStoreAsync(created)` then `CleanupStoresAdminAsync(sa)` (lines 37-59) |
| R2.11 | ✅ Implemented | 400 BadRequest (not 403) + Succeeded=false + Errors non-empty; no `Store` row for the unique name via `IgnoreQueryFilters`; `CleanupStoreGraphAsync` (lines 70-83) |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D-1 New file, not append | ✅ Yes | New `StoreCreateAuthorizationGapTests.cs`; `StoreCreateTests.cs` untouched |
| D-2 One test: 201 + persistence + re-point | ✅ Yes | Single seed chain, ordered asserts |
| D-3 Re-point via DB read + `IgnoreQueryFilters` | ✅ Yes | `Set<User>().IgnoreQueryFilters().FirstAsync(...)` |
| D-4 Cleanup ordering — new store graph FIRST | ✅ Yes | `CleanupStoreAsync` then `CleanupStoresAdminAsync` (shared fixture owner, FK-safe) |
| D-5 400 + no Store row | ✅ Yes | Both spec clauses pinned; optional `NotAuthorized` key replaced by generic envelope pin — see WARNING |

### Issues Found
**CRITICAL**: None
**WARNING**:
- D-5 optional clause deviation (non-blocking, non-spec-breaking): test 2 asserts the generic envelope (`Succeeded == false`, `Errors` non-empty) instead of the optional `NotAuthorized` error key in `Errors`. Apply documented the root cause: `ErrorHandlerMiddleware.cs:61` maps `ApiException.ActionCode` into `Description`, so `Code` would be `"App.Unexpected"` — asserting the key as-written would be wrong. R2.11 requires only 400 + no Store row; both clauses are pinned and green.

**SUGGESTION**:
- Coupling (spec R2.10/R2.11 + design + tasks): when H-10 is fixed — action-level `[HasPermission(SuperAdmin)]` or removal of the re-point branch at `CreateStoreCommand.cs:57-61` — these two tests and the spec MUST be updated in the same change. Carry this into the archive step so the coupling note survives.
- Test 2's extra envelope asserts (lines 73-75) are a harmless superset of D-5's chosen option; keep or drop in a future cleanup — cosmetic only.

### Verdict
PASS WITH WARNINGS — all 12 tasks complete, build clean, 2/2 spec scenarios covered by passing tests (focused 2/2), 57/57 Stores-area regression green, add-only commit confirmed; one non-blocking design deviation (D-5 optional clause) documented with rationale.
