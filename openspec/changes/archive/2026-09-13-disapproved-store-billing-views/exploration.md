# Exploration — disapproved-store-billing-views

## Decision to verify (business rule)

"A store with `Store.Approved == false` pays nothing AND must NOT show payment prices or due dates in any store view."

Two plan-name/due-date surfaces derive from `StorePlanId` / `PaymentStartDate` WITHOUT the `Approved` guard that the billing engine already applies (`BillingService.cs:56-60,72,101-102` — already correct: null clock → `PlanType "Free"`, `NoAplica`, `NextDueDate null`, no trial, `PaymentBanner null`). The guard exists only in the billing summary; the listing/plan-view DTOs leak plan name and due dates.

## Current state

- **PlanName surfaces** (`StoreProfile` maps `PlanType` only from `StorePlanId` via `ResolvePlanType`):
  - `backend/src/Application/Mappings/StoreManagement/StoreProfile.cs:25` → `StoreDto.PlanType` (consumers: GetStoresQuery, GetStoresByCurrentUserQuery, GetStoreByIdQuery)
  - `StoreProfile.cs:32` → `StorePlanDto.PlanType` (consumer: GetStorePlanQuery)
  - `StoreProfile.cs:38` → `OwnerStoreDto.PlanType` (consumer: GetMyStoresQuery)
  - `ResolvePlanType` at `StoreProfile.cs:59-64` is pure StorePlanId→description ("Gratis"|"Pago"|"Superior"|"VIP"); guard can live there or in the ForMember mappings.
- **DueDate surfaces** (computed from `store.PaymentStartDate` via `StoreBillingUtils.GetNextDueDate`, no Approved guard):
  - `GetStoresByCurrentUserQuery.cs:72-75` → `StoreDto.NextPaymentDate` (feeds super-admin `/admin/stores` and ReSeller/Owner lists — route `GET /v1/stores/by-current-user`)
  - `GetMyStoresQuery.cs:77-81` → `OwnerStoreDto.NextDueDate` (feeds owner `/management/my-stores` — route `GET /v1/stores/my-stores`)
  - `GetStorePlanQuery.cs:50-54` → `StorePlanDto.NextDueDate` (feeds `store-plan.tsx`, plan modal — route `GET /v1/stores/{id}/plan`)
- **No due-date computation** (already null): `GetStoresQuery.cs` (route `/api/v1/stores/list/{includeInactive}` — mapper-only, `NextPaymentDate` always null) and `GetStoreByIdQuery.cs` (route `GET /v1/stores/{id}` — `NextPaymentDate` null). PlanType still needs the guard on both.
- **Already correct**: `GetStoresToCollectQuery` — repo `GetPaidStoresAsync()` filters `s.Approved`, so to-collect already excludes disapproved stores.
- **Domain/enum**: `StorePlanType.cs` Gratis=1/Pago=2/Superior=3/VIP=4; DTO contract name is `"Gratis"` (frontend `PLAN_NAME_KEYS`), distinct from BillingService's `"Free"` in the summary DTO.
- **Commands**: `ApproveStore/DisapproveStoreCommand` only flip `Approved` — they never clear `StoreModules` or `PaymentStartDate`, so a disapproved store CAN retain paid snapshot modules + a non-null `PaymentStartDate`. This makes frontend price leaks real.

## Frontend impact

Backend-only fix makes planType `"Gratis"` + `NextDueDate/NextPaymentDate null` for disapproved stores. That covers:

- `store-plan.tsx:83` — `isOnPaidPlan = planType !== '' && planType !== 'Gratis'` → next-due banner + active-panel highlight hidden. ✓ backend-only
- `edit-plan-modal.tsx:75` — banner gated `storePlanType !== 'Gratis' && nextDueDate`. ✓ backend-only
- `/admin/stores` plan filter — disapproved stores move to the Gratis bucket automatically. ✓ backend-only

BUT the card PRICE leaks — both cards derive paid-ness client-side from the module snapshot, NOT from planType/approved:

- `store-card-list.tsx` (super-admin card) — `PlanLine` renders `priceInfo` (Σ paid module `currentPrice` from `store.modules`) whenever non-null; `showDate` is gated on `planType !== 'Gratis'` but the PRICE is not. A disapproved store with paid snapshot modules still shows "Gratis: $X".
- `owner-store-card.tsx` — `getIsOnPaidPlan = modules.some(m => !m.priceIncluded && m.selected)` → price line gated only on that; `nextDueDate` gated on `isOnPaidPlan && store.nextDueDate` (date gets hidden by backend null, but the price remains).
- `my-stores.tsx` merges catalog+snapshot via `mergeStoreModules` (`store-modules.ts:9-23`) — the snapshot's paid modules drive `isOnPaidPlan`.

**Conclusion**: to fully satisfy the rule, the two card components need a frontend gate tying price visibility to `store.planType !== 'Gratis'` (mirror of `store-plan.tsx`) or `store.approved`.

## Approaches

1. **Backend-only guard (PlanType → "Gratis", dates → null)**
   - Pros: matches billing engine rule; single source of truth; fixes labels/dates/filter/plan view; no E2E breakage.
   - Cons: does NOT hide card PRICES (module-snapshot pricing is client-side) — business rule only partially met.
   - Effort: Low-Medium (4 mapping additions + 3 handler guards + unit/E2E tests).

2. **Backend guard + frontend card gates (recommended)**
   - Backend as in (1), plus `store-card-list.tsx` PlanLine price gate and `owner-store-card.tsx` price/date gate on planType (or approved).
   - Pros: fully satisfies the rule end-to-end; frontend tests exist for both cards (no component test pins the leak case).
   - Cons: touches frontend code — outside the "backend add-tests-only" scope; needs user approval; frontend unit tests must be added.
   - Effort: Medium.

3. **Data invariant: disapproved stores never keep paid modules/PaymentStartDate**
   - Pros: shrinks the leak at the root.
   - Cons: contradicts current `Approve/DisapproveStoreCommand` behavior (only flip Approved); changes seed/store-lifecycle semantics — risky, larger blast radius, and `StoreProfile.PlanType` still needs the guard regardless.
   - Effort: High — not recommended for this change.

## Test-coverage gaps

Existing tests never pin the leak (verified): all billing E2E (`ApprovedStoreBillingTests`, `GetMeBillingZeroAmountTests`, `AuthMePlanModulesTests`, `WarehousesBillingTests`, `StoreCreationTrialTests`) assert `PlanType` only on `/me` (summary — already correct); store-view DTOs are never asserted at PlanType/due-date level for disapproved stores; `MyStoresTests M-15` disapproved store asserts flags only; `StoresListTests`/`StorePlanTests` assert names only (PlanData has no PlanType field); unit handler tests + `StoreProfilePlanTypeTests` all use approved:true.

NEW coverage needed:

- **Backend E2E (allowed — adding new tests only)**:
  1. `GET /v1/stores/by-current-user` — disapproved store with paid snapshot modules + non-null PaymentStartDate → `PlanType "Gratis"`, `NextPaymentDate null`
  2. `GET /v1/stores/my-stores` — same shape → `PlanType "Gratis"`, `NextDueDate null`
  3. `GET /v1/stores/{id}/plan` — same shape → `PlanType "Gratis"`, `NextDueDate null`
- **Backend unit**: extend `StoreProfilePlanTypeTests` (approved:false Pago → "Gratis"); add approved:false variants to `GetStoresByCurrentUserQueryHandlerTests`, `GetMyStoresQueryHandlerTests`, and `GetStorePlanQueryHandlerTests`.
- **Frontend unit (if approach 2)**: owner card + super-admin card render no price for `approved:false` store with paid snapshot modules.

## Existing-test risk

**None expected.** Every existing backend E2E/unit test that touches PlanType/due dates uses approved:true stores; the only disapproved-store E2E assertions (`MyStoresTests M-15`, `ApprovedStoreBillingTests`) assert flags or billing summary, never view DTO money/dates. Frontend component tests (`my-stores.test.tsx`, `store-plan.test.tsx`) use approved stores or free-plan shapess — gating price on planType keeps 'free plan renders no price' green and 'paid plan renders price' green. Frontend E2E `owner-stores.spec.ts:294-295` pins free-store price/date hidden (approved free store — unaffected).

## Risks

- **Scope**: the full rule requires a frontend change to the two card components — verify with the user whether this change should extend beyond backend add-tests-only scope (CLAUDE.md rule).
- **String contract**: DTO PlanType must resolve to `"Gratis"` (not `"Free"`, which is the BillingService summary contract) — keep the two layers' naming distinct.
- **Plan filter shift**: disapproved Pago/Superior stores automatically move from the `not-free` default bucket to Gratis — desired per rule, but a visible UX change on `/admin/stores`.
- **Store lifecycle**: `Approve/Disapprove` never clears modules/paymentStartDate — seeds and future flows must keep producing disapproved stores with paid snapshots or the leak returns.

## Ready for proposal

Yes — with one decision the user must make before proposal: whether card PRICE hiding requires the frontend gate (approach 2) or whether the backend-only change (approach 1 — which hides everything except the two card prices) is accepted as the agreed scope.