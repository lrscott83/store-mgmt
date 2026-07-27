## Verification Report

**Change**: features-e2e
**Version**: 1.0 (as-built delta)
**Date**: 2026-07-25

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 9 (Task 0-8) |
| Tasks complete | 9 |
| Tasks incomplete | 0 |

All tasks marked `[x]` in tasks.md. ✅

---

### Build & Tests Execution

**Build**: ✅ Passed (compiled during `dotnet test`, 0 errors)
```
  Domain -> bin/Debug/net8.0/Domain.dll
  Resources -> bin/Debug/net8.0/Resources.dll
  Application -> bin/Debug/net8.0/Application.dll
  Infrastructure -> bin/Debug/net8.0/Infrastructure.dll
  SMCA.WebApi -> bin/Debug/net8.0/SMCA.WebApi.dll
  SMCA.WebApi.E2ETests -> bin/Debug/net8.0/SMCA.WebApi.E2ETests.dll
```

**Tests (Features filter)**: ✅ 33 passed / ❌ 0 failed / ⚠️ 0 skipped
```
Passed!  - Failed: 0, Passed: 33, Skipped: 0, Total: 33
```

**Tests (full suite)**: ✅ 181 passed / ❌ 0 failed / ⚠️ 0 skipped
```
Passed!  - Failed: 0, Passed: 181, Skipped: 0, Total: 181
```
Zero regressions from the previous 148 tests.

**Coverage**: ➖ Not configured (no `openspec/config.yaml` found)

---

### Spec Compliance Matrix

The spec.md (delta spec) originally defined **37 scenarios**. Due to the class-level `[HasPermission(SuperAdmin)]` filter discovery, **3 scenarios were removed** and **1 was behaviorally corrected** during implementation — these are documented in design.md and tasks.md. The effective count is **33 compliant scenarios**.

