# Archive Report: owners-update-endpoint-fixes

**Change**: `owners-update-endpoint-fixes`
**Archived**: 2026-08-02
**Archive location**: `openspec/changes/archive/2026-08-02-owners-update-endpoint-fixes/`
**Mode**: HYBRID (engram + openspec)
**Verdict**: ✅ PASS WITH WARNINGS (verify-report `pass_with_warnings`, 0 blockers, 0 CRITICAL)
**Archive disposition**: standard (no overrides; one intentional task-checkbox reconciliation documented below)

---

## Executive Summary

Archived change `owners-update-endpoint-fixes` — **14 bugs fixed** in `PUT /api/v1/Owners/{id}` across 6 capabilities (owners, command-handler, validation, repository, api-controller, auth-authorization). The endpoint previously silently dropped User navigation changes (NoTracking), crashed with NRE→500 on nonexistent owners and ReSellers, leaked cross-tenant IDOR, returned the wrong auth status for OwnerAdmin, returned a `ResponseResult<bool>` instead of the OwnerDto, ran a redundant validator DB query, and carried stale Swagger/XML metadata.

**Final state**: build 0 errors; E2E **8/8** OwnersUpdate tests pass; full Owners collection **33/33** pass with **0 regressions**; spec deviation (R5 S5 OwnerAdmin) reconciled to the real 403 contract; frontend contract plan and E2E coverage plan published.

## Final-State Authority Notes

Per the archive Final-State Authority hierarchy, this report describes the change AT CLOSE:

| Fact | Source (rank) | Value |
|------|---------------|-------|
| Build | Orchestrator final-state facts (3) + verify-report (4) | 0 errors |
| E2E focused | Orchestrator final-state facts (3) + verify-report (4) | 8/8 OwnersUpdate PASS |
| E2E full Owners | Orchestrator final-state facts (3) + verify-report (4) | 33/33 PASS, 0 regressions |
| Spec deviation | Orchestrator final-state facts (3) + verify-report WARNING #1 (4) | R5 S5 OwnerAdmin → **403** (not 200), spec amended |
| Frontend contract plan | Orchestrator final-state facts (3) + disk evidence | `docs/plans/owners-update-endpoint-fixes-frontend.md` exists |
| Coverage plan | Orchestrator final-state facts (3) + disk evidence | `docs/plans/endpoints-e2e-coverage.md` row 26 Done/Applied |
| CRITICAL issues | verify-report (4) | **0** |
| Files modified | Orchestrator final-state facts (3) + apply-progress (4) | 7 files |

