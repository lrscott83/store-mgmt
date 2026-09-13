# Tasks: Disapproved Store Billing Views

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650–780 (≈40 prod, ≈310 backend tests, ≈260 frontend) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend Guard + unit tests: StoreProfile + 3 handlers | PR 1 | `dotnet test backend/src/Application.Tests/Application.Tests.csproj` | N/A — mocked repos; no external services | Revert 4 prod files + 4 unit suites |
| 2 | E2E: DisapprovedStoreBillingViewsTests.cs | PR 2 | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter DisapprovedStoreBillingViews` | Real PostgreSQL `smca_test` via WebAppFixture | Delete new file; no prod diff |
| 3 | Frontend: 2 card gates + tests | PR 3 | `pnpm --filter @store-mgmt/web-store-pos test`; `pnpm typecheck` | Testing Library render; no live backend | Revert 2 cards + 2 test files |

## Phase 1: Backend Unit Guards (RED → GREEN)

- [x] 1.1 RED `StoreProfilePlanTypeTests.cs`: add approved:false (`StorePlanId=Pago`, `PaymentStartDate` set) → `PlanType == "Gratis"` on StoreDto, StorePlanDto, OwnerStoreDto
- [x] 1.2 GREEN `StoreProfile.cs`: `ResolvePlanType(Store src)` — `if (!src.Approved) return "Gratis"`; 3 MapFrom sites (:25,:32,:38) pass `src`
- [x] 1.3 RED `GetStoresByCurrentUserQueryHandlerTests.cs`: disapproved store + recorded payment → `NextPaymentDate` null
- [x] 1.4 GREEN `GetStoresByCurrentUserQuery.cs:72-75`: `store.Approved ? GetNextDueDate(...) : null`
- [x] 1.5 RED `GetMyStoresQueryHandlerTests.cs`: disapproved + payment → `NextDueDate` null
- [x] 1.6 GREEN `GetMyStoresQuery.cs:77-81`: Approved ternary around `GetNextDueDate`
- [x] 1.7 RED NEW `GetStorePlanQueryHandlerTests.cs`: real `StoreProfile` mapper; disapproved → `"Gratis"` + null; approved control → `"Pago"` + computed date (2026-06-01 → 2026-08-01)
- [x] 1.8 GREEN `GetStorePlanQuery.cs:50-54`: Approved ternary

## Phase 2: Backend E2E

- [x] 2.1 Create `DisapprovedStoreBillingViewsTests.cs` (`[Collection("e2e")]`): inline seed per `GetMeBillingZeroAmountTests`/`BillingSeed` — user+OwnerAdmin, `Store.Create(..., approved:false, paymentStartDate:2026-01-10, storePlanId:Pago)`, Management(7)+Statistics(6) modules, recorded `StorePayment` (pins "history doesn't resurrect"), `user.SelectedStoreId`; approved control store same shape
- [x] 2.2 Assert as super-admin `GET /api/v1/stores/by-current-user` and owner `GET /api/v1/stores/my-stores` and `GET /api/v1/stores/{id}/plan`: disapproved → `planType "Gratis"` + `nextPaymentDate`/`nextDueDate` null; control → `"Pago"` + non-null date
- [x] 2.3 Cleanup try/finally, reverse dep order (`StorePayment→StoreModule→Store→Owner→UserRole→User`), `IgnoreQueryFilters`, per `BillingSeed.CleanupAsync`

## Phase 3: Frontend Card Gates (RED → GREEN)

- [x] 3.1 RED `store-card-list.test.tsx` additive: `planType "Gratis"` + paid modules (`currentPrice`) → no `store-price-{id}`, no `store-next-payment-{id}`, no dangling `Gratis:`
- [x] 3.2 GREEN `store-card-list.tsx` `PlanLine`: `showPrice = planType !== 'Gratis'`; render `(showPrice || showDate)`; keep date gate
- [x] 3.3 RED NEW `owner-store-card.test.tsx`: Gratis + paid modules → no `owner-store-price-{id}`/`owner-store-next-due-{id}`; Pago → both render
- [x] 3.4 GREEN `owner-store-card.tsx`: `isOnPaidPlan = store.planType !== 'Gratis' && getIsOnPaidPlan(modules)`

## Phase 4: Verification / Cleanup

- [x] 4.1 Run `dotnet test backend/src/Application.Tests/Application.Tests.csproj` and E2E filtered suite
- [x] 4.2 Run `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` full — existing suites (GetMeBilling*, StorePlan*, MyStores*) untouched and green
- [x] 4.3 Run frontend `pnpm --filter @store-mgmt/web-store-pos test` and `pnpm typecheck`; remove temp code if any

Constraints: E2E tests are untouchable — add-only. REQ-5 → zero tasks; REQ-4 satisfied via backend contract. Threat matrix: N/A (no applicable rows).