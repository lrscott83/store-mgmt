# Proposal: owner-plan-change

**Change**: owner-plan-change · **Mode**: auto (SDD) · **Date**: 2026-09-10 · **Delivery**: direct commits on current branch (user preference)

## Intent

Let the store owner change their store's plan through the plan dialog, under a sacred billing anchor and a fair overdue-due-date rule, and align every plan-mutation path (owner change, SuperAdmin change, gear-menu toggle) to the same contract. Fix the pre-existing planType/modules desync by making plan changes write `StorePlanId` with membership-derived modules. Refresh the plan dialog UI: module rows stripped to name + help icon, plan-level price with red strikethrough original when discounted (right-aligned), "Incluye todo lo del plan {plan_anterior} y además:" on paid plans, a bigger green help icon, and right-aligned dialog buttons.

## Scope

### In Scope

**Backend — plan-change semantics (production code, user-requested)**
1. New owner path: `ChangeStorePlanCommand` + `POST /v1/stores/{id}/change-plan` (body: `storePlanId`). Valid target: any active plan (Gratis/Pago/Superior/VIP). Guards: caller is the store's owner (owner-of-that-store only — `UpdateStore` has no ownership check today; this new path MUST enforce it), store active, owner user active.
2. Sacred anchor: NO plan-change path may alter or nullify `PaymentStartDate` (owner change, SuperAdmin change, toggle). Drop activation-on-first-paid from `UpdateStoreCommand`.
3. Next-due rule: on change to a PAID plan (all, including VIP), if computed `nextDueDate <= today` → set next payment date to TODAY. New `Store.NextDueDateOverride` (nullable `DateOnly`) consumed by `StoreBillingUtils.GetNextDueDate` with priority `override > lastPaidBeforeDate > anchor+trial`. RegisterStorePayment clears the override. No override on changes to Gratis or when due date is future.
4. Plan is the source of modules: `ChangeStorePlan` replaces the store's modules with the target plan's `StorePlanModule` membership (priceIncluded modules of the whole catalog + plan members — same union the FE computes today) and writes `StorePlanId`. Same-set semantics of `UpdateStoreModules` (soft-delete absent, insert new, reactivate soft-deleted, StoreRoleFeatures regeneration) are reused.
5. `ToggleStorePlanCommand` aligned: direction derived from `StorePlanId` (not `PaymentStartDate` — no longer discriminates), target written, anchor KEPT (never null), next-due rule applied on upgrade, `StorePlanId` written by direction.
6. `UpdateStoreCommand` DG-7 becomes same-set-only for non-SuperAdmin (free-store activation hole closed via PUT; plan changes go through change-plan). SuperAdmin keeps freeform module editing.

**Frontend — dialog UI + activation contract**
7. Activation contract: owner + SuperAdmin use `changeStorePlan(storeId, planId)`; `planModuleIdsForActivation` retires.
8. `plan-panels.tsx`: module rows = name + "?" icon only (no per-module prices, no discount badge); activation button copy "Activar Plan"; plan header shows red-strikethrough original price + current price right-aligned when discounted ("20 10 USD"); paid plans render "Incluye todo lo del plan {plan_anterior} y además:" (plan_anterior from `StorePlan.Order`); help icon bigger + green; DG-7 `readOnly` prop dies — all plans activatable for the owner of the store.
9. `edit-plan-modal.tsx`: close button right-aligned (X top-right stays); nextDue display kept.
10. i18n: `STORES.PLAN.ACTIVATE_PLAN` → "Activar Plan"; new `INCLUDES_PREVIOUS_PLAN` key with `{plan}` placeholder; Gratis keeps "Incluye:".

**Tests (per confirmed authorization)**
11. Backend integration (Application.Tests): new ChangeStorePlan handler tests; UpdateStore lock tests updated (same-set-only incl. free stores); ToggleStorePlan handler tests updated; StoreBillingUtils override cases.
12. Backend E2E (authorized for modification): `StorePlanLockTests.cs` (4 facts; free-store-activation fact flips to PlanLocked), `StorePlanChangeTests.cs` (owner facts + toggle facts aligned), `ToggleStorePlanTests.cs` (anchor kept, StorePlanId written). NEW E2E: `ChangeStorePlanTests.cs` (owner happy path, ownership 403, anchor immutability, nextDue=today rule, Gratis target no override, VIP target paid-rule, SuperAdmin path, guard rejections).
13. Frontend unit: plan-panels/store-plan/my-stores vitest updates + new scenarios (dialog contract, rows stripped, strikethrough header, includes-previous text, close right).
14. Frontend E2E (authorized): `store-plan-lock-regression.spec.ts` (S2-02 — repurposed: the thing to catch becomes "PUT-based activation must not exist for owners"), `owner-stores.spec.ts` E-09/E-08, `store-plan-activation.spec.ts` S2-01 (activation walk switches to change-plan endpoint). NEW spec: owner plan-change dialog flow.

### Out of Scope

- `FilterForBilling` / compute-on-read downgrade semantics — unchanged.
- `GET /v1/plans` catalog — unchanged (VIP stays excluded from the dialog; VIP only reachable via endpoint for admin/API use).
- `PUT /stores/{id}/payment-date` (PaymentDateTests) — unchanged, coexists.
- StoreRoleFeature reactivation first-role-row gap — pre-existing, documented, not fixed here.
- `UpdateStore` ownership check (H-11) — closed only on the NEW path; the generic PUT gap stays as-is (separate concern).
- Offline/roster billing snapshot fields — no changes needed (planType travels via roster already).
- Angular legacy frontend (frontend/) — untouched (parity anchor = module price semantics, UI is mandated divergence).

