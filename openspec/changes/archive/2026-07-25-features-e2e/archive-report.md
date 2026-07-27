# Archive Report: features-e2e

**Date**: 2026-07-25
**Project**: `store-mgmt`
**Status**: ✅ ARCHIVED

---

## Executive Summary

The features-e2e change implemented 33 E2E tests (as-built) for the 3 `FeaturesController` API endpoints (`GET all/{includeInactive}`, `POST activate`, `GET available`) against real Postgres. The change is complete with 181/181 full suite passing (zero regressions). 3 scenarios were removed during implementation due to an architecture discovery (class-level `[HasPermission(SuperAdmin)]` filter blocks method-level widening). 1 scenario was corrected (activate always-true return pin).

---

## Artifacts

### OpenSpec Archive

| Artifact | Path | Status |
|----------|------|--------|
| Exploration | `openspec/changes/archive/2026-07-25-features-e2e/explore.md` | ✅ |
| Proposal | `openspec/changes/archive/2026-07-25-features-e2e/proposal.md` | ✅ |
| Design | `openspec/changes/archive/2026-07-25-features-e2e/design.md` | ✅ |
| Spec (delta) | `openspec/changes/archive/2026-07-25-features-e2e/specs/features-e2e/spec.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-07-25-features-e2e/tasks.md` | ✅ |
| Verify Report | `openspec/changes/archive/2026-07-25-features-e2e/verify-report.md` | ✅ |
| Archive Report | `openspec/changes/archive/2026-07-25-features-e2e/archive-report.md` | ✅ **(this file)** |

### Main Spec Updated

| Domain | Path | Action |
|--------|------|--------|
| features-e2e | `openspec/specs/features-e2e/spec.md` | ✅ Created (copy of as-built delta spec) |

### External Docs (pre-existing, confirmed synced)

| Doc | Status |
|-----|--------|
| `docs/backend/09_2026-07-24-smca-features-e2e-test-plan.md` | ✅ Already updated with as-built details (33 tests, findings noted) |
| `docs/backend/09_2026-07-24-smca-features-e2e-implementation-plan.md` | ✅ Already updated with as-built details (33 tests, findings noted) |

---

## Delta Summary

### From Initial Estimate (37) → As-Built (33)

| Change | Reason |
|--------|--------|
| R3.2 corrected | `Activate_twice`: both calls return `true` (not `false` on 2nd). `UpdateAsync` always marks entities Modified → `SaveChanges > 0` always. |
| R4.2 removed | `Available_as_stores_admin` — class-level `[HasPermission(SuperAdmin)]` blocks method-level widening to StoresAdmin |
| R7.5 removed | `OwnerAdmin_with_inactive_Management` — same class-level filter, redundant with 7.4 |
| R10.7 removed | `OwnerAdmin_with_inactive_Management` — same class-level filter, redundant with auth matrix |

### Final Count

| Metric | Value |
|--------|-------|
| Test files | 9 (FeaturesListTests, FeaturesActivateTests, FeaturesAvailableTests, 3×Auth, 3×Gap) |
| Helper files | 1 (FeatureSeed.cs) |
| Total tests | **33** |
| Full suite | **181/181** (148 existing + 33 new, zero regressions) |
| Tasks | 9/9 complete |

---

## Key Findings (Pinned for Future Reference)

1. **Activate always-true return pin**: `FeaturesRepository.UpdateAsync` calls `context.UpdateAsync(entity)` which always marks entities as Modified. Both calls to `POST activate` return `true`. R3.2 pins this behavior.

2. **Class-level `[HasPermission(SuperAdmin)]` blocks method-level widening**: `FeaturesController` has `[HasPermission(SuperAdmin)]` at the class level. The `/available` endpoint has method-level `[HasPermission(SuperAdmin, StoresAdmin)]` which can never widen access — the class filter runs first. StoresAdmin can NEVER reach any `/api/v1/Features/*` endpoint via HTTP.

3. **Dead handler gates**: Both `activate` and `available` handlers have unreachable `IsSuperAdmin` / `IsSuperAdminOrOwnerAdmin` checks. Deferred to handler unit tests (not in scope).

---

## Verification

- **Build**: ✅ Passed
- **Features tests**: 33/33 passed (0 failed, 0 skipped)
- **Full suite**: 181/181 passed (0 regressions)
- **Verdict**: PASS WITH WARNINGS (all warnings are stale documentation, now resolved)

---

## Lineage

This change was tracked through the full SDD lifecycle: Exploration → Proposal → Design → Tasks → Apply → Verify → Archive.

No engram observation IDs — this change was tracked via OpenSpec (file-based artifacts).

---

## SDD Cycle Complete

✅ The change has been fully planned, implemented, verified, and archived.
