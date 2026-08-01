# Archive Report: fix-istrial-duplicate

**Change**: `2026-07-29-fix-istrial-duplicate`
**Archived**: 2026-07-31
**Archive location**: `openspec/changes/archive/2026-07-29-fix-istrial-duplicate/`
**Mode**: `openspec`

---

## Executive Summary

This change eliminated a **duplicate source of truth** for the `IsInTrial` billing flag. `GetMeQueryHandler` computed `IsInTrial` inline with a hardcoded `AddMonths(1)` window, diverging from the canonical `StoreBillingUtils.IsInTrial(paymentStartDate, trialMonths, today)` which reads the configurable `TestingPeriodInMonths` from `SystemConfiguration`. If that config value ever changed from `1`, `GET /api/v1/auth/me` would report `isInTrial` incorrectly while every other consumer used the correct value.

**Resolution**: `StoreBillingSummary` now exposes `IsInTrial` as a first-class property, computed once in `BillingService` via the canonical util, and consumed by `GetMeQueryHandler`. The single-source-of-truth chain is:

```
StoreBillingUtils.IsInTrial(store.PaymentStartDate, trialMonths, today)
  → StoreBillingSummary.IsInTrial        (computed in BillingService)
    → CurrentUserDto.IsInTrial            (consumed in GetMeQueryHandler)
```

All 7 tasks were implemented in a single batch commit (`42deff4b`), with 3 E2E test asserts added covering free / PorVencer / EnGracia billing states. Full regression passed (E2E suite 237/237).

## Artifacts

| Artifact | Location |
|----------|----------|
| Spec | `openspec/changes/archive/2026-07-29-fix-istrial-duplicate/spec.md` |
| Design | `openspec/changes/archive/2026-07-29-fix-istrial-duplicate/design.md` |
| Tasks | `openspec/changes/archive/2026-07-29-fix-istrial-duplicate/tasks.md` |
| Apply Progress | `openspec/changes/archive/2026-07-29-fix-istrial-duplicate/apply-progress.md` |
| Verify Report | `openspec/changes/archive/2026-07-29-fix-istrial-duplicate/verify-report.md` |
| Archive Report | `openspec/changes/archive/2026-07-29-fix-istrial-duplicate/archive-report.md` |

> Note: this change has no separate `proposal.md` — the proposal phase was folded into the spec for this small fix (consistent with sibling endpoint-fix changes in the same batch).

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| billing | Already updated (no merge needed) | Delta requirements R1–R4 (`StoreBillingSummary.IsInTrial`, canonical computation in `BillingService`, `GetMeQueryHandler` consumption, consistent reporting across billing states) are already merged into `openspec/specs/billing/spec.md` as **R2.5–R2.8** (lines 138–200) in commit `42deff4b`. Verified verbatim match — no re-merge performed to avoid duplication. |

The delta spec (`spec.md`) documents the requirements; the main billing spec is the source of truth and already reflects this behavior.

## Implementation Commit

```
42deff4bc38108aaabef830ebad4555ce3df4cce
Author: Lizardo Romero Scott <lrscott83@gmail.com>
Date:   Thu Jul 30 16:24:15 2026 -0400

    fix(api): resolve bugs across stores, auth, users endpoints (SDD batch)
```

## Files Changed

| File | Change |
|------|--------|
| `backend/src/Domain/Entities/Billing/StoreBillingSummary.cs` | Added `public bool IsInTrial { get; init; }` property |
| `backend/src/Application/Services/Billing/BillingService.cs` | Computes `isInTrial` via `StoreBillingUtils.IsInTrial(...)`, assigns to summary |
| `backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | Consumes `billing.IsInTrial`; removed inline `AddMonths(1)` computation |
| `backend/src/SMCA.WebApi.E2ETests/Billing/GetMeBillingStatesTests.cs` | 3 new `IsInTrial` asserts (free=false, PorVencer=false, EnGracia=false) |

## Build & Test Results

| Check | Result |
|-------|--------|
| `dotnet build SMCA.sln` | ✅ 0 errors |
| E2E `GetMeBillingStatesTests` (`--filter "GetMeBilling"`) | ✅ PASS |
| Full regression (`dotnet test backend/src/SMCA.sln`) | ✅ ALL PASS (E2E 237/237) |

## SDD Cycle Complete

| Phase | Status |
|-------|--------|
| Spec | ✅ Complete |
| Design | ✅ Complete |
| Tasks | ✅ Complete (7/7) |
| Apply | ✅ Complete (commit `42deff4b`) |
| Verify | ✅ PASS |
| Archive | ✅ Complete |

## Risks Mitigated

- **Config drift**: `IsInTrial` no longer diverges when `TestingPeriodInMonths` changes — single canonical computation via `StoreBillingUtils`.
- **Contract drift**: `StoreBillingSummary` now carries `IsInTrial` as a first-class field, so future consumers cannot reimplement divergent inline logic.
- **No behavior change for current config**: With `TestingPeriodInMonths=1` in seed data, all billing E2E states report identical values as before — pure refactor plus new field.
- No migration, schema, or frontend impact.

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
