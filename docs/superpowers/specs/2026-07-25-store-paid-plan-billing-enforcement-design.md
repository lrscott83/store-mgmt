# Store Paid-Plan Billing & Enforcement — Design

- **Date:** 2026-07-25
- **Status:** Approved design, pending implementation plan
- **Scope:** Backend (.NET, `backend/src`) + React frontend (`frontend-react/apps/web-store-pos`).

## Goal

Turn the currently-disconnected billing scaffolding into a working per-store paid-plan
lifecycle:

1. The store **Owner** activates the paid plan once. From then on it is payment-driven.
2. **Super admin** or the store's **ReSeller (Gestor)** records payments; each payment
   creates a `StorePayment` row and computes the Gestor's commission.
3. If a store does not pay by its due date **+ 5 days grace**, the backend **auto-downgrades
   it to the free plan** (paid modules stop being entitled). Reversible when paid.
4. The React app **notifies** the owner: trial mode + last date to pay, and shows a
   past-due/downgraded banner.
5. A **collections view** lists stores due within 5 days or in grace, for super admin (all)
   and each ReSeller (their own stores).

## Current state (from codebase exploration — all greenfield)

- `StorePayment` entity/table/status enum exist but **nothing creates, reads, or updates rows**;
  no scheduled job anywhere. `StoreDto.NextPaymentDate` is dead (unmapped).
- Entitlement (`GetMeQuery` → `GetAvailableModulesByStoreIdAsync`) gates **only** on `IsActive`
  flags — **no payment gate**. Insertion point for enforcement.
- `Store.PaymentStartDate` is **non-nullable** `DateOnly`, set at store creation to
  `today + TestingPeriodInMonths` (config, default 1). Only a SuperAdmin can edit it.
- Price per module: `CurrentPriceServiceUtils.GetCurrentPrice(price, percent, flat) =
  price − price×percent/100 − flat` (floored at 0). Store total =
  `StoreProfile.GetStoreModuleTotalCurrentPrice` (sum of paid modules' current price).
- **"Plan"** is not stored — it is derived from whether the store has active
  non-`priceIncluded` `StoreModule` rows (see `plan-picker.tsx`).
- **Gestor = `ReSeller`** (RoleType 4), groups Owners via `ReSellerOwner` (unique per owner).
  `ReSeller`/`ReSellerOwner` carry `PercentDiscountPrice` + `DiscountPrice`, **applied
  nowhere today**. Config `ReSellerPercentDiscountPrice` seeded `25` (code fallback `20`).
- Client `UserModel` has **no** payment/trial fields. Auth banner would mount in
  `app/shared/components/app-layout.tsx`.

## Out of scope

- No payment gateway / online payment. Payments are recorded manually by super admin / ReSeller.
- No scheduled job / background service. Enforcement and all statuses are **computed on read**
  (reversible, no destructive writes, auto-recovers on payment). No email/push — in-app only.
- The Gestor discount does **not** change what the store pays; it only determines the Gestor's
  **commission** out of what was paid.
- No debt accumulation. There is a single next due date; miss it (+grace) → downgrade. No
  stacking of owed months.

## Domain model changes

### Store
- `PaymentStartDate` becomes **nullable** (`DateOnly?`). Semantics change to **"when the Owner
  activated the paid plan"**. `null` = never activated the paid plan (pure free). Migration:
  alter column to nullable; existing rows keep their value (treated as already-activated).
- Set to `today` (UTC) the first time a store transitions to the paid plan (a paid module is
  added while `PaymentStartDate == null`). Never overwritten afterward by plan/module changes.
  SuperAdmin may still edit it directly (existing capability).

### StorePayment (new fields; keep existing)
- `ReSellerId` `Guid?` (**nullable**) — the Gestor the store's owner belonged to at payment
  time; `null` when the store has no Gestor (came via super admin) → no commission.
- `ReSellerPercentDiscountPrice` `float` — snapshot of the Gestor percent at payment time.
- `ReSellerDiscountPrice` `float` — snapshot of the Gestor flat discount at payment time.
- `ReSellerAmount` `float` — the computed commission (0 when no Gestor).
- `ByReSeller` `bool` — `true` if the ReSeller recorded the payment, `false` if super admin.
- Existing fields used: `StoreId`, `StorePaymentStatusId` (set to `Paid=5`), `PaidDate`
  (`= now`), `PaymentBeforeDate` (**= the new next due date** for this store), `Price`
  (`= amount charged`), `Year`, `Month` (the period being paid).

### System config
- Add `SystemConfigurationType.PaymentGraceDays = 3` (enum value), seeded `"5"`. Repository
  accessor `GetPaymentGraceDaysAsync()` (default fallback `5`).

## Domain rules

### Amount charged
`amount = StoreModuleTotalCurrentPrice(store)` = sum over the store's **active paid**
(`!ModulePriceIncluded`) `StoreModule` rows of `GetCurrentPrice(sm.Price,
sm.ModulePercentDiscountPrice, sm.ModuleDiscountPrice)`.

### Gestor commission (reuses the existing utility)
Given the owner's `ReSellerOwner` (if any) at payment time:
```
commission = amount − GetCurrentPrice(amount, ReSellerOwner.PercentDiscountPrice, ReSellerOwner.DiscountPrice)
           = amount × ReSellerOwner.PercentDiscountPrice / 100 + ReSellerOwner.DiscountPrice
```
When the owner has no `ReSellerOwner`: `ReSellerId = null`, all reseller fields `0`,
`commission = 0`.

### Due date & status (computed, no job)
Let `graceDays = GetPaymentGraceDaysAsync()` (5), `trialMonths = GetTestingPeriodInMonthsAsync()` (1).

- If `Store.PaymentStartDate == null` → store is **not on paid** (pure free). No billing, no banner.
- `nextDueDate`:
  - No `Paid` StorePayment yet → `PaymentStartDate + trialMonths + 1 month`
    (1 free trial month + first post-paid month → first due ≈ activation + 2 months).
  - Otherwise → the latest `Paid` StorePayment's `PaymentBeforeDate`.
- Let `dueSoonDays = 5` (fixed pre-due window, matches "5 días o menos"). Grace is `graceDays` (5, config).
- **Status** (single source, `today` in UTC date):
  - `AlDia` — `today < nextDueDate − dueSoonDays` (nothing to show).
  - `PorVencer` — `nextDueDate − dueSoonDays <= today <= nextDueDate` (due within 5 days).
  - `EnGracia` — `nextDueDate < today <= nextDueDate + graceDays` (overdue, within grace).
  - `Vencido` — `today > nextDueDate + graceDays` (grace expired).
- **Paid plan active** (entitlement) = `PaymentStartDate != null && today <= nextDueDate + graceDays`.
  When `Vencido`, the paid plan is inactive → free.

### Enforcement (auto-downgrade, compute-on-read)
In the entitlement path (`GetAvailableModulesByStoreIdAsync` / a new
`StoreBillingService.IsPaidPlanActive(store)`), when a store is `Vencido`, **exclude the
non-`priceIncluded` modules** from the returned module set (and their features). Effect:
`GetMeQuery` returns only free `StoreModuleIds`/`FeatureIds` → the store operates on the free
plan. `StoreModule.IsActive` rows are **not** modified (reversible; paying restores access on
the next `getMe`). `PaymentStartDate` is **never** cleared by downgrade.

### Plan activation lock (Owner)
- Activating the paid plan (adding paid modules while `PaymentStartDate == null`) is an
  **Owner** action, allowed **once**. It sets `PaymentStartDate = today`.
- Once `PaymentStartDate != null`, the Owner **cannot** change the plan (neither re-activate
  paid nor drop to free): the `PlanPicker` renders **read-only** for the owner, showing the
  effective plan and deferring to the payment banner. Restoration after a downgrade happens by
  **paying the debt** (super admin / ReSeller records a payment), not by the owner toggling.
- Super admin retains full control of a store's modules and `PaymentStartDate`.

### Recording a payment
New command/endpoint `POST /v1/stores/{storeId}/payments` (`RegisterStorePaymentCommand`), authorized for:
- **Super admin** — any store.
- **ReSeller** — only stores whose owner belongs to that ReSeller (via `ReSellerOwner`).

Handler:
1. Load store + its owner's `ReSellerOwner` (if any).
2. `amount = StoreModuleTotalCurrentPrice(store)`.
3. Compute `commission`, `ReSellerId`, reseller snapshots as above.
4. `newDueDate = currentNextDueDate + 1 month`.
5. Create `StorePayment{ StoreId, StorePaymentStatusId=Paid, PaidDate=now,
   PaymentBeforeDate=newDueDate, Price=amount, Year/Month=period, ReSellerId,
   ReSellerPercentDiscountPrice, ReSellerDiscountPrice, ReSellerAmount=commission,
   ByReSeller=(caller is ReSeller) }`.

## Client (React) changes

### CurrentUserDto / UserModel — new payment fields
Extend `CurrentUserDto` (backend `GetMeQuery`) and `UserModel`
(`packages/domain/src/models/auth.ts`) with:
- `paymentDueDate: string | null` (ISO date; `null` when not on paid).
- `isTrial: boolean` (on paid, still within the first trial month).
- `paymentStatus: 'AlDia' | 'PorVencer' | 'EnGracia' | 'Vencido' | 'NoAplica'`.

(`storeModuleIds` already reflects the effective plan because entitlement excludes paid modules
when `Vencido`; these fields drive the banner and the read-only lock.)

### Trial / payment banner
New component mounted in `app/shared/components/app-layout.tsx` (above `<Breadcrumbs/>`),
reading `useAuthStore().user`. Shows (neutral Latin American Spanish — NO voseo):
- `Trial` / `PorVencer` / `EnGracia`: "Estás usando el plan Pago. Última fecha de pago:
  {paymentDueDate}." (trial variant adds "en modo prueba").
- `Vencido`: "Tu plan Pago venció por falta de pago. La tienda está en el plan Gratis hasta
  que se registre el pago."
- `NoAplica` / free: no banner.

### PlanPicker read-only lock
When editing a store whose `PaymentStartDate != null`, the owner-facing `PlanPicker` renders
read-only (shows effective plan + status, no plan switch). Super admin keeps the interactive
picker.

### Collections view (new page)
Route + component listing stores with `PorVencer` or `EnGracia` status, columns: store name,
owner, plan amount, due date, days left / days into grace, status badge. Scope:
- Super admin — all stores.
- ReSeller — only stores of their owners.
Backed by a new query/endpoint returning the computed billing status per store, filtered to
`PorVencer`/`EnGracia`.

### ReSeller commission view (new page)
Route + component for the ReSeller (and super admin) showing collected commission: sum of
`StorePayment.ReSellerAmount` for the ReSeller's stores, by period. Backed by a new query.

## Testing

- **Backend:** unit tests for `StoreBillingService` (due-date, status, `IsPaidPlanActive`
  across boundaries: trial, due-soon, grace edges at exactly `nextDueDate + graceDays`,
  overdue), commission computation (with/without reseller, percent+flat), and the record-payment
  command (authorization super-admin vs reseller-scope, `ByReSeller`, snapshots, due-date
  advance). Entitlement test: overdue store returns only free `StoreModuleIds` from `GetMe`.
- **Frontend:** banner variants by `paymentStatus`; PlanPicker read-only when
  `PaymentStartDate != null`; collections list filtering + scope; commission view totals.
  Tests use the existing `<IntlProvider locale="es" messages={esMessages}>` wrapper.

## Delivery slices (implementation order)

1. **Data model** — `Store.PaymentStartDate` nullable + set-on-activation; `StorePayment` new
   fields; `PaymentGraceDays` config; migrations.
2. **Billing domain service** — amount, commission, due-date, status, `IsPaidPlanActive`
   (pure, fully unit-tested).
3. **Enforcement** — wire `IsPaidPlanActive` into entitlement (`GetAvailableModulesByStoreIdAsync`
   / `GetMeQuery`); overdue store → free modules.
4. **Record-payment** endpoint/command (super admin + reseller-scoped) creating `StorePayment`
   + commission + `ByReSeller`, advancing due date.
5. **Client plan/payment state** — extend `CurrentUserDto`/`UserModel`; banner in `app-layout`;
   PlanPicker read-only lock.
6. **Collections view** — query/endpoint + page (scoped).
7. **ReSeller commission view** — query/endpoint + page.

Each slice is independently testable; 1→3 deliver enforcement, 4 enables real payments,
5 delivers the notification the user asked for, 6–7 are the management views.