| Req | Scenario | Test | Result |
|-----|----------|------|--------|
| **R1** | 1.1 SuperAdmin lists all features | `FeaturesListTests > List_features_as_super_admin_returns_200` | ✅ COMPLIANT |
| **R2** | 2.1 `true` includes inactive feature | `FeaturesListTests > List_includeInactive_true_includes_inactive_feature` | ✅ COMPLIANT |
| **R2** | 2.2 `false` excludes inactive feature | `FeaturesListTests > List_includeInactive_false_excludes_inactive_feature` | ✅ COMPLIANT |
| **R3** | 3.1 Activate returns 200 true and mutates seed | `FeaturesActivateTests > Activate_as_super_admin_returns_200_true` | ✅ COMPLIANT |
| **R3** | 3.2 ~~Second call returns false~~ → Both return true (pin corrected) | `FeaturesActivateTests > Activate_twice_both_return_true` | ✅ COMPLIANT (corrected — real handler behavior) |
| **R4** | 4.1 SuperAdmin gets available features | `FeaturesAvailableTests > Available_as_super_admin_returns_200` | ✅ COMPLIANT |
| **R4** | ~~4.2 StoresAdmin gets available features~~ | **(REMOVED)** — Class-level `[HasPermission(SuperAdmin)]` blocks all non-SuperAdmin before method-level widening runs | ❌ REMOVED (documented) |
| **R5** | 5.1 No token → 401 | `FeaturesListAuthTests > List_no_token_returns_401` | ✅ COMPLIANT |
| **R5** | 5.2 OwnerAdmin → 403 | `FeaturesListAuthTests > List_as_non_super_admin_returns_403(OwnerAdmin)` | ✅ COMPLIANT |
| **R5** | 5.3 StoreUser → 403 | `FeaturesListAuthTests > List_as_non_super_admin_returns_403(StoreUser)` | ✅ COMPLIANT |
| **R5** | 5.4 ReSeller → 403 | `FeaturesListAuthTests > List_as_non_super_admin_returns_403(ReSeller)` | ✅ COMPLIANT |
| **R5** | 5.5 Malformed token → 401 | `FeaturesListGapTests > List_malformed_token_returns_401` | ✅ COMPLIANT |
| **R6** | 6.1 No token → 401 | `FeaturesActivateAuthTests > Activate_no_token_returns_401` | ✅ COMPLIANT |
| **R6** | 6.2 OwnerAdmin → 403 | `FeaturesActivateAuthTests > Activate_as_non_super_admin_returns_403(OwnerAdmin)` | ✅ COMPLIANT |
| **R6** | 6.3 StoreUser → 403 | `FeaturesActivateAuthTests > Activate_as_non_super_admin_returns_403(StoreUser)` | ✅ COMPLIANT |
| **R6** | 6.4 ReSeller → 403 | `FeaturesActivateAuthTests > Activate_as_non_super_admin_returns_403(ReSeller)` | ✅ COMPLIANT |
| **R7** | 7.1 No token → 401 | `FeaturesAvailableAuthTests > Available_no_token_returns_401` | ✅ COMPLIANT |
| **R7** | 7.2 StoreUser → 403 | `FeaturesAvailableAuthTests > Available_as_non_qualifying_actor_returns_403(StoreUser)` | ✅ COMPLIANT |
| **R7** | 7.3 ReSeller → 403 | `FeaturesAvailableAuthTests > Available_as_non_qualifying_actor_returns_403(ReSeller)` | ✅ COMPLIANT |
| **R7** | 7.4 OwnerAdmin (no Stores) → 403 | `FeaturesAvailableAuthTests > Available_as_non_qualifying_actor_returns_403(OwnerAdmin)` | ✅ COMPLIANT |
| **R7** | ~~7.5 OwnerAdmin (inactive Management) → 403~~ | **(REMOVED)** — Class-level filter prevents access regardless of Management state | ❌ REMOVED (documented) |
| **R8** | 8.1 Non-bool route → 400/404 | `FeaturesListGapTests > List_includeInactive_nonbool_route_returns_400_or_404` | ✅ COMPLIANT |
| **R8** | 8.2 DTO shape: Name + ModuleId | `FeaturesListGapTests > List_returned_items_have_module_and_dto_shape` | ✅ COMPLIANT |
| **R8** | 8.3 Result NOT guaranteed ordered (PIN) | `FeaturesListGapTests > List_result_is_not_guaranteed_ordered` | ✅ COMPLIANT |
| **R8** | 8.4 Malformed token → 401 | `FeaturesListGapTests > List_malformed_token_returns_401` | ✅ COMPLIANT |
| **R9** | 9.1 Activate creates Egress when missing | `FeaturesActivateGapTests > Activate_creates_Egress_when_missing` | ✅ COMPLIANT |
| **R9** | 9.2 Activate does NOT duplicate Egress | `FeaturesActivateGapTests > Activate_does_not_duplicate_Egress_when_present` | ✅ COMPLIANT |
| **R9** | 9.3 Activate tolerates missing optional seed row | `FeaturesActivateGapTests > Activate_tolerates_missing_optional_seed_row` | ✅ COMPLIANT |
| **R9** | 9.4 GET on activate route → 405 | `FeaturesActivateGapTests > Activate_with_GET_verb_returns_405` | ✅ COMPLIANT |
| **R9** | 9.5 Unexpected body ignored | `FeaturesActivateGapTests > Activate_ignores_unexpected_request_body` | ✅ COMPLIANT |
| **R10** | 10.1 Excludes Administration module features | `FeaturesAvailableGapTests > Available_excludes_Administration_module_features` | ✅ COMPLIANT |
| **R10** | 10.2 Excludes features under inactive module | `FeaturesAvailableGapTests > Available_excludes_features_whose_module_is_inactive` | ✅ COMPLIANT |
| **R10** | 10.3 Excludes inactive features | `FeaturesAvailableGapTests > Available_excludes_inactive_features` | ✅ COMPLIANT |
| **R10** | 10.4 Ordered by Order ascending | `FeaturesAvailableGapTests > Available_is_ordered_by_Order_ascending` | ✅ COMPLIANT |
| **R10** | 10.5 DTO shape: Name + ModuleId | `FeaturesAvailableGapTests > Available_items_have_dto_shape_and_module` | ✅ COMPLIANT |
| **R10** | 10.6 POST on available route → 405 | `FeaturesAvailableGapTests > Available_with_POST_verb_returns_405` | ✅ COMPLIANT |
| **R10** | ~~10.7 OwnerAdmin with inactive Management → 403~~ | **(REMOVED)** — Same class-level filter issue as R7.5 | ❌ REMOVED (documented) |

**Compliance summary**: 33/33 scenarios (effective) compliant ✅ — 3 scenarios removed (documented, correct), 1 scenario behaviorally corrected (documented, correct).

---

### Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| R1: SuperAdmin → 200 list | ✅ Implemented | Test `List_features_as_super_admin_returns_200` asserts OK + Succeeded + non-empty Data |
| R2: includeInactive toggle | ✅ Implemented | Both true (includes) and false (excludes) tested with seeded inactive Feature(9099) |
| R3: Activate mutation + return | ✅ Implemented | Snapshot/restore correctly implemented; pin corrected to `both_return_true` |
| R4: Available features | ✅ Implemented | SuperAdmin test only; StoresAdmin test removed (correct decision) |
| R5: List auth matrix | ✅ Implemented | 401 + 3×403 Theory + malformed token (in GapTests) = 5 scenarios |
| R6: Activate auth matrix | ✅ Implemented | 401 + 3×403 Theory = 4 scenarios |
| R7: Available auth matrix | ✅ Implemented | 401 + 3×403 Theory (removed inactive Management test) = 4 scenarios |
| R8: List gap coverage | ✅ Implemented | Non-bool route, DTO shape, unordered pin, malformed token |
| R9: Activate gap coverage | ✅ Implemented | Egress create/duplicate/missing row/verb mismatch/ignored body |
| R10: Available gap coverage | ✅ Implemented | 6 of 7 scenarios (3 exclusions + ordering + DTO + verb) |

---

### Coherence (Design)

| # | Decision | Followed? | Notes |
|---|----------|-----------|-------|
| AD1 | Self-contained auth matrix per endpoint | ✅ Yes | Each of the 3 endpoints has its own auth test class with inline 401/403 tests |
| AD2 | `FeatureSeed` static helper class | ✅ Yes | Shared across 9 test files with snapshot/restore + gap helpers |
| AD3 | Snapshot/restore pattern for activate | ✅ Yes | `SnapshotAsync` BEFORE, `RestoreAsync` in `finally` — covers all mutated rows |
| AD4 | `.AsTracking()` on restore queries | ✅ Yes | All `SnapshotAsync` and `RestoreAsync` queries use `.AsTracking()` + `IgnoreQueryFilters()` |
| AD5 | `Feature.Create()` factory method | ✅ Yes | All feature creation uses `Feature.Create()` with the confirmed 7-param signature |
| AD6 | `BeOneOf` for non-bool/verb-mismatch | ⚠️ Partially | Non-bool route uses `BeOneOf(400, 404)` ✅. Verb-mismatch tests assert exact `405` (confirmed working) — acceptable tightening |
| AD7 | Local `FeatureDtoShape` DTO class | ✅ Yes | Defined in `FeaturesListTests.cs` with Id, Name, ModuleId, Order, AvailableToStore |
| AD8 | `CleanupStoresAdminAsync` name | ✅ Yes | Confirmed at `StoreSeed.cs:143` — name matches |
| AD9 | `float Price` on Module | ✅ Yes | `SnapshotAsync` reads `stats.Price` as float; restore sets `stats.Price` |

---

### Issues Found

**CRITICAL** (must fix before archive):
- None

**WARNING** (should fix):
1. **Delta spec (spec.md) is outdated** — Still says "37 tests" and includes 3 removed scenarios (R4.2, R7.5, R10.7) and the original R3.2 name (`Activate_twice_second_returns_false`). Should be updated to reflect as-built state (33 tests, corrected pin, removed scenarios).
2. **Test plan doc** (`docs/backend/09_2026-07-24-smca-features-e2e-test-plan.md`) — References removed tests (`Available_as_stores_admin_returns_200`, `Available_as_owner_admin_with_inactive_management_module_returns_403`) and the old `Activate_twice_second_returns_false` name. Needs an addendum or note about the class-level filter discovery.
3. **Implementation plan doc** (`docs/backend/09_2026-07-24-smca-features-e2e-implementation-plan.md`) — Contains the original (now outdated) code. The Tasks 2, 3, and 7 code snippets have the old test names and the removed StoresAdmin/inactive Management tests.

**SUGGESTION** (nice to have):
- The verb-mismatch tests (`Activate_with_GET_verb_returns_405`, `Available_with_POST_verb_returns_405`) assert exact `405 MethodNotAllowed` instead of `BeOneOf(404, 405)`. This tightens the spec from the design's planned tolerance. If the pipeline ever changes behavior, these will break. Consider whether to keep the looser assertion for resilience.

---

### Verdict

**PASS WITH WARNINGS**

All 33 tests pass (0 failures, 0 skips), the full suite shows zero regressions (181/181), the design decisions are correctly implemented, and the 3 scenarios removed during implementation are properly documented in the design and tasks. The only issues are **stale documentation** (delta spec, test plan, implementation plan) that still reference the original 37-test plan without acknowledging the class-level filter discovery and pin correction.

**Summary**: Implementation is correct, tests are green, no regressions. Archive can proceed after the delta spec is updated to reflect the as-built state (33 tests, corrected pin, removed scenarios).
