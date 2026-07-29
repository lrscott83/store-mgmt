# Design: Billing E2E Coverage & Fixes

## Technical Approach

Strict TDD: each defect gets a red test first, then production fix, then green. PR1 (tasks 1–7) carries all production risk — nullable domain model, clock relocation, backfill migration, validator, dead-code removal. PR2 (tasks 8–15) adds 4-category coverage (HappyPath / EdgeCase / ErrorHandling / Integration) across 7 endpoints via `MutableDateTimeProvider` and `BillingSeed`. Null is the domain model for "clock never started"; every production change pushes magic dates toward `null`.

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|-------------|-----------|
| AD1 | Nullable `PaymentStartDate` model | `DateOnly?` throughout. `GetNextDueDate` returns `DateOnly?`; `GetStatus` accepts `DateOnly?` for both arguments; `IsPaidPlanActive` also changes `nextDueDate` from `DateOnly` to `DateOnly?` | Keep `?? DateOnly.MaxValue` with try-catch | Type system enforces "no due date" at compile time. `null` propagates to `NoAplica` naturally. Eliminates F2 at the source. `IsPaidPlanActive` is unused in production (only in 3 tests) so signature change is safe. |
| AD2 | `IDateTimeProvider` relocation | Move from `Infrastructure/Interfaces/Services/` to `Application/Abstractions/Time/` | Leave in Infrastructure, inject as-is | Matches existing convention (`IHttpContextService` in `Application/Abstractions/HttpContext/`). Pure refactor — existing suite stays green. |
| AD3 | Test clock pattern | `MutableDateTimeProvider` with `IDisposable Pin(DateTimeOffset)` scope in `E2ETests/Infrastructure/` | In-memory time provider, static `DateTime.Set` | Disposable scope auto-restores clock on dispose. Safe for serial `e2e` collection; keeps it safe if parallel in future. |
| AD4 | Backfill migration | Shared SQL constant `PaymentStartDateBackfill.Sql` referenced by both migration `Up()` and test | Inline SQL in migration only | Test cannot drift from the statement it verifies. `Down()` intentionally empty — reverting would re-introduce sentinel. |
| AD5 | Strict TDD per task | Each task: write red test → confirm failure → write production fix → confirm green | Write all tests then fix | Each red-green cycle pins the exact defect it addresses. F2 is confirmed or refuted by `BillingServiceTests` before any fix code is written. |
| AD6 | Delete `StoreBillingService` | Remove class, interface `IStoreBillingService`, DI registration | Keep as deprecated | `RecordManualPaymentAsync` duplicates `RegisterStorePaymentCommandHandler` while omitting reseller guard and +1 month due-date advance. Injected nowhere. |

## Data Flow

```
Clock (IDateTimeProvider)
  ├── BillingService.GetStoreBillingSummaryAsync    ──→ GetMeQueryHandler
  ├── GetStoresToCollectQueryHandler                 ──→ StoreBillingUtils.GetNextDueDate(…)
  ├── UpdateStoreCommandHandler                      ──→ store.PaymentStartDate = today
  └── RegisterStorePaymentCommandHandler             ──→ nextDueDate computation

Backfill Migration:
  Store.PaymentStartDate = '0001-01-01'  ──→  NULL
  (shared constant: PaymentStartDateBackfill.Sql)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `Domain/Common/Utils/StoreBillingUtils.cs` | Modify | `GetNextDueDate` → `DateOnly?` sig. `GetStatus` → nullable params |
| `Domain/Interfaces/Services/IDateTimeProvider.cs` | Delete | Moved to Application |
| `Application/Abstractions/Time/IDateTimeProvider.cs` | Create | Relocated interface |
| `Application/Services/Billing/BillingService.cs` | Modify | Inject `IDateTimeProvider`, drop `?? DateOnly.MaxValue` |
| `Application/Features/.../GetStoresToCollectQuery.cs` | Modify | Inject clock, drop `?? DateOnly.MaxValue` |
| `Application/Features/.../GetMeQuery.cs` | Modify | Inject clock for `IsInTrial` computation |
| `Application/Features/.../UpdateStoreCommand.cs` | Modify | Inject clock for activation-on-first-paid |
| `Application/Features/.../RegisterStorePaymentCommandValidator.cs` | Create | `StoreId.NotEmpty()` |
| `Application/Services/Billing/StoreBillingService.cs` | Delete | Dead code |
| `Domain/Interfaces/Services/Billing/IStoreBillingService.cs` | Delete | Dead interface |
| `Infrastructure/Migrations/PaymentStartDateBackfill.cs` | Create | Shared SQL constant |
| `Infrastructure/Migrations/<ts>_BackfillPaymentStartDate.cs` | Create | EF migration |
| `SMCA.WebApi.E2ETests/Infrastructure/MutableDateTimeProvider.cs` | Create | Test clock with `Pin()` scope |
| `SMCA.WebApi.E2ETests/Infrastructure/BillingSeed.cs` | Create | Intent-revealing seed helpers |
| `SMCA.WebApi.E2ETests/Infrastructure/AppTestFactory.cs` | Modify | Add `MutableDateTimeProvider` property + `ConfigureTestServices` override registering `IDateTimeProvider` (replaces existing singleton). Currently has no `ConfigureTestServices` — must be added from scratch |
| `SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs` | Modify | Expose `Clock` property |
| `SMCA.WebApi.E2ETests/Billing/*.cs` | 12+ files | New E2E test suites |
| `Application.Tests/DomainUtils/StoreBillingUtilsTests.cs` | Modify | Add 3 null-boundary + month-end cases; update 3 `IsPaidPlanActive` calls to pass `DateOnly?` for `nextDueDate` |
| `Application.Tests/Services/Billing/BillingServiceTests.cs` | Create | Free store / paid store / commission / months-active |

## Interfaces / Contracts

```csharp
// Application/Abstractions/Time/IDateTimeProvider.cs
namespace Application.Abstractions.Time;
public interface IDateTimeProvider
{
    DateTimeOffset UtcNow { get; }
}

// Modified StoreBillingUtils signatures
public static DateOnly? GetNextDueDate(DateOnly? paymentStartDate, int trialMonths, DateOnly? lastPaidBeforeDate);
public static StoreBillingStatusType GetStatus(DateOnly? paymentStartDate, DateOnly? nextDueDate, DateOnly today, int dueSoonDays, int graceDays);

// E2ETests/Infrastructure/MutableDateTimeProvider.cs
public sealed class MutableDateTimeProvider : IDateTimeProvider
{
    public DateTimeOffset UtcNow => _pinned ?? DateTimeOffset.UtcNow;
    public IDisposable Pin(DateTimeOffset dt) { _pinned = dt; return new PinScope(this); }
    private sealed class PinScope(MutableDateTimeProvider owner) : IDisposable
    {
        public void Dispose() => owner._pinned = null;
    }
    private DateTimeOffset? _pinned;
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| **Unit** | `BillingService` (new) | 7 tests: null start → NoAplica, no throw; free plan type; paid plan type; amount from modules; amount from last payment; reseller commission; months-active non-negative |
| **Unit** | `StoreBillingUtils` (extend) | 3 new tests: `GetNextDueDate(null)` → null; `GetStatus(null, null)` → NoAplica; Jan-31 + 1 month → Feb-28 |
| **E2E** | `GET /auth/me` | Free store / PorVencer / EnGracia / trial boundary. Clock pinned via `MutableDateTimeProvider` |
| **E2E** | `PUT /stores/{id}/payment-date` | ReSeller 403, unknown store 400, empty StoreId 400, missing PaymentStartDate 400 |
| **E2E** | `POST /stores/{id}/payments` | SuperAdmin 200, unauthenticated 401, OwnerAdmin 403, null start 400, amount = module sum, commission persisted, due-date advances |
| **E2E** | `GET /stores/to-collect` | ReSeller scoping, AlDia excluded, Vencido excluded, PorVencer+EnGracia included, role rejection |
| **E2E** | `GET /stores/reseller-commissions` | SuperAdmin sees all, unauthenticated 401, role rejection, grouping by period |
| **E2E** | `PUT /stores/{id}` | Activation on paid module sets start date, free modules leave null, existing unchanged |
| **E2E** | `POST /features/activate` | Statistics module price = 1000 |

## Migration / Rollout

**PR1 (production risk):**
1. Deploy backfill migration SQL against production database
2. Deploy new binaries (null-safe utils, clock injection, validator, dead-code removal)
3. Verify `/auth/me` no longer 500s on free stores

**PR2 (additive tests only):**
- No production changes — pure test additions. No rollout steps.

**Rollback PR1**: Revert commits. Run manual inverse SQL:
```sql
UPDATE "Store" SET "PaymentStartDate" = '0001-01-01'
WHERE "PaymentStartDate" IS NULL AND /* production-safe filter */;
```

## Open Questions

- None. Both specs and pre-existing design are fully resolved.
