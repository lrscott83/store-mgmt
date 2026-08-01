# Archive Report

**Change**: billing-debt-items-3-4-5
**Date Archived**: 2026-07-31
**Domain**: billing

---

## Summary

Closed 3 known billing debt items in a single batch commit (`42deff4b`):

| Item | Type | Description |
|------|------|-------------|
| 3 | 🔧 Config | `DueSoonDays` exposed as `SystemConfigurationType` (enum id 4) with `GetDueSoonDaysAsync()` accessor; replaces hardcoded `5` in `BillingService` + `GetStoresToCollectQueryHandler` |
| 4 | 🧹 Cleanup | Orphaned `backend/src/Domain.Tests/` deleted (3 stale files, no `.csproj`, no sln reference; coverage intact in `Domain.UnitTests`) |
| 5 | ✏️ Rename | `trialDays` → `trialMonths` in `BillingService` — variable holds a month count |

## Tasks

| Metric | Value |
|--------|-------|
| Total tasks | 7 |
| Completed | 7 |
| Incomplete | 0 |

## Verification Results

| Check | Result |
|-------|--------|
| R3 (DueSoonDays) | ✅ All 6 sub-requirements + scenarios verified in code (enum, interface, impl, seed, both call sites, test mocks) |
| R4 (Domain.Tests) | ✅ Folder absent at HEAD; solution builds |
| R5 (rename) | ✅ Zero `trialDays` occurrences in `backend/src` |
| Spec compliance | 8/8 checks compliant |
| Critical issues | ❌ None |

**Verdict**: PASS

## Spec Sync

The delta spec (`specs/billing/spec.md`) was **already merged** into the main spec `openspec/specs/billing/spec.md` by the implementation commit `42deff4b`:
- R3 (Configurable DueSoonDays) — present in main spec (Domain Model `SystemConfigurationType.DueSoonDays` + Requirements R3)
- R1 modified (DueSoonDays source) — present (R1 states `GetDueSoonDaysAsync()` with default `5`)
- R5.1 (trialMonths rename) — present (`R2.2`, `R2.4`, `R2.6` use `trialMonths`)
- R4 (REMOVED requirement — folder deletion) — no main-spec counterpart; nothing to remove

No additional merge required. Archive folder already lives under `openspec/changes/archive/`; missing artifacts (proposal, design, tasks, apply-progress, verify-report, archive-report) created to complete the audit trail.

## Archive Contents

| Artifact | Status |
|----------|--------|
| `specs/billing/spec.md` | ✅ Present (delta) — merged into main spec |
| `proposal.md` | ✅ Created |
| `design.md` | ✅ Created |
| `tasks.md` | ✅ Created (7/7 complete) |
| `apply-progress.md` | ✅ Created |
| `verify-report.md` | ✅ Created |
| `archive-report.md` | ✅ Created |

## Files Changed (Implementation)

| File | Action |
|------|--------|
| `backend/src/Domain/Common/Enums/SystemConfigurationType.cs` | Modified |
| `backend/src/Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs` | Modified |
| `backend/src/Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs` | Modified |
| `backend/src/Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs` | Modified |
| `backend/src/Application/Services/Billing/BillingService.cs` | Modified |
| `backend/src/Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs` | Modified |
| `backend/src/Application.Tests/Services/Billing/BillingServiceTests.cs` | Modified |
| `backend/src/Application.Tests/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQueryTests.cs` | Modified |
| `backend/src/Domain.Tests/` | Deleted |

## Follow-Up Items

1. `DueSoonDays` is now DB-configurable — a future ops task could seed a value other than `5` (e.g. `7`) to widen the `PorVencer` window; the accessor and both call sites already honor it.

## Engram Persistence

- **Project**: store-mgmt
- **Topic key**: `sdd/billing-debt-items-3-4-5/archive-report`
- **Type**: architecture
