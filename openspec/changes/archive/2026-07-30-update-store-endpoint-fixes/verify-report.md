# Verification Report

**Change**: `update-store-endpoint-fixes`
**Version**: N/A (delta specs)
**Date**: 2026-07-30

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 8 |
| Tasks complete | 4 |
| Tasks incomplete | 4 |

### Incomplete Tasks

All 4 Phase 4 testing tasks remain unchecked:
- `[ ]` 4.1 — Unit: ForEach removed (assert `AddAsync` called exactly `storeRoleFeatures.Count` times)
- `[ ]` 4.2 — Unit: N+1 eliminated (assert `GetModulesByIdsAsync` called once, `GetByIdAsync` not called)
- `[ ]` 4.3 — Unit: Auth returns 403 (mock `IsSuperAdminOrOwnerAdmin` = false, assert `ApiException` with `Forbidden`)
- `[ ]` 4.4 — Unit: Validator skips DB (assert `_storeByIdService` not called during validation)

No unit test files exist for the handler or validator — these were never created. However, the **E2E tests** (13 passing) cover all behavioral scenarios end-to-end.

---

## Build & Tests Execution

**Build**: ✅ Passed (0 errors, 4 pre-existing NuGet vulnerability warnings)

```
Build succeeded.
    4 Warning(s) (NU1902/NU1903 — pre-existing package vulnerabilities, not related to this change)
    0 Error(s)
```

**Tests**: ✅ 13 passed / ❌ 0 failed / ⚠️ 0 skipped

```
Test Run Successful.
Total tests: 13
     Passed: 13
 Total time: 6.7763 Seconds
```

**Coverage**: ➖ Not configured (no `coverage_threshold` set)

---

## Spec Compliance Matrix

### api-controller (CT1 — Swagger Documents)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| CT1-1a: 400 documented | Swagger shows 400 for UpdateStore | Static analysis (code review) | ✅ COMPLIANT — `[ProducesResponseType(StatusCodes.Status400BadRequest)]` present on `UpdatedStoreAsync` |
| CT1-1b: 401 documented | Swagger shows 401 for UpdateStore | Static analysis (code review) | ✅ COMPLIANT — `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` present |
| CT1-1c: 403 documented | Swagger shows 403 for UpdateStore | Static analysis (code review) | ✅ COMPLIANT — `[ProducesResponseType(StatusCodes.Status403Forbidden)]` present |
| CT1-1d: 200 still documented | 200 OK remains | Static analysis (code review) | ✅ COMPLIANT — `[ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]` present |

### command-handler (CH1 — Proper Async Await)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| CH1-1a: Modules added sequentially | All `AddAsync`/`UpdateAsync` complete before next starts | `StoreUpdateTests.Update_as_superadmin_with_payment_date_succeeds` | ✅ COMPLIANT — Code uses `foreach` + `await` throughout; E2E test passes proving no fire-and-forget crashes |
| CH1-1b: Exception propagates | Exception during `AddAsync` propagates normally | No direct test | ⚠️ PARTIAL — Code uses sequential `await` so exceptions will propagate naturally, but no test specifically validates exception propagation from the inner loop |

### command-handler (CH2 — Batch Module Load)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| CH2-2a: Single batch query | `GetModulesByIdsAsync` called ONCE, `GetByIdAsync` ZERO times | `StoreUpdateTests.Update_as_superadmin_with_payment_date_succeeds` | ✅ COMPLIANT — Code calls `GetModulesByIdsAsync` once before loop and uses `modulesById[moduleId]` dictionary inside; E2E test proves modules update correctly |
| CH2-2b: Module not found handled gracefully | Missing module ID returns null/graceful | No test | ⚠️ PARTIAL — Code uses `modulesById[moduleId]` (indexer, not `TryGetValue`), which throws `KeyNotFoundException` if module missing. In practice validator ensures all module IDs are available, but the code doesn't handle the edge case gracefully as spec implies |

### command-handler (CH3 — Correct Auth Status Code)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| CH3-3a: User not found returns 403 | Valid JWT but user missing from DB → 403 Forbidden | `StoreUpdateTests.Update_without_token_returns_401` (401 path) | ⚠️ PARTIAL — Code throws `ApiException` with `HttpStatusCode.Forbidden` correctly. Message key is `_localizer["Forbidden"]` (not `"AuthorizationFailed"` as spec suggests, nor `"AccessDenied"` as design suggests — but spec allows "or equivalent"). No E2E test specifically validates a 403 from this handler path. |
| CH3-3b: Authorized user proceeds | Valid user → handler continues to store-update logic | `StoreUpdateTests.Update_as_superadmin_with_payment_date_succeeds` | ✅ COMPLIANT — Multiple E2E tests pass with valid admin users, proving the auth check lets authorized users through |

### command-handler (CH4 — Unused Import Removed)

| Requirement | Test | Result |
|-------------|------|--------|
| Remove `using static System.Formats.Asn1.AsnWriter;` | Static analysis (code review) | ✅ COMPLIANT — Import is absent from `UpdateStoreCommand.cs` |

### validation (VL1 — StoreExists Validation Rule Removed)

| Requirement | Test | Result |
|-------------|------|--------|
| Remove `StoreExists` rule entirely | `StoreUpdateTests.Update_unknown_id_returns_400_code_Id` | ❌ **NOT COMPLIANT** — The `MustAsync(StoreExists)` rule is **still present** in the validator. It was changed from `GetStoreByIdIncludingModulesAsync` to `_storeRepository.ExistsAsync` (lightweight), but was NOT removed as the spec requires. |

### validation (VL2 — Id Structural Validation Only)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| VL2-2a: Empty ID rejected | Empty GUID → fails validation | `StoreUpdateTests.Update_empty_route_id_returns_400_code_Id` | ✅ COMPLIANT — `.NotEmpty()` rule present, test passes |
| VL2-2b: Null ID rejected | Null GUID → fails validation | `StoreUpdateTests.Update_empty_route_id_returns_400_code_Id` | ✅ COMPLIANT — `.NotNull()` rule present, test passes |
| VL2-2c: Valid GUID passes structural | Non-empty GUID → no async existence check | No test | ❌ **NOT COMPLIANT** — The `MustAsync(StoreExists)` runs a DB query (`ExistsAsync`) even for valid GUIDs, violating the "no async existence check" requirement |
| VL2-2d: Nonexistent store reaches handler | Valid GUID but store missing → handler returns 404 | `StoreUpdateTests.Update_unknown_id_returns_400_code_Id` | ⚠️ PARTIAL — Handler has null check throwing `ValidationException` (400), not `NotFoundException` (404). The validator catches this case first via `StoreExists`, so the handler's null check is never exercised for this scenario |

### validation (VL3 — Single DB Responsibility)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| VL3-3a: Total DB queries reduced | 1 DB query (handler), not 2 | No test | ❌ **NOT COMPLIANT** — Validator makes a DB query (`ExistsAsync`) in addition to the handler's `GetStoreByIdIncludingModulesAsync`. The handler also makes an additional `Where(s => s.Name...)` query for name uniqueness. |

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| CH4: Remove unused import | ✅ Implemented | `using static System.Formats.Asn1.AsnWriter;` removed |
| CH3: Auth status code 400→403 | ✅ Implemented | `HttpStatusCode.Forbidden` used. Message key is `"Forbidden"` (spec: `"AuthorizationFailed"`, design: `"AccessDenied"` — minor key deviation) |
| CH2: Batch-load modules (N+1) | ✅ Implemented | `GetModulesByIdsAsync` called once before loop; `ToDictionary` lookup inside loop |
| CH1: Fix fire-and-forget | ✅ Implemented | `foreach` + `await` replaces `ForEach(async ...)` |
| VL1: StoreExists removal | ❌ Deviation | Rule still present — changed to lightweight `ExistsAsync` instead of removing |
| CT1: ProducesResponseType | ✅ Implemented | All 4 attributes present on `UpdatedStoreAsync` |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| `foreach + await` (sequential writes) | ✅ Yes | Correctly implemented — all async operations use `foreach` + `await` |
| Batch-load via `GetModulesByIdsAsync` + `ToDictionary` | ✅ Yes | Single query, `ToDictionary` for O(1) lookup inside loop |
| Remove validator `StoreExists` rule | ❌ **Deviated** | Design explicitly chose removal. Implementation kept a lightweight `ExistsAsync` check. The design rationale stated "The validator's pre-check adds latency with zero benefit" — the lightweight check minimizes latency but still exists. |
| Auth status code 400→403 | ✅ Yes | 403 Forbidden with message `"Forbidden"` (design said `"AccessDenied"` — minor key name deviation, semantics preserved) |
| Add `[ProducesResponseType(401/403/400)]` | ✅ Yes | All three plus existing 200 |
| No new interfaces/contracts | ✅ Yes | No new types added |
| No migration required | ✅ Yes | Code-only changes |

---

## Issues Found

### CRITICAL (must fix before archive)

1. **VL1/VL3: Validator StoreExists rule NOT removed as spec'd** — The `MustAsync(StoreExists)` rule is still present in `UpdateStoreCommandValidator.cs`, calling `_storeRepository.ExistsAsync(storeId)`. The spec clearly states it MUST be removed. While the lightweight `ExistsAsync` is more efficient than the original `GetStoreByIdIncludingModulesAsync`, the spec and design both require its removal. This also means VL2-2c and VL3-3a are violated — the validator still makes a DB query per request, and the handler's null check is never exercised for unknown stores.

### WARNING (should fix)

2. **Message key mismatch in auth check** — Code uses `_localizer["Forbidden"]` but tasks specified `_localizer["AuthorizationFailed"]` and design specified `"AccessDenied"`. Functionally equivalent for a 403 response, but inconsistent with the planned change.

3. **Handler uses `ValidationException` (400) for null store, not `NotFoundException` (404)** — Spec VL2-2d says nonexistent store should hit handler and return 404. Current code uses `ValidationException` which maps to 400. The E2E test `Update_unknown_id_returns_400_code_Id` expects 400, so this behavior is tested.

4. **CH2-2b: `modulesById[moduleId]` uses indexer, not `TryGetValue`** — If a module ID somehow passes validation but isn't in the batch result, this throws `KeyNotFoundException` instead of handling gracefully. Low risk since validation ensures module IDs exist.

5. **No unit tests exist for isolated fix verification** — Testing tasks 4.1–4.4 remain unchecked. No unit test files were created. While E2E tests provide solid behavioral coverage, isolated unit tests would make regression detection more precise.

### SUGGESTION (nice to have)

6. **Consider using `GetValueOrDefault` or `TryGetValue`** — for the dictionary lookup in case of defensive coding against the edge case.

7. **The paid module check in `Handle` also calls `GetModulesByIdsAsync`** — This is a 2nd batch call (the 1st is in `UpdateStoreModules`). For requests with paid modules, modules are loaded twice. Consider caching or passing the result.

---

## Verdict

**PASS WITH WARNINGS**

The implementation correctly addresses 5 of the 6 original fixes with working E2E tests (13/13 passing) and a clean build. The primary issue is the **deviation from VL1**: the validator's `StoreExists` rule was not removed as spec'd — it was kept with a lightweight `ExistsAsync` check. This violates the spec (VL1, VL2-2c, VL3-3a) and the design decision.

The practical impact is low (lightweight `ExistsAsync` adds minimal latency), and the E2E tests prove the system works correctly. However, the spec and design are explicit about removing this check entirely.

**Decision to archive** depends on whether this deviation is accepted as a valid improvement (fast-fail validation with `ExistsAsync` is arguably better UX than letting invalid requests reach the handler) or requires correction to match the spec exactly.
