# Spec Delta: owner-plan-change

**Change**: owner-plan-change · **Phase**: Spec · **Date**: 2026-09-10 · **Baseline**: openspec/specs (billing, admin-stores, stores-by-current-user, management-stores)

---

## NEW Requirement: Owner Plan Change — `ChangeStorePlan` capability (billing domain)

### Requirement: Owner Plan Change Endpoint

The system SHALL expose `POST /v1/stores/{id}/change-plan` with body `{ storePlanId }`. The caller SHALL be the store's owner (OwnerAdmin whose `SelectedStore`/owned-store graph contains the target store) or SuperAdmin. Any other caller SHALL receive 403.

#### Scenario: Owner changes Gratis→Pago (overdue clock)
- GIVEN a store owned by user U with `StorePlanId=Gratis`, `PaymentStartDate = 2026-01-10` (trial expired, nextDue = 2026-02-10, today = 2026-09-10)
- WHEN U posts `change-plan { storePlanId: Pago }`
- THEN the response is 200 with `data=true`
- AND `Store.StorePlanId` = Pago
- AND the store's active `StoreModules` = catalog priceIncluded modules ∪ Pago members (soft-deleting absent, inserting new, reactivating soft-deleted)
- AND `Store.PaymentStartDate` = 2026-01-10 (UNCHANGED)
- AND `Store.NextDueDateOverride` = 2026-09-10 (today — next payment date becomes today)
- AND `StoreRoleFeatures` regenerated for inserted modules

#### Scenario: Next payment date becomes today — visible
- GIVEN the store above after the change
- WHEN `GET /v1/stores/{id}/plan` is called (or /auth/me billing fields)
- THEN `nextDueDate` = today
- AND billing status computes `PorVencer` (today is within dueSoonDays of due=today) → `IsPaidPlanActive=true` → paid modules NOT gated by FilterForBilling

#### Scenario: Owner changes to paid plan with FUTURE due date
- GIVEN a paid-plan store with nextDue = 2026-12-01, today = 2026-09-10
- WHEN the owner changes to another paid plan
- THEN `PaymentStartDate` and computed `nextDueDate` are unchanged (override NOT set; existing override, if any, is left untouched)

#### Scenario: Owner changes to Gratis
- GIVEN a Pago store (any due state)
- WHEN the owner changes to Gratis
- THEN modules become Gratis membership; `StorePlanId` = Gratis
- AND `PaymentStartDate` unchanged; NO nextDue override is set (existing override cleared? — see AD1: cleared on downgrade)

#### Scenario: Owner changes to VIP
- GIVEN a store owned by U
- WHEN U posts `change-plan { storePlanId: VIP }` (VIP is a paid plan)
- THEN the same paid-plan rules apply: membership modules, anchor preserved, overdue ⇒ override = today

#### Scenario: Not the store's owner
- GIVEN an OwnerAdmin U2 who does NOT own the target store
- WHEN U2 posts change-plan on that store
- THEN 403 Forbidden

#### Scenario: Inactive store or inactive owner user
- GIVEN the target store `IsActive=false` OR the owner user `IsActive=false`
- WHEN change-plan is posted
- THEN 400 with the corresponding error code

#### Scenario: SuperAdmin path
- GIVEN a SuperAdmin posting change-plan on any store
- THEN 200: same mutation rules (modules from membership, StorePlanId written, anchor kept, overdue paid-target ⇒ override=today)

#### Scenario: Unknown plan / inactive plan
- GIVEN `storePlanId` = 99 (unknown) or an inactive plan
- WHEN change-plan is posted
- THEN 400 validation error

---

### Requirement: Sacred Payment Anchor

The system MUST NOT alter or nullify `Store.PaymentStartDate` on ANY plan-change path (change-plan, toggle-plan, update-store). Every plan-change test SHALL assert the anchor is unchanged.

#### Scenario: Anchor immutability across all paths (integration + E2E)
- GIVEN a store with `PaymentStartDate = D`
- WHEN change-plan (owner or SuperAdmin), toggle-plan, or update-store runs
- THEN `PaymentStartDate` = D in every case (assert in tests)

#### Scenario: Activation-on-first-paid removed
- GIVEN a free-modules store with `PaymentStartDate = null` (legacy row) and a caller with moduleIds containing paid modules
- WHEN update-store runs
- THEN `PaymentStartDate` remains null (no auto-activation; the clock starts only at creation or explicit SuperAdmin PUT payment-date)

---

### Requirement: Next-Due Override Mechanics

`Store.NextDueDateOverride` (nullable `DateOnly`) SHALL override the computed next due date with priority: `override > lastPaidBeforeDate > paymentStartDate+trial+1`. The override SHALL be set to TODAY when a change to a paid plan finds computed nextDue <= today. The override SHALL be cleared when a payment is registered (`RegisterStorePayment`) and when the plan changes to Gratis. Changes to paid plans with future nextDue SHALL NOT create an override.

#### Scenario: Override priority in GetNextDueDate
- GIVEN anchor 2026-01-10, trial 1, lastPaid = 2026-07-10, override = 2026-09-10
- WHEN computing next due
- THEN result = 2026-09-10 (override wins over lastPaid)

#### Scenario: Payment clears override
- GIVEN a store with override = today
- WHEN RegisterStorePayment runs (SuperAdmin/ReSeller)
- THEN override is null and nextDue = payment.PaymentBeforeDate

#### Scenario: Downgrade clears override
- GIVEN a paid store with override set
- WHEN change-plan to Gratis runs
- THEN override is null

---

## MODIFIED Requirements

### billing: Toggle Store Plan (store-plan-toggle era, admin-stores/billing specs)

**Previously** (sdd/store-plan-toggle spec R1–R5): Free↔Paid atomic toggle; Free→Paid sets `PaymentStartDate = today`; Paid→Free sets `PaymentStartDate = null`; SuperAdmin + ReSeller only.

**Now**: `POST /v1/stores/{id}/toggle-plan` keeps SuperAdmin/ReSeller permission, but direction SHALL derive from `StorePlanId` (Paid-ish ⇔ StorePlanId != Gratis... — for toggle semantics: Paid ⇔ current plan != Gratis). Free→Paid keeps the anchor (sets override per next-due rule), writes `StorePlanId = Pago`; Paid→Free keeps the anchor (never null), writes `StorePlanId = Gratis`, clears override, soft-deletes paid modules. Module mutations unchanged (soft-delete/insert/reactivate + StoreRoleFeatures).

#### Scenario: Toggle Paid→Free keeps anchor
- GIVEN a paid store `PaymentStartDate = 2026-06-01`, `StorePlanId = Pago`
- WHEN toggle-plan runs
- THEN `PaymentStartDate` = 2026-06-01 (NOT null), `StorePlanId` = Gratis, paid modules soft-deleted

#### Scenario: Toggle Free→Paid keeps anchor, applies due rule
- GIVEN a Gratis store (overdue clock, anchor = 2026-01-10, today = 2026-09-10)
- WHEN toggle-plan runs
- THEN `StorePlanId` = Pago, `PaymentStartDate` = 2026-01-10, `NextDueDateOverride` = 2026-09-10

### billing: UpdateStore DG-7 (one-way plan lock)

**Previously**: non-SuperAdmin may not change module set of a store with any active paid module; same-set allowed; free-store activation allowed.

**Now**: non-SuperAdmin may not change the module set of ANY store (paid or free): `ModuleIds != null` and set ≠ current set → 400 `PlanLocked` (no free-store exception). Same-set updates remain allowed. Null ModuleIds (data-only) never fires. SuperAdmin freeform remains. Plan changes for non-SuperAdmin go exclusively through change-plan.

#### Scenario: Owner PUT free-store module change rejected
- GIVEN an OwnerAdmin on THEIR OWN free store, moduleIds = free set + paid module
- WHEN PUT update-store
- THEN 400 `PlanLocked`

#### Scenario: Owner PUT same-set on paid store still OK
- GIVEN an OwnerAdmin on their paid store, same moduleIds as current
- WHEN PUT update-store with rename
- THEN 200

### management-stores (frontend): Plan panels activation contract

**Previously**: activation = `updateStore(moduleIds = free+plan union)`; DG-7 readOnly lock for owner on paid stores; button "Activar ese plan"; per-module rows with prices/discount badges; INCLUDES "Incluye:"; help "?" 16px gray; close button bottom-left.

**Now**: activation = `changeStorePlan(storeId, planId)`; no readOnly lock (owner of the store can change plans; panels show "Activar Plan" on every non-active plan); module rows = name + "?" icon only; plan header price = red-strikethrough original + current price right-aligned when discounted ("20 10 USD"), current only when no discount; paid plans render "Incluye todo lo del plan {plan_anterior} y además:" (plan_anterior = immediately preceding plan by `Order`; Gratis keeps "Incluye:"); help "?" bigger (h-6 w-6, text-base) and green (text-green-600, border-green-600); close button right-aligned (X top-right stays).

#### Scenario: Owner activates Pago from the dialog
- GIVEN the owner of a Gratis store opens the plan dialog
- WHEN clicking "Activar Plan" on the Pago panel
- THEN changeStorePlan POST fires; on success the modal closes, session refreshes, card reflects new planType and price

#### Scenario: Strikethrough header
- GIVEN a plan with original total 20 and current 10 (discount)
- WHEN the header renders
- THEN "20" appears red-strikethrough followed by "10 USD", right-aligned

#### Scenario: Includes-previous text
- GIVEN the Pago panel on a store currently on Gratis
- WHEN the panel body renders
- THEN it starts with "Incluye todo lo del plan Gratis y además:"

#### Scenario: Rows stripped
- GIVEN any plan panel
- WHEN module rows render
- THEN each row shows only module name + "?" icon (no price, no discount badge)

---

## ADDED test coverage requirements

- Integration: ChangeStorePlan handler matrix (owner ok, not-owner 403, unknown plan 400, inactive store/owner 400, membership modules, anchor preserved, override=today on overdue paid target, no override on future, downgrade clears override, VIP target, SuperAdmin path).
- E2E backend: same matrix through the HTTP endpoint + anchor immutability on toggle/update paths; PlanLocked on PUT free-store set change.
- Frontend unit: dialog contract (rows, strike header, includes-previous, "Activar Plan", close right).
- Frontend E2E: authorized updates (S2-01/S2-02/E-08/E-09) + new owner plan-change spec.

## Non-Goals

- FilterForBilling semantics, GET /v1/plans shape, PUT payment-date, StoreRoleFeature reactivation gap, UpdateStore H-11 ownership gap, offline roster, Angular parity.
