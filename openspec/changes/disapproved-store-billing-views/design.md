# Design: Disapproved Store Billing Views

## Technical Approach

Extend the billing engine's existing `!store.Approved` rule (`BillingService.cs:60,72,101-102`) to the store-view DTO layer and the two React store cards. Backend: plan-name guard at the single mapping source `StoreProfile.ResolvePlanType` (covers `StoreDto`, `StorePlanDto`, `OwnerStoreDto` — REQ-1); the three query handlers null due dates before returning (REQ-2). Frontend: both cards gate price/date on `planType !== 'Gratis'` (mirror of `store-plan.tsx` — REQ-3). REQ-4 resolves via the backend contract; REQ-5 is a zero-implementation non-goal guard.

## Architecture Decisions

| Decision | Options | Tradeoff | Decision |
|---|---|---|---|
| D1 Plan-name guard | (a) in `ResolvePlanType(Store)`; (b) per-ForMember; (c) in `StoreBillingUtils` | (a) one source, all DTOs; (b) drift risk; (c) pollutes util shared with billing engine | **(a)** — idempotent with existing `"Gratis"` fallback |
| D2 Due-date guard | (a) handler ternary; (b) inside `GetNextDueDate` | (a) mirrors `BillingService`, zero blast radius; (b) alters billing-engine behavior | **(a)** — `store.Approved ? GetNextDueDate(...) : null` |
| D3 Frontend gate key | (a) `planType !== 'Gratis'`; (b) `store.approved` | REQ-3 mandates (a), mirror of `store-plan.tsx`; (b) contracts against backend flag | **(a)** |
| D4 Unit-test placement | (a) additive in existing suites; (b) new files everywhere | (a) reuses fixtures; (b) zero-touch but duplicates setup | **(a)** — existing tests unchanged; see Open Questions |

## Data Flow

    by-current-user ─┐
    my-stores       ─┼→ handler → mapper (ResolvePlanType) → DTO
    {id}/plan       ─┘        └→ !Approved ? null : GetNextDueDate
        ▼
    cards → price/date gated on planType !== 'Gratis'

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/src/Application/Mappings/StoreManagement/StoreProfile.cs` | Modify | `!Approved → "Gratis"` guard; 3 `MapFrom` sites pass `src` |
| `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoresByCurrentUser/GetStoresByCurrentUserQuery.cs` | Modify | `NextPaymentDate` null when `!Approved` (:72-75) |
| `backend/src/Application/Features/StoreManagement/Stores/Queries/GetMyStores/GetMyStoresQuery.cs` | Modify | `NextDueDate` null when `!Approved` (:77-81) |
| `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStorePlan/GetStorePlanQuery.cs` | Modify | `NextDueDate` null when `!Approved` (:50-54) |
| `frontend-react/apps/web-store-pos/app/admin/stores/components/store-card-list.tsx` | Modify | Price gated on `planType !== 'Gratis'`; combined `(showPrice \|\| showDate)` |
| `frontend-react/apps/web-store-pos/app/management/stores/components/owner-store-card.tsx` | Modify | `isOnPaidPlan = planType !== 'Gratis' && getIsOnPaidPlan(modules)` |
| `backend/src/SMCA.WebApi.E2ETests/Stores/DisapprovedStoreBillingViewsTests.cs` | Create | 3 endpoints, disapproved paid-snapshot store vs approved control; inline seed/cleanup per `GetMeBillingZeroAmountTests` |
| `backend/src/Application.Tests/Features/StoreManagement/Stores/Queries/GetStorePlan/GetStorePlanQueryHandlerTests.cs` | Create | New suite (none existed); real `StoreProfile` mapper |
| `backend/src/Application.Tests/Mappings/StoreManagement/StoreProfilePlanTypeTests.cs` | Modify* | Additive: approved:false → `"Gratis"` on all 3 DTOs |
| `backend/src/Application.Tests/Features/StoreManagement/Stores/Queries/GetStoresByCurrentUser/GetStoresByCurrentUserQueryHandlerTests.cs` | Modify* | Additive: disapproved + payment → null `NextPaymentDate` |
| `backend/src/Application.Tests/Features/StoreManagement/Stores/Queries/GetMyStores/GetMyStoresQueryHandlerTests.cs` | Modify* | Additive: disapproved + payment → null `NextDueDate` |
| `frontend-react/apps/web-store-pos/app/management/stores/components/__tests__/owner-store-card.test.tsx` | Create | Gratis + paid modules → no price/date; Pago → both |
| `frontend-react/apps/web-store-pos/app/admin/stores/components/__tests__/store-card-list.test.tsx` | Modify* | Additive: Gratis + paid modules → no price/date |

\* Additive-only; existing test cases change zero behavior. No E2E or frontend E2E/support file is touched.

## Interfaces / Contracts

- `*.PlanType` on all 3 DTOs: `"Gratis"` when `!Approved`, else the `StorePlanType` description. Never `"Free"` — that stays the `/me` contract (REQ-5).
- Due-date fields: `null` when `!Approved`, regardless of `PaymentStartDate`, `NextDueDateOverride`, or payment history.

## Testing Strategy

| Spec Req | New Test | Layer |
|---|---|---|
| REQ-1 / REQ-SCU-1 | `DisapprovedStoreBillingViewsTests`: disapproved (`approved:false` + `paymentStartDate` + default `StorePlanId=Pago` + paid module) + approved control; by-current-user as super-admin AND owner-admin → `"Gratis"` + null date; control keeps `"Pago"` + date | E2E |
| REQ-1 | `StoreProfilePlanTypeTests` approved:false → `"Gratis"` per DTO | Unit |
| REQ-2 | New plan-handler suite (real mapper) + 2 existing handler suites: disapproved + payment → null date | Unit |
| REQ-MS-1 / REQ-3 | E2E my-stores → `"Gratis"` + null; new `owner-store-card.test.tsx` | E2E + Unit |
| REQ-AS-1 / REQ-3 | `store-card-list.test.tsx` additive | Unit |
| REQ-4 | E2E plan endpoint feeds dialog/filter; existing keyed units untouched | E2E |
| REQ-5 | Zero tasks — existing `/me` billing E2E (untouched) pins `"Free"`/`NoAplica` | — |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration, no feature flag. Rollback: revert 6 production edits, delete 3 new files, revert 3 additive test changes.

## Edge Cases

- Approve→pay→disapprove: recorded payment / `NextDueDateOverride` must NOT resurrect dates — guard wraps the whole computation; payment variant pinned in E2E + units.
- Dangling colon: gated price + no date must not render bare `Gratis:`.
- Approved store, paid modules, `planType "Gratis"` (desync): price hidden per planType key — consistent with `store-plan.tsx`; not a regression target.
- ReSeller/StoreUser 403 gates unchanged.

## Open Questions

- [ ] Confirm additive methods in existing unit-test files (alternative: new files — D4).
- [ ] Confirm disapproved+paid-snapshot stores remain reachable in lifecycles post-change.