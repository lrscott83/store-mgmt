# Delta Spec: store-default-plan-and-owner-plan-restriction

Targets canonical specs: `openspec/specs/billing/spec.md`, `openspec/specs/management-stores/spec.md`.
Context: `StorePlanType` Gratis=1, Pago=2, Superior=3, VIP=4. Catalogs: Gratis 5 modules, Pago 11, Superior/VIP 14 incl. MultiMonedas(15).
Gate ("Superior/VIP = SuperAdmin"): evidence research obs #1206 — current specs design owner→VIP as valid (`billing/spec.md:569-572`) with no caller restriction (`:536`) and owner free-change (`management-stores/spec.md:137-143`); both MUST be modified to avoid archive drift.

# Delta for billing

## ADDED Requirements

### Requirement: Store Creation Default Plan — Pago at Birth

The system MUST create stores on `StorePlanType.Pago` for BOTH admin `POST /v1/stores` and self-registration (`CreateStoreService.cs:45`, currently `Superior`; domain default is already Pago at `Store.cs:47/68/75`). The birth module set MUST remain request-driven (self-registration assigns all AvailableToStore modules, `RegisterCommand.cs:70-85`; admin create resolves the target plan's moduleIds, `edit-store.tsx:101-106,163`) — the module-set divergence is accepted intentionally (proposal D2, Option A).

#### Scenario: Admin-created store births on Pago
- GIVEN admin calls `POST /v1/stores` (pins: `StoreCreatePlanTests.cs:67,119,157,198`; `OwnerCreateStoreTests.cs` OC04 :167)
- WHEN the store is created
- THEN `StorePlanId` SHALL be Pago (2)

#### Scenario: Self-registered store births on Pago
- GIVEN a user completes self-registration via the shared `CreateStoreAsync` path (pin: `AuthRegisterPlanTests.cs:62`)
- WHEN the store is created
- THEN `StorePlanId` SHALL be Pago (2)

#### Scenario: Birth module set unchanged (Option A)
- GIVEN self-registration passes all AvailableToStore modules and admin create passes the target plan's moduleIds
- WHEN the store is created on Pago
- THEN the assigned module set SHALL remain exactly the request list (pin: `store-creation-trial.test.tsx:249-276` re-anchors to Pago birth moduleIds)

## MODIFIED Requirements

### Requirement: Owner Plan Change Endpoint

(Added by SDD change `owner-plan-change`, archived 2026-09-11. This delta: `store-default-plan-and-owner-plan-restriction`.)

The system SHALL expose `POST /v1/stores/{id}/change-plan` with body `{ storePlanId }`. The caller SHALL be the store's owner (OwnerAdmin whose owned-store graph contains the target store) or SuperAdmin. Any other caller SHALL receive 403.

The caller×target-plan matrix SHALL be enforced in the handler after the ownership guard (`ChangeStorePlanCommand.cs:89-95`) and before the target-active check (:103-107):

| Caller | Gratis | Pago | Superior | VIP |
|---|---|---|---|---|
| Owner | 200 | 200 | 403 | 403 |
| SuperAdmin | 200 | 200 | 200 | 200 |
| ReSeller | no change-plan path — toggle-only (`ToggleStorePlanCommand.cs:84-88`) | | | |

(Previously: :536 allowed "owner or SuperAdmin" with NO plan restriction; the designed scenario :569-572 made owner→VIP a 200.)

On success (200, `data=true`): `Store.StorePlanId` SHALL be written to the target plan; the store's active `StoreModules` SHALL become the catalog `priceIncluded` modules ∪ target-plan members (soft-deleting absent, inserting new, reactivating soft-deleted); `StoreRoleFeatures` SHALL be regenerated for inserted modules; `Store.PaymentStartDate` SHALL NOT change (Sacred Payment Anchor); and `Store.NextDueDateOverride` SHALL be set to today when the target plan is paid and the computed next due date is <= today (Next-Due Override Mechanics), else left untouched.

The target store and its owner user SHALL be active, and the target plan SHALL be known and active — otherwise 400 with the corresponding error code.

#### Scenario: Owner changes Gratis→Pago (overdue clock)
- GIVEN a store owned by U with `StorePlanId=Gratis`, `PaymentStartDate = 2026-01-10` (trial expired, nextDue = 2026-02-10, today = 2026-09-10)
- WHEN U posts `change-plan { storePlanId: Pago }`
- THEN the response is 200 with `data=true`
- AND `Store.StorePlanId` = Pago
- AND the store's active `StoreModules` = catalog priceIncluded modules ∪ Pago members
- AND `Store.PaymentStartDate` = 2026-01-10 (UNCHANGED)
- AND `Store.NextDueDateOverride` = 2026-09-10 (today) AND `StoreRoleFeatures` regenerated for inserted modules

#### Scenario: Next payment date becomes today — visible
- GIVEN the store above after the change
- WHEN `GET /v1/stores/{id}/plan` is called (or /auth/me billing fields)
- THEN `nextDueDate` = today AND billing status computes `PorVencer` → `IsPaidPlanActive=true` → paid modules NOT gated by FilterForBilling

#### Scenario: Owner changes to paid plan with FUTURE due date
- GIVEN a paid-plan store with nextDue = 2026-12-01, today = 2026-09-10
- WHEN the owner changes to another paid plan
- THEN `PaymentStartDate` and computed `nextDueDate` are unchanged (override NOT set; existing override, if any, is left untouched)

#### Scenario: Owner changes to Gratis
- GIVEN a Pago store (any due state)
- WHEN the owner changes to Gratis
- THEN modules become Gratis membership; `StorePlanId` = Gratis
- AND `PaymentStartDate` unchanged; existing override cleared (Next-Due Override Mechanics)

#### Scenario: Owner targets Superior or VIP → 403
- GIVEN a store owned by U, U targets Superior or VIP (pins currently expecting 200 — re-anchor: `ChangeStorePlanTests.cs:89,122`; `ChangePlanPermissionFlipTests.cs:48-115`; `MultiMonedasModuleTests.cs:171,194`; `MeAfterOwnerPlanChangeTests.cs:90`; `StorePlanCanonicalPriceTests.cs:245-284`; `ChangeStorePlanCommandHandlerTests.cs:521`)
- WHEN U posts `change-plan { storePlanId: Superior }` or `{ storePlanId: VIP }`
- THEN 403 Forbidden
- AND `Store.StorePlanId` and `StoreModules` SHALL be unchanged

#### Scenario: Not the store's owner
- GIVEN an OwnerAdmin U2 who does NOT own the target store
- WHEN U2 posts change-plan on that store
- THEN 403 Forbidden

#### Scenario: Inactive store or inactive owner user
- GIVEN the target store `IsActive=false` OR the owner user `IsActive=false`
- WHEN change-plan is posted
- THEN 400 with the corresponding error code

#### Scenario: SuperAdmin path (incl. Superior/VIP)
- GIVEN a SuperAdmin posting change-plan on any store targeting any active plan (SA→Superior pin: `ChangeStorePlanTests.cs:235`; SA→Superior keeps MultiStores 201 in `ChangePlanPermissionFlipTests` re-anchor)
- THEN 200: same mutation rules (modules from membership, StorePlanId written, anchor kept, overdue paid-target ⇒ override=today)

#### Scenario: Unknown plan / inactive plan
- GIVEN `storePlanId` = 99 (unknown) or an inactive plan
- WHEN change-plan is posted
- THEN 400 validation error

# Delta for management-stores

## MODIFIED Requirements

### Requirement: Plan Panels Activation Contract (owner plan change)

(Replaced by SDD change `owner-plan-change`, archived 2026-09-11. Previously "PlanPicker Read-Only Lock After Plan Activation" from `store-paid-plan-billing-frontend`: readOnly lock for non-super admins on paid stores, activation via `updateStore(moduleIds)` — superseded by owner-driven `changeStorePlan`; the owner of a store can now change plans freely. This delta: `store-default-plan-and-owner-plan-restriction` — free-change narrowed to Gratis/Pago; Superior/VIP reserved for SuperAdmin.)

Plan activation in the store's plan dialog SHALL use `changeStorePlan(storeId, planId)` — `POST /v1/stores/{id}/change-plan`. There SHALL be no readOnly lock: the owner of a store can change plans among Gratis and Pago. The dialog SHALL render ONLY the Gratis and Pago panels when the caller is not a SuperAdmin; Superior and VIP panels SHALL render ONLY for SuperAdmin callers (`edit-plan-modal.tsx:85-91`, `store-plan.tsx:158-164`). Every non-active plan panel SHALL render an "Activar Plan" button.

Plan panel layout: module rows SHALL show module name + "?" help icon only (no per-module price, no discount badge); the plan header price SHALL show the red-strikethrough original followed by the current price, right-aligned ("20 10 USD") when discounted, or the current price alone when there is no discount. Paid plans SHALL render "Incluye todo lo del plan {plan_anterior} y además:" (plan_anterior = immediately preceding plan by `Order`; Gratis keeps "Incluye:"). The help "?" icon SHALL be bigger (h-6 w-6, text-base) and green (text-green-600, border-green-600). The dialog's close button SHALL be right-aligned (X top-right stays).

(Previously: :137-143 stated "the owner of a store can change plans freely" with no panel role filter.)

#### Scenario: Owner activates Pago from the dialog
- GIVEN the owner of a Gratis store opens the plan dialog
- WHEN clicking "Activar Plan" on the Pago panel
- THEN changeStorePlan POST fires; on success the modal closes, session refreshes, card reflects new planType and price

#### Scenario: Non-SuperAdmin sees only Gratis/Pago panels
- GIVEN an owner (non-SuperAdmin) opens the plan dialog (pins expecting Superior panels — re-anchor: `my-stores.test.tsx:677`, `store-routes.test.tsx:435-450`, `owner-stores.spec.ts:152-156` E-03; `plan-change-permission-refresh.spec.ts:120-136` reworks premise to Pago/Statistics(6) delta)
- WHEN the dialog renders
- THEN ONLY Gratis and Pago panels render; Superior and VIP panels MUST NOT appear

#### Scenario: SuperAdmin sees all four panels
- GIVEN a SuperAdmin opens the plan dialog for any store
- WHEN the dialog renders
- THEN Gratis, Pago, Superior, and VIP panels render

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