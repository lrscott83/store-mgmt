# Proposal: billing-debt-items-3-4-5

## Intent

Close 3 known billing debt items flagged during prior billing SDD cycles:

1. **Item 3 — Configurable DueSoonDays**: `dueSoonDays` was a hardcoded literal `5` in `BillingService` and `GetStoresToCollectQueryHandler`. Expose it as a `SystemConfigurationType` entry with a repository accessor (R3).
2. **Item 4 — Orphaned `Domain.Tests` folder**: `backend/src/Domain.Tests/` was a stale duplicate of `Domain.UnitTests` — 3 files, no `.csproj`, no solution reference. Delete it (R4).
3. **Item 5 — `trialDays` misnomer**: variable named `trialDays` in `BillingService` actually held a month count. Rename to `trialMonths` (R5.1).

## Scope

### In Scope
1. `SystemConfigurationType` + `ISystemConfigurationRepository`/`SystemConfigurationRepository`: add `DueSoonDays = 4` and `GetDueSoonDaysAsync()` (fallback `5`).
2. `BillingService` + `GetStoresToCollectQueryHandler`: consume `GetDueSoonDaysAsync()` instead of hardcoded `5`.
3. Delete `backend/src/Domain.Tests/` (folder only — no test loss; coverage lives in `Domain.UnitTests`).
4. Rename `trialDays` → `trialMonths` in `BillingService` (no behavioral change).

### Out of Scope
- Changing the billing status state machine logic (R1 behavior unchanged).
- Adding new tests beyond adapting existing ones to the repository mock.

## Approach

Minimal, independently-shippable changes: extend the existing `SystemConfigurationType` pattern (precedent: `PaymentGraceDays`/`GetPaymentGraceDaysAsync`), point both hardcoded call sites at the new accessor, delete the orphaned folder, and apply the rename. Single commit.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Configuration storage | `SystemConfigurationType.DueSoonDays = 4`, DB row default `"5"` | Mirrors existing `PaymentGraceDays` pattern; no schema change |
| Accessor fallback | `FirstOrDefaultAsync(c => c.Id == 4)?.Value ?? 5` | Backward compatible — no row ⇒ behaves identically to today's hardcoded `5` |
| Folder deletion | `git rm backend/src/Domain.Tests/` | Confirmed orphan: no `.csproj`, no `SMCA.sln` reference, all tests exist in `Domain.UnitTests` |
| Rename | `trialDays` → `trialMonths` | Variable holds months (`TestingPeriodInMonths`); rename documents intent |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Domain/Common/Enums/SystemConfigurationType.cs` | Modified | Add `DueSoonDays = 4` |
| `Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs` | Modified | Declare `GetDueSoonDaysAsync()` |
| `Infrastructure/.../SystemConfigurationRepository.cs` | Modified | Implement accessor + seed `"5"` |
| `Application/Services/Billing/BillingService.cs` | Modified | Consume accessor; rename `trialDays` → `trialMonths` |
| `Application/.../GetStoresToCollectQuery.cs` | Modified | Consume accessor |
| `backend/src/Domain.Tests/` | Deleted | Orphaned duplicate folder (3 stale files) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Deleting `Domain.Tests` removes real coverage | Low | Verified `Domain.UnitTests` contains the same suite; solution builds without it |
| Config row missing → wrong due-soon window | Low | Fallback `5` preserves current behavior |

## Success Criteria

- [ ] `SystemConfigurationType.DueSoonDays = 4` exists and `GetDueSoonDaysAsync()` returns `5` when no row.
- [ ] Both call sites (`BillingService`, `GetStoresToCollectQueryHandler`) read from the repository.
- [ ] `backend/src/Domain.Tests/` no longer exists; solution builds.
- [ ] `trialMonths` replaces `trialDays`; all tests pass.
