# Proposal: billing-e2e-coverage-fixes

## Intent

Fix two defects in the billing subsystem hidden by missing test coverage: `DateOnly.MaxValue` arithmetic crash (F2) and unbackfilled `0001-01-01` sentinel data (F1). Then build a four-category end-to-end coverage matrix across all 4 new billing endpoints + enforcement on `/auth/me`.

## Scope

### In Scope (15 tasks, 2 PRs)

**PR1 — Fixes, clock, migration (tasks 1–7)**
1. Make `StoreBillingUtils` null-safe (`DateOnly?` signatures)
2. Relocate `IDateTimeProvider` to `Application/Abstractions/Time/`
3. Inject clock into 4 billing call sites
4. Backfill migration for sentinel `PaymentStartDate`
5. E2E free-store test on `/auth/me`
6. `RegisterStorePaymentCommandValidator`
7. Delete dead `StoreBillingService`

**PR2 — Coverage matrix (tasks 8–15)**
8. `MutableDateTimeProvider` + `BillingSeed` test infrastructure
9. `/auth/me` — PorVencer, EnGracia, trial boundary
10. `PUT /stores/{id}/payment-date` — 4-category suite
11. `POST /stores/{id}/payments` — 4-category suite
12. `GET /stores/to-collect` — 4-category suite
13. `GET /stores/reseller-commissions` — 4-category suite
14. `PUT /stores/{id}` — activation-on-first-paid E2E
15. `POST /features/activate` — Statistics price assertion

### Out of Scope
- Remaining 102 `RuleFor` validators across 42 other endpoints
- `DateTime.UtcNow` usage outside billing (`LoginCommand`, etc.)
- Changing `StoreSeed` default (`PaymentStartDate = today` — 60+ callers)
- Fixing hard-coded due-soon window vs configurable grace period
- Removing `StoreBillingUtils._logger` (separate debt)

## Approach

Strict TDD — each task starts with a failing test. PR1 first (production risk), PR2 second (mechanical coverage). Null is the domain model for "clock never started"; every fix pushes toward making the type system say that instead of magic dates.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Domain/Common/Utils/StoreBillingUtils.cs` | Modified | Nullable signatures |
| `Domain/Entities/Billing/StoreBillingSummary.cs` | Modified | `NextDueDate` → `DateOnly?` |
| `Application/Services/Billing/BillingService.cs` | Modified | Drop `?? DateOnly.MaxValue`, inject clock |
| `Application/Abstractions/Time/IDateTimeProvider.cs` | New | Relocated interface |
| `Application/Features/.../GetStoresToCollectQuery.cs` | Modified | Inject clock, drop MaxValue |
| `Application/Features/.../RegisterStorePaymentCommandValidator.cs` | New | Missing validator |
| `Application/DependencyInjection.cs` | Modified | Remove dead service registration |
| `Infrastructure/Migrations/PaymentStartDateBackfill.cs` | New | Shared SQL constant |
| `Infrastructure/Migrations/<timestamp>_Backfill-*.cs` | New | EF migration |
| `SMCA.WebApi.E2ETests/Infrastructure/MutableDateTimeProvider.cs` | New | Test clock |
| `SMCA.WebApi.E2ETests/Infrastructure/BillingSeed.cs` | New | Intent-revealing seeds |
| `SMCA.WebApi.E2ETests/Billing/*.cs` | 12+ files | New test suites |
| `Application/Services/Billing/StoreBillingService.cs` | Deleted | Dead code |
| `Domain/Interfaces/Services/Billing/IStoreBillingService.cs` | Deleted | Dead interface |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Backfill SQL too broad, affecting legitimate rows | Low | WHERE clause scoped to sentinel value only; `Down()` intentionally empty |
| Existing tests seed `PaymentStartDate = today` masking regressions | Med | All existing tests keep passing; new tests add null-path coverage without removing old seeds |
| Shared mutable clock between serial e2e tests | Low | `IDisposable Pin()` scope restores clock automatically |

## Rollback Plan

- **PR1**: Revert commit(s). Backfill migration has empty `Down()` — run inverse SQL manually: `UPDATE "Store" SET "PaymentStartDate" = '0001-01-01' WHERE "PaymentStartDate" IS NULL AND ...` (add production-safe filter).
- **PR2**: Revert the PR commit. No production code changed — purely additive tests.

## Dependencies

- PostgreSQL on `localhost:5432` for e2e tests
- EF Core tooling for migration generation (`dotnet ef`)
- Existing `WebAppFixture` + `WebApplicationFactory<Program>` infrastructure

## Success Criteria

- [ ] All 15 tasks implemented, each through a red-green TDD cycle
- [ ] Every billing endpoint has HappyPath + EdgeCase + ErrorHandling + Integration coverage
- [ ] `?? DateOnly.MaxValue` removed from all production code
- [ ] Backfill SQL proven correct by e2e test (seeds sentinel, runs SQL, asserts null)
- [ ] Full `Application.Tests` + `SMCA.WebApi.E2ETests` suite is green