## Approach

Dedicated `ChangeStorePlanCommand` for the owner path with a hard ownership guard, membership-derived modules, `StorePlanId` write, sacred anchor, and the next-due rule computed from the billing service's own utilities (single source: `StoreBillingUtils.GetNextDueDate` + new override). `ToggleStorePlanCommand` converges onto the same helpers (direction from `StorePlanId`, anchor kept). `UpdateStoreCommand` keeps its lock but extends it to free stores (same-set-only for non-SuperAdmin). Frontend activation switches from `updateStore(moduleIds)` to `changeStorePlan(storeId, planId)` — the desync fix makes `planType` trustworthy in one hop.

Next-due override mechanics: new nullable `Store.NextDueDateOverride`; `GetNextDueDate(paymentStartDate, trialMonths, lastPaidBeforeDate, nextDueDateOverride)` (priority: override wins); `BillingService`, `GetStorePlanQuery`, to-collect, `GetMe` pass it through; `RegisterStorePaymentCommand` clears it on payment. Migration: one additive column.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Application/Features/StoreManagement/Stores/Commands/ChangeStorePlan/` | New | Command + handler + validator (owner guard, active checks, plan validation, membership modules, anchor preservation, next-due rule) |
| `Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` | Modified | DG-7 same-set-only for non-SuperAdmin (no free-store exception); drop activation-on-first-paid; explicit PaymentStartDate param stays SuperAdmin-only |
| `Application/Features/StoreManagement/Stores/Commands/ToggleStorePlan/ToggleStorePlanCommand.cs` | Modified | Direction from StorePlanId; anchor kept; StorePlanId written; next-due rule on upgrade |
| `Domain/Common/Utils/StoreBillingUtils.cs` | Modified | `GetNextDueDate` new optional `nextDueDateOverride` param (priority first) |
| `Domain/Entities/Stores/Store.cs` + EF config + migration | Modified | New `NextDueDateOverride DateOnly?` column (additive) |
| `Application/Services/Billing/BillingService.cs`, `GetStorePlanQuery`, to-collect, GetMe | Modified | Pass override through to GetNextDueDate |
| `Application/Features/StoreManagement/StorePayments/.../RegisterStorePaymentCommand.cs` | Modified | Clear NextDueDateOverride on payment |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | Modified | New POST change-plan endpoint (action-level permission: SuperAdmin + OwnerAdmin) |
| `frontend-react/.../plan-panels.tsx` | Modified | Rows stripped; header strike+current right-aligned; "Activar Plan"; includes-previous text; bigger green "?"; readOnly prop removed |
| `frontend-react/.../edit-plan-modal.tsx` | Modified | Close right-aligned; readOnly removed |
| `frontend-react/.../store-plan.tsx`, `my-stores.tsx` | Modified | handleActivate → changeStorePlan; readOnly derivations removed |
| `frontend-react/.../store-http-service.ts` | Modified | New `changeStorePlan` |
| `frontend-react/.../plan-utils.ts` | Modified | `planModuleIdsForActivation` retires |
| `frontend-react/.../es.ts` | Modified | ACTIVATE_PLAN copy; INCLUDES_PREVIOUS_PLAN; remove INCLUDES usage on paid plans |
| Tests (authorized lists) | Modified/New | Per scope §11–§14 |

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `GetNextDueDate` signature change ripples across all billing consumers | High (it's the point) | Strict TDD: red tests per consumer first; single optional param keeps call sites compiling; full backend suite gate |
| Removing DG-7 without ownership guard would let any OwnerAdmin change any store | Fatal if missed | Ownership guard is precondition #1 of the new command; E2E OwnershipNotYours test |
| Toggle semantics change breaks gear-menu flow silently | Medium | Toggle aligned + its E2E updated in the same slice; FE unchanged there |
| FE E2E not locally runnable (Playwright) | Certain | Analysis-based updates, same as store-plan-redesign precedent |
| Baseline pre-existing failures grow | Medium | Count before/after; gate = not grown |
| ChangeStorePlan on an inactive store / inactive owner | Low | Guard tests (400s) |

## Rollback Plan

Direct commits on current branch, commit per work unit — `git revert` per unit. Migration is additive (single nullable column); revert drops nothing. No data loss possible: the anchor column is never touched by this feature's code paths.

## Dependencies

- PostgreSQL on `localhost:5432` (`smca_test`) for E2E.
- `MutableDateTimeProvider.Pin()` for today-pinning in nextDue rule tests (exists).

## Success Criteria

- [ ] Owner can change their store's plan from the dialog (any active plan incl. VIP via endpoint); only the store's owner can.
- [ ] `PaymentStartDate` asserted UNCHANGED across every plan-change path (integration + E2E), and never null afterwards.
- [ ] Change to a paid plan with nextDue <= today ⇒ next payment date = today (status PorVencer → paid modules active; owner has the existing 5-day grace window to pay).
- [ ] Change to Gratis or future due date ⇒ nextDue untouched.
- [ ] `StorePlanId` written on every plan-change path; `planType` reflects the real plan after activation (desync fixed).
- [ ] Dialog contract: rows name+"?" only; "Activar Plan"; header strike+current right-aligned; includes-previous text on paid plans; green bigger "?"; close right-aligned.
- [ ] Authorized E2E updated; new tests added; suites green (baseline failures not grown).

## Open Questions

None — all product decisions confirmed by the user (see decisions record, 2026-09-10).