Per `verify-report` (observation #604, written at verification time), the compliance matrix measured **18/18 requirements, 40/40 scenarios**: 35 fully compliant via E2E/static evidence, 5 PARTIAL (static-only evidence for SuperAdmin bypass, query-count, ReSeller tri-state) — all with confirmed code-level evidence, no failing or untested scenarios. Those PARTIAL items are static-evidence limitations of the E2E harness, not open gaps.

## What Was Fixed (14 bugs)

| # | Fix | Severity | Files |
|---|-----|----------|-------|
| 1 | NoTracking persistence — new `GetOwnerWithUserTrackedAsync` (`AsTracking()`, Owner+User only); User nav changes persist via `SaveChangesAsync` | **CRITICAL** | `IOwnerRepository.cs`, `OwnerRepository.cs`, `UpdateOwnerCommand.cs` |
| 2 | Null guard — nonexistent owner → HTTP 404 (was NRE→500) | **CRITICAL** | `UpdateOwnerCommand.cs` |
| 3 | Tenant-scope IDOR guard — non-SuperAdmin cross-tenant → 404 envelope, no write | **CRITICAL** | `UpdateOwnerCommand.cs` |
| 4 | OwnerAdmin auth alignment — class-level `[HasPermission(OwnersAdmin)]` is the sole gate; denial → real 403 | HIGH | `UpdateOwnerCommand.cs`, `OwnersController.cs` |
| 5 | `ResponseResult<bool>` → `ResponseResult<OwnerDto>` (AutoMapper projection) | HIGH (BREAKING) | `UpdateOwnerCommand.cs` |
| 6 | `[ProducesResponseType]` 200(OwnerDto)/400/401/403/404/500 | MEDIUM | `OwnersController.cs` |
| 7 | Validator structural-only — removed `MustAsync(OwnerExists)` double query (VL-O1) | MEDIUM (perf) | `UpdateOwnerCommandValidator.cs` |
| 8 | Removed `MustAsync(ReSellerExists)` + repo deps (VL-O2) | MEDIUM | `UpdateOwnerCommandValidator.cs` |
| 9 | ReSeller null guard — nonexistent ReSeller → 400 `Code == "ReSellerId"`, no NPE (OU-CH6) | HIGH | `UpdateOwnerCommand.cs` |
| 10 | Lightweight tracked query — 5-join include chain replaced (RR-O1) | MEDIUM (perf) | `OwnerRepository.cs` |
| 11 | XML doc — "Updates an owner by id" + `<param>`/`<returns>` (OC-OU2) | LOW | `OwnersController.cs` |
| 12 | Param rename `tenantId` → `ownerId` (VL-O4; vacuous once VL-O1 removed) | LOW | `UpdateOwnerCommandValidator.cs` |
| 13 | Redundant `UpdateAsync` removed — AsTracking + SaveChanges suffices (OU-CH4) | LOW | `UpdateOwnerCommand.cs` |
| 14 | Nested `if (reSellerId.HasValue)` redundant guard removed (OU-CH6 6b) | LOW | `UpdateOwnerCommand.cs` |

**Files changed (7)**: `IOwnerRepository.cs`, `OwnerRepository.cs`, `UpdateOwnerCommandValidator.cs`, `UpdateOwnerCommand.cs`, `OwnersController.cs`, `OwnersUpdateTests.cs`, `OwnersUpdateGapTests.cs`.

## Breaking Changes

| Change | Before | After |
|--------|--------|-------|
| 200 response shape | `ResponseResult<bool>` (`data: true`) | `ResponseResult<OwnerDto>` (full owner object) |
| Nonexistent owner ID | 400 BadRequest (`Code == "Id"` via validator) | **404 NotFound** (handler null guard) |
| OwnerAdmin actor on PUT | Misleading 400 (handler role gate) | **403 Forbidden** (filter grants SuperAdmin+ReSeller only; OwnerAdmin role never had the Owners feature — the old "accepted → 200" claim in the original spec was factually impossible) |
| Validator query behavior | Double DB round-trip | Zero validator queries; single handler tracked load |

**Frontend coordination**: `docs/plans/owners-update-endpoint-fixes-frontend.md` published (breaking contract doc — response deserialization must switch to `OwnerDto`, and 404/403 handling must be added). Coverage plan `docs/plans/endpoints-e2e-coverage.md` row 26 marked Done/Applied.

## Spec Deviation Reconciliation (WARNING #1)

The original delta spec claimed R5 S5 / OU-CH3 3a "OwnerAdmin accepted → 200". Verification proved this impossible: `StoreRoleFeatures.OwnersAdmin` grants only SuperAdmin+ReSeller, so the class-level `[HasPermission]` filter returns 403 before the handler runs. **The spec was amended this phase** (R5 S5 → "OwnerAdmin denied (403)", OU-CH3 3a → "403 ForbidResult") and the E2E test pins the real contract (`Update_owner_owneradmin_rejected_returns_403`, no write). Implementation matches the amended contract; the synced main specs carry the amended text.

## Accepted Mechanism Deviations (verify-report WARNINGS #2, #3)

1. **OC-OU3**: controller keeps simple `Ok(result)` instead of an ActionCode switch; real HTTP statuses (400/403/404) come from `ErrorHandlerMiddleware` + the `[HasPermission]` filter. All four scenario outcomes (200/400/403/404) verified by E2E — outcome-compliant, mechanism differs from the literal spec text (launch-prompt override).
2. **OU-CH1**: handler throws `ApiException(OwnerNotFound, 404)` instead of `ResponseResult.Failure<OwnerDto>(OwnerErrors.NotFound, 404)`; envelope + HTTP 404 outcome identical and verified (launch-prompt override). `AcctionCode = "OwnerNotFound"` set for clean envelope Code.

Both are launch-prompt-resolved, outcome-verified deviations — recorded here per Final-State Authority, not silently resolved.

## Task Completion Gate — Reconciliation Note

`tasks.md` (26 tasks) shows **26/26 complete** after one exceptional archive-time reconciliation of **3 stale checkboxes**:

- **6.2** (E2E filter run) and **6.3** (full Owners collection run) were explicitly labeled `(verify phase)` in the tasks artifact; the apply phase was instructed "Do NOT run E2E tests in this phase". The verify phase ran both: **8/8** and **33/33 PASS** (verify-report #604, `test_exit_code: 0`). Checkboxes marked `[x]` at archive per orchestrator final-state facts + verify-report evidence.
- **6.4** (frontend breaking-contract doc) was explicitly labeled `(release dependency; not an apply deliverable)`. The file exists on disk (`docs/plans/owners-update-endpoint-fixes-frontend.md`) per orchestrator final-state facts + disk evidence. Checkbox marked `[x]` at archive.

This is the exceptional mechanical reconciliation path permitted when verify-report/orchestrator evidence proves completion; the exact reason is recorded here so the archived audit trail contains no stale unchecked boxes for completed work.

## Review Gate

No native review artifacts exist for this change (no `reviews/` directory, no review transaction/ledger/receipt/policy in openspec or Engram), and `gentle-ai sdd-review` is not a command in this environment's binary. Review delivery is **disabled/unmanaged** (kill switch off, no review governs this change) — consistent with prior archives in this repo (`2026-07-30-store-getbyid-fixes`, `2026-07-29-fix-istrial-duplicate`), which archived without review receipts. The gate passes via the unmanaged relaxation; no explicit review artifact failed validation.

## Runtime Attempt Note

Native status reports runtime attempt 1 (`owners-update-handler-repo`) as `running` with a settle token held by the apply executor. This archive phase is not runtime-bearing (no external test/build execution to bracket) and does not acquire/settle attempts. The apply/verify external execution completed (build + E2E evidence present in verify-report with output hashes). The stale attempt is a known residue for the orchestrator to settle with the apply-session token; it does not affect archive correctness.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| owners | Updated | R5 MODIFIED (200 OwnerDto, 404 nonexistent, +OwnerAdmin-403 and cross-tenant scenarios); R8 MODIFIED (handler null-guard ReSeller check, no NRE) |
| command-handler | Updated | ADDED OU-CH1..OU-CH7 (null guard, tenant-scope, auth gate, tracked persistence, OwnerDto return, ReSeller guard, tri-state) |
| validation | Updated | REMOVED VL-O1, VL-O2 (with Reason/Migration); MODIFIED VL-O3 (structural-only); RENAMED VL-O4 |
| repository | Updated | ADDED RR-O1 (`GetOwnerWithUserTrackedAsync`, AsTracking, Owner+User only) |
| api-controller | Updated | ADDED OC-OU1 (Swagger 200/400/401/403/404/500), OC-OU2 (XML doc), OC-OU3 (real status mapping) |
| auth-authorization | Updated | ADDED AUTH-OU1 (handler-level tenant-scope, SuperAdmin bypass) |

Main specs now reflect the new behavior; requirements not mentioned in the delta were preserved.

## Artifacts

| Artifact | Location | Engram Obs ID |
|----------|----------|---------------|
| Proposal | `openspec/changes/archive/2026-08-02-owners-update-endpoint-fixes/proposal.md` | #599 |
| Spec (delta) | `openspec/changes/archive/2026-08-02-owners-update-endpoint-fixes/spec.md` | #600 |
| Design | `openspec/changes/archive/2026-08-02-owners-update-endpoint-fixes/design.md` | #601 |
| Tasks | `openspec/changes/archive/2026-08-02-owners-update-endpoint-fixes/tasks.md` (26/26) | #602 |
| Apply Progress | Engram only (`sdd/owners-update-endpoint-fixes/apply-progress`) | #603 |
| Verify Report | `openspec/changes/archive/2026-08-02-owners-update-endpoint-fixes/verify-report.md` | #604 |
| Archive Report | `openspec/changes/archive/2026-08-02-owners-update-endpoint-fixes/archive-report.md` + Engram `sdd/owners-update-endpoint-fixes/archive-report` | this observation |

## Remaining Risks

| Risk | Level | Notes |
|------|-------|-------|
| 5 scenarios verified by static evidence only (SuperAdmin cross-tenant bypass, single-query count, ReSeller tri-state branches) | LOW | Code-level evidence confirmed; E2E harness lacks SQL profiler and cross-tenant SuperAdmin seed. |
| BREAKING contract (OwnerDto, 404, 403) — frontend must consume the published plan before release | MEDIUM | Plan published at `docs/plans/owners-update-endpoint-fixes-frontend.md`; release-gated. |
| Stale runtime attempt #1 un-settled | LOW | Belongs to apply session token; orchestrator may settle. No effect on archived evidence. |

## SDD Cycle Complete

| Phase | Status |
|-------|--------|
| Proposal | ✅ Complete |
| Spec | ✅ Complete (18/18 req, 40/40 scenarios) |
| Design | ✅ Complete |
| Tasks | ✅ Complete (26/26) |
| Apply | ✅ Complete (7 files) |
| Verify | ✅ PASS WITH WARNINGS (0 CRITICAL, 0 blockers) |
| Archive | ✅ Complete |

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
