# Billing Endpoints — Testing Reference

Date: 2026-07-28
App: `store-mgmt` — backend (`backend/src`)
Status: **reference material.** The executable scenarios that used to live here were merged into `2026-07-28-billing-e2e-coverage-plan.md` as Tasks 16–19. This file keeps only what is not a test: the behaviour a test author has to understand before writing assertions, and two findings that belong to no single task.

## Where everything lives now

| Document | Holds |
|---|---|
| `2026-07-28-billing-e2e-coverage-design.md` | The design and the two production defects |
| `2026-07-28-billing-e2e-coverage-plan.md` | Every task and every test — Tasks 1–7 fixes, 8–15 infrastructure and core matrix, 16–19 the full per-endpoint suites |
| This file | The authorization model, the error envelope, endpoint descriptions and dependencies, and the two open findings |

---

## The authorization model

`StoresController` carries `[HasPermission(SuperAdmin, StoresAdmin)]` at class level; each of the four new endpoints overrides it at method level. `HasUserPermissionRequirementFilter.OnAuthorization` resolves as follows:

| Caller | Outcome | Status |
|---|---|---|
| No token / no `UserExternalId` | `UnauthorizedResult` | **401** |
| SuperAdmin | The `if (!IsSuperAdmin)` guard skips every check | **200** |
| ReSeller **with** the `StorePaymentAdmin` feature | Passes the filter, reaches the handler | 200 or handler error |
| OwnerAdmin / StoreUser **without** the feature | `ForbidResult` | **403** |
| ReSeller who does not own the target store | Passes the filter, **handler** rejects | **400** |

`StorePaymentAdmin` is declared `[HasRoles(SuperAdmin, ReSeller)]`, so an OwnerAdmin can never hold it. `payment-date` requires `SuperAdmin` alone — a ReSeller holding `StorePaymentAdmin` still gets 403 there.

This is why authorization assertions in the plan are exact statuses rather than `BeOneOf`. A test that accepts both 400 and 403 cannot tell you which layer rejected the request, and will stay green if the filter stops working and the handler guard catches it instead.

## The error envelope

`ErrorHandlerMiddleware` builds the response body differently per exception type:

| Thrown | Status | `ApiResponse.Errors` populated? |
|---|---|---|
| `ValidationException` (FluentValidation pipeline) | from the exception | **Yes** — assert the field code |
| `ApiException` (handler role and state guards) | from the exception | **No** — assert status and `Succeeded == false` only |
| `KeyNotFoundException` | 404 | No |
| anything else | 500 | No |

The existing test named `Update_name_colliding_with_another_store_returns_400_empty_errors` documents this. Asserting a field code on a handler-guard rejection always fails: the code never gets written.

---

## The four endpoints

### `PUT /api/v1/stores/{storeId}/payment-date`

Sets `Store.PaymentStartDate`, which starts the billing clock. SuperAdmin only. The route id wins over any id in the body — the controller rebuilds the command as `new SetStorePaymentDateCommand(storeId, command.PaymentStartDate)`.

Dependencies: `IGetStoreByIdService`, `IStoreRepository`, `IApplicationUnitOfWork`, `IHttpContextService`, `IStringLocalizer<I18n>`. Database only; nothing to mock at the end-to-end level.

### `POST /api/v1/stores/{storeId}/payments`

Records a manual payment. Computes the amount as the sum of `GetCurrentPrice` over active, non-free `StoreModule`s; snapshots the owner's `ReSellerOwner` discount to compute the commission; advances the due date by one month; persists a `StorePayment` with status `Paid`.

Dependencies: `IStoreRepository.GetStoreWithModulesAndReSellerOwnerAsync` and `IsStoreOwnedByReSellerUserAsync`, `IStorePaymentRepository`, `ISystemConfigurationRepository` (`TestingPeriodInMonths`), `IHttpContextService`, `IApplicationUnitOfWork`. Database only.

The commission is a **snapshot**: `ReSellerAmount` is computed at payment time from the reseller's rate then and stored. Changing the rate later must not move historical payouts.

### `GET /api/v1/stores/to-collect`

Lists stores whose billing status is `PorVencer` or `EnGracia`, ordered by due date ascending. SuperAdmin sees every paid store; a ReSeller sees only stores it owns.

Dependencies: `IStoreRepository.GetPaidStoresAsync` / `GetPaidStoresByReSellerUserAsync`, `IStorePaymentRepository.GetLastByStoreIdAsync` — called once per store, an N+1 by construction — `ISystemConfigurationRepository`, `IHttpContextService`.

`OwnerName` resolves through `store.Owner?.User?.FullName ?? ""`, two optional navigations deep. If either is not included by the repository query the field silently becomes an empty string, which no status assertion would catch.

State boundaries, with the seeded configuration (`TestingPeriodInMonths = 1`, `PaymentGraceDays = 5`, due-soon hard-coded to 5):

```
start 2026-01-10 → due 2026-03-10

  ..-03-04   AlDia       excluded
    03-05    PorVencer   included   ← due - 5, the due-soon edge
    03-10    PorVencer   included   ← the due day itself
    03-11    EnGracia    included   ← first grace day
    03-15    EnGracia    included   ← last grace day
    03-16..  Vencido     excluded   ← first day past grace
```

### `GET /api/v1/stores/reseller-commissions`

Aggregates paid payments carrying a reseller into buckets by year and month, each with a payment count and summed commission, ordered by year then month descending. SuperAdmin sees every reseller; a ReSeller sees only its own.

Dependencies: `IStorePaymentRepository.GetAllPaidWithReSellerAsync` / `GetPaidWithReSellerByReSellerUserAsync`, `IHttpContextService`. No date logic and no configuration reads — the only one of the four that does not depend on the clock.

The query filters on `ReSellerId.HasValue` alone, so a payment with a reseller and a **zero** commission still produces a bucket. The deleted `StoreBillingService.GetReSellerCommissionsAsync` also required `ReSellerAmount > 0`. The handler is the surviving definition; Task 19 pins it.

---

## Open findings

Neither is fixed by any task in the plan. Both are recorded here so they are not lost.

**1. The authorization filter runs `BillingService` on every `[HasPermission]` request.** `HasUserPermissionRequirementFilter.OnAuthorization` calls `_billingService.GetStoreBillingSummaryAsync(storeId).Result` for every non-SuperAdmin caller. If defect F2 is real, the `ArgumentOutOfRangeException` surfaces there — inside a `.Result`, so it reaches `ErrorHandlerMiddleware` wrapped in an `AggregateException`, hits the `default` branch and returns **500**. F2 would therefore not affect only `/auth/me`: it would break **every store-scoped endpoint** for any OwnerAdmin or ReSeller whose store is on the free plan. The blast radius stated in the design document is understated. Confirm with the first unit test of Task 1 before writing anything else.

**2. `FilterForBilling` is duplicated verbatim.** The same method, comment included, lives in `GetMeQueryHandler` and in `HasUserPermissionRequirementFilter`. Two copies of the rule that decides whether a customer keeps access to paid modules. When the policy changes, one will be updated and the other will not, and the permission check and the profile response will disagree. The change is small but it alters an authorization path, so it deserves its own PR with its own review.
