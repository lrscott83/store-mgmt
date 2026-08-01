# Archive Report: billing-e2e-coverage-fixes

**Change**: `2026-07-28-billing-e2e-coverage-fixes`
**Archived**: 2026-07-31
**Verdict**: PASS ✅

---

## Executive Summary

Fixed two defects hidden by missing test coverage in the billing subsystem: the `DateOnly.MaxValue` arithmetic crash (F2) and unbackfilled `0001-01-01` sentinel data (F1). Made the billing domain model null-safe (`DateOnly?` everywhere — null is the domain model for "clock never started"), relocated `IDateTimeProvider` to `Application.Abstractions.Time`, injected the clock into 4 call sites, added a sentinel backfill migration with a shared SQL constant, registered the missing `RegisterStorePaymentCommandValidator`, and deleted the dead `StoreBillingService`. Then built a 4-category (HappyPath / EdgeCase / ErrorHandling / Integration) E2E coverage matrix across all 7 billing-affected endpoints using a new `MutableDateTimeProvider` test clock and `BillingSeed` helper. All 15 tasks implemented in batch commit `42deff4b`; build 0 errors, E2E suite 237/237 green.

## What Changed (2 PRs, 15 Tasks)

### PR1 — Fixes, Clock, Migration (tasks 1–7)

| Task | Description |
|------|-------------|
| 1.1 | `StoreBillingUtils` nullable-aware — `GetNextDueDate` → `DateOnly?`, `GetStatus` → `DateOnly?`, `IsPaidPlanActive` → `DateOnly?` |
| 1.2 | 3 new `StoreBillingUtilsTests` (null boundary, month-end clamping) + fixed 3 existing `IsPaidPlanActive` tests |
| 1.3 | New `BillingServiceTests` — 7 tests (free/unknown store, amounts, last-payment price, commission, months-active) |
| 1.4 | `StoreBillingSummary.NextDueDate` → `DateOnly?` |
| 1.5 | Removed `?? DateOnly.MaxValue` magic dates from production code |
| 1.6 | Moved `IDateTimeProvider` to `Application/Abstractions/Time/` |
| 1.7 | Injected clock in 4 call sites (BillingService, GetMeQueryHandler, GetStoresToCollectQueryHandler, UpdateStoreCommandHandler) |

### PR2 — Coverage Matrix (tasks 8–15)

| Task | Description |
|------|-------------|
| 2.1 | `MutableDateTimeProvider` — `Pin(DateTimeOffset)` + `IDisposable` scope |
| 2.2 | Clock registered in `AppTestFactory.ConfigureTestServices`, exposed as `WebAppFixture.Clock` |
| 2.3 | `BillingSeed` helper — intent-revealing seed factories + cleanup |
| 2.4 | `PaymentStartDateBackfill.Sql` shared constant + `BackfillMigrationTests` |
| 2.5 | Migration `20260728194358_Backfill-PaymentStartDate-Null.cs` + `scripts/06-20260728-Backfill-PaymentStartDate.sql` |
| 2.6 | `RegisterStorePaymentCommandValidator` (`StoreId.NotEmpty`) + E2E validation test |
| 2.7 | Deleted dead `StoreBillingService` / `IStoreBillingService` / DI registration |
| 2.8 | 13 E2E test files for 4-category coverage across 7 billing endpoints |

## Commit

```
42deff4bc38108aaabef830ebad4555ce3df4cce
fix(api): resolve bugs across stores, auth, users endpoints (SDD batch)
2026-07-30 — Lizardo Romero Scott
```

## Specs Synced to Main

Verified — both main specs already contain the merged delta content (merged during apply in `42deff4b`):

| Domain | Action | Details |
|--------|--------|---------|
| `billing` | Updated | ADDED R8 (PaymentStartDate Backfill), R9 (IDateTimeProvider Clock Injection), R10 (RegisterStorePaymentValidator), R11 (BillingService Unit Coverage); MODIFIED R1 (null → NoAplica state machine), R2.2 (GetNextDueDate nullable return), R2.4 (month-end clamping); REMOVED R3 (StoreBillingService / IStoreBillingService) |
| `billing-e2e-coverage` | Updated | Full spec (R1–R9) — Mutable Test Clock, BillingSeed, 4-category E2E coverage for all 7 billing endpoints |

Main spec paths:
- `openspec/specs/billing/spec.md` — merge verified (R8–R11 present, R3 removed, nullable semantics reflected)
- `openspec/specs/billing-e2e-coverage/spec.md` — merge verified (identical to delta spec content)

## Archive Contents

| Artifact | Status |
|----------|--------|
| `proposal.md` | ✅ |
| `design.md` | ✅ |
| `specs/billing/spec.md` | ✅ |
| `specs/billing-e2e-coverage/spec.md` | ✅ |
| `tasks.md` | ✅ (15/15 tasks complete) |
| `apply-progress.md` | ✅ |
| `verify-report.md` | ✅ |
| `archive-report.md` | ✅ |

## Verification Summary

| Check | Result |
|-------|--------|
| Build (0 errors) | ✅ Passed |
| `Application.Tests` (incl. `BillingServiceTests`, `StoreBillingUtilsTests`) | ✅ Passed |
| E2E suite (237/237 passing) | ✅ Passed |
| Tasks complete (15/15) | ✅ 100% |
| Spec compliance (billing + billing-e2e-coverage) | ✅ 100% |

## Risks / Open Items

- **None**. All 15 tasks implemented, verified, and merged to main specs.
- Out-of-scope debt explicitly tracked in proposal (validators on 42 other endpoints, non-billing `DateTime.UtcNow`, `StoreSeed` default, hard-coded due-soon window vs configurable grace, `StoreBillingUtils._logger`) — not part of this change.

---

**SDD cycle complete.** The change has been fully planned, implemented, verified, and archived. Ready for the next change.
