# Explore: owner-plan-change

**Change**: owner-plan-change · **Phase**: Explore (inline — subagent delegation unavailable this session, connectivity failures ×3) · **Date**: 2026-09-10 · **Branch**: main

## Intent (user-mandated 2026-09-10)

1. Allow the STORE OWNER to change their store's plan. An "Activar" button on every plan panel that is NOT the active plan (owner only — "solo el owner de esa tienda").
2. Payment date (billing anchor) MUST be preserved on plan change.
3. Gratis → paid plan, when the store's payment due date is today or earlier: next payment date := today + 5 days (grace). "Siempre 5 días de gracia para que el owner pueda pagar."
4. Plan-dialog UI adjustments: no per-module prices; header price with discount = red strikethrough original + current, right-aligned ("20 10 USD"); paid plans show "Incluye todo lo del plan {plan_anterior} y además:"; help icon bigger + green; close button to the right (buttons right-aligned like all popups).
5. Cover with integration + E2E tests as appropriate. Existing E2E blocking the feature: user authorized modification ("Hay tests e2e que no permiten hacer eso así que lo debes modificar").

## 1. Plan-change paths today

### 1a. UpdateStoreCommand — `backend/src/Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs`

- Gate: `_httpContextService.IsSuperAdminOrOwnerAdmin` (L67) — OwnerAdmin passes for ANY store (no ownership check — known production gap H-11 family).
- **DG-7 lock (L78–L92)**: `request.ModuleIds is not null && !IsSuperAdmin && store.StoreModules.Any(sm => !sm.ModulePriceIncluded)` → if requested set ≠ current set → `ValidationException` code **`PlanLocked`** (`Resources` key `PlanLocked`). Same-set (rename) allowed; null ModuleIds (data-only) never fires.
- **Activation-on-first-paid (L106–L112)**: `ModuleIds != null && store.PaymentStartDate is null && hasPaidModuleRequested` → `PaymentStartDate = today`.
- Explicit `PaymentStartDate` (SuperAdmin only, L115–L116) wins over auto-activation.
- `UpdateStoreModules` (soft-delete absent, insert new, reactivate soft-deleted, regenerate StoreRoleFeatures; known gap: reactivation restores only first role row per feature — documented in store-plan-toggle verify report).
- ⚠️ **NEVER writes `Store.StorePlanId`** — the only writer in production code is `Store.Create` (`Store.cs:50`). **Pre-existing desync defect**: activating a different plan via the panels changes modules but `planType` (serialized from `StorePlanId` via `StoreProfile.ResolvePlanType`, `StoreProfile.cs:29/:35/:38`) stays stale. A Superior-born store that activates Pago still reports `planType="Superior"`.
- Command record (L28–L30): `UpdateStoreCommand(Guid Id, string Name, string? Address, string? Description, bool Approved, List<int>? ModuleIds, bool IsActive, DateOnly? PaymentStartDate = null)`.

### 1b. ToggleStorePlanCommand — SuperAdmin/StorePaymentAdmin only

- `ToggleStorePlanCommand.cs`: target plan derived from `PaymentStartDate` (null→Free, set→Paid). Free→Paid: `PaymentStartDate = today` + activate ALL paid modules (L114–L119). Paid→Free: `PaymentStartDate = null` + soft-delete ALL paid StoreModules (L169–L174). Endpoints at `StoresController.cs:222/:233/:242/:248` `[HasPermission(SuperAdmin, StorePaymentAdmin)]`. Not owner-reachable; also does not write StorePlanId.

### 1c. CreateStoreService — `Application/Services/Stores/CreateStoreService.cs:39–45`

- **Every created store starts its trial clock unconditionally** (`PaymentStartDate = today`, paid or free-only modules) with `StorePlanId = Superior` + modules from payload. So a "Gratis" store today HAS a running billing clock: nextDue = creation + trialMonths + 1 month; once passed with no payment, status = Vencido while still on free modules.

## 2. Where the owner lock lives

- **Backend**: `UpdateStoreCommand.cs:78–92` (above). Error: 400 + `PlanLocked`.
- **Frontend DG-7**:
  - `store-plan.tsx:103–104`: `readOnly = !isSuperAdmin && planType !== '' && planType !== 'Gratis'`.
  - `edit-plan-modal.tsx:62`: `readOnly = !isSuperAdmin && storePlanType !== 'Gratis'`.
  - `plan-panels.tsx:31` (`readOnly` prop): `{!isActive && !readOnly && (<button>Activar ese plan</button>)}` (L123–L130).
- Both layers must change consistently (backend is the enforcement point; FE is UX).

## 3. Tests pinning current behavior (the authorization list)

### Backend unit (Application.Tests — not under the E2E-untouchable rule, but must be updated with the behavior change)
- `UpdateStoreCommandHandlerLockTests.cs` — pins PlanLocked / same-set OK / free-store activation OK / SuperAdmin bypass.

### Backend E2E (SMCA.WebApi.E2ETests — UNTOUCHABLE without authorization; user authorized the blocking ones)
- `Stores/StorePlanLockTests.cs` — 4 facts: `OwnerAdmin_changes_modules_on_paid_store_returns_400_PlanLocked`, `OwnerAdmin_rename_only_on_paid_store_returns_200`, `OwnerAdmin_activates_free_store_returns_200`, `SuperAdmin_changes_modules_on_paid_store_returns_200`. **First fact pins the exact behavior this feature removes.**
- `Stores/StorePlanChangeTests.cs` — module-set correctness for toggle + PUT moduleIds paths "including the DG-7 plan lock" (header comment); individual facts assert module sets; one pins OwnerAdmin lock rejection (needs review during spec).
- `Billing/PaymentDateTests.cs` — PUT payment-date suite (anchor setting, unrelated to lock; verify no overlap).
- `Stores/ToggleStorePlanTests.cs` — SuperAdmin/ReSeller toggle; unaffected unless planId semantics change.

### Frontend unit (vitest)
- `components/__tests__/plan-panels.test.tsx` — lock scenarios (readOnly → no activate button), activate visibility, Σ totals, strike-through, tooltip, failure no-close.
- `routes/__tests__/store-plan.test.tsx` — activation flow, no Guardar, readOnly derivation.
- `routes/__tests__/my-stores.test.tsx` — modal panels, activation closes, lock.

### Frontend E2E (frontend-react/e2e/ — UNTOUCHABLE without authorization)
- `store-plan-lock-regression.spec.ts` (S2-02) — exists specifically to pin DG-7: paid store + owner ⇒ NO "Activar ese plan" rendered in any panel. **Directly contradicts the new feature.**
- `owner-stores.spec.ts` — `E-09 — Editar el plan popup locks the paid store for the owner (DG-7)` (L249): pins lock. `E-08 — ... saves a plan change on a free store` (L275): free-store activation — likely still valid, copy/assertions may need updates.
- `store-plan-activation.spec.ts` (S2-01) — full activation walk: free store → expand paid → "Activar ese plan" → PUT `moduleIds == allIds` (free+paid union) → panels reflect without reload + zero /auth/me refetches. **The PUT moduleIds assertion changes if the activation contract becomes planId-based.**
- `store-update.spec.ts` — menu/render assertions; likely unaffected.

## 4. Plan dialog UI today

- `plan-panels.tsx`:
  - Header (L104–L120): plan name + active badge + **Σ currentPrice total** `formatPlanPrice(total)` ("10 USD") right side next to +/− toggle. No original-price display at plan level.
  - Module rows `PlanModuleRow` (L136–L182): name + "?" tooltip button (h-4 w-4 = 16px, gray-500, L156–L162) + per-module strike-through red original `formatPlanAmount(module.price)` + green discountText badge + `formatPlanPrice(module.currentPrice)` (L164–L176). **Per-module prices to be removed; header gains original+current.**
  - "Activar ese plan" button (L123–L130) `STORES.PLAN.ACTIVATE_PLAN`.
  - INCLUDES text (L115): `STORES.PLAN.INCLUDES` = "Incluye:".
- `edit-plan-modal.tsx`: X close top-right (L82–L88) + `Button variant="fab"` "Cerrar" at bottom-left (`mt-4`, no justify — L97–L100). **Close button must move right** (confirm-dialog convention: `shared/components/ui/confirm-dialog.tsx:59` uses `flex justify-end gap-3`).
- i18n `es.ts` (L824–L882): `STORES.PLAN.FREE_TAB/PAID_TAB/SUPERIOR_TAB/ACTIVE_BADGE/INCLUDES/NEXT_BILLING_DATE/ACTIVATE_PLAN`, `STORES.EDIT_PLAN_TITLE`. Missing: "Activar" short label (if changed), "Incluye todo lo del plan {plan} y además:" (new), plan-level discount strike is pure CSS.

## 5. Billing mechanics for the grace rule

- `StoreBillingUtils.GetNextDueDate(DateOnly? paymentStartDate, int trialMonths, DateOnly? lastPaidBeforeDate)` (`Domain/Common/Utils/StoreBillingUtils.cs:19–25`): `lastPaidBeforeDate ?? startDate+trial+1mo`; null if anchor null. **Compute-on-read: no override mechanism exists today.**
- `GetStatus` (L27–L35): AlDia/PorVencer(dueSoonDays)/EnGracia(graceDays)/Vencido; `IsPaidPlanActive` (L37–L38): `today <= nextDue + graceDays`; `IsInTrial` (L40–L41).
- Config: `ISystemConfigurationRepository.GetPaymentGraceDaysAsync()` (seeded **5**), `GetDueSoonDaysAsync()`, `GetTestingPeriodInMonthsAsync()` (trial, min 1 in BillingService L77). Cached 5 min in `BillingService.GetCachedConfigAsync`.
- `BillingService.GetStoreBillingSummaryAsync` (L43–90+): loads store+modules, computes PlanType "Paid"/"Free" (module-shape heuristic — legacy /auth/me path), effectiveAmount gate (0 ⇒ no trial banner), nextDue, status. Enforcement: `GetMeQueryHandler.FilterForBilling` + `HasPermissionAttribute` strip non-PriceIncluded modules when Vencido (compute-on-read downgrade).
- **The problem the grace rule solves**: every store's clock starts at creation. A Gratis store whose trial window has passed is `Vencido`; the moment the owner activates a paid plan, `FilterForBilling` gates the new paid modules away immediately. Grace (nextDue := today+5) yields status `PorVencer` (dueSoonDays=5) → `IsPaidPlanActive=true` → modules work, owner has 5 days to pay.
- **Mechanism gap**: preserving the anchor while overriding nextDue needs a NEW field (e.g. `Store.NextDueDateOverride DateOnly?`) consumed by `GetNextDueDate` — recording a fake StorePayment would corrupt payments/commissions/counts (`GetLastByStoreIdAsync`/`GetPaidMonthsCountAsync`), and shifting `PaymentStartDate` breaks the preservation rule. Alternative semantics ("fresh clock = today") would violate "la fecha de pago se debe mantener" for the anchor but matches activation-on-first-paid for null-clock legacy stores.
- `PUT /stores/{id}/payment-date` (PaymentDateTests) sets the anchor explicitly (SuperAdmin) — different mechanism, coexists.

## 6. "plan_anterior" data

- Plan hierarchy: `StorePlan.Order` (seed: Gratis=1, Pago=2, Superior=3, VIP=4 — `StorePlanEntityTypeConfiguration.cs:21–24`). `GET /v1/plans` returns active non-VIP ordered by `Order` (`PlanRepository.cs:17–26`); `PlanDto` carries `Id, Name, Order, PlanType, Price (Σ currentPrice), Modules`. FE receives ordered array → previous plan = the plan with the immediately preceding Order. "Incluye todo lo del plan {plan_anterior} y además:" applies to Pago (→Gratis) and Superior (→Pago); Gratis has no predecessor text.

## 7. Integration/E2E test homes for new tests

- Backend unit: `Application.Tests/Features/StoreManagement/Stores/Commands/` (new ChangeStorePlan folder if new command) + `DomainUtils`/`Services/Billing` for `GetNextDueDate` override cases.
- Backend E2E: `SMCA.WebApi.E2ETests/Stores/` (plan-change lifecycle: owner plan change allowed, payment date preserved, grace applied, ownership 403, SuperAdmin unaffected) + `Billing/GetMeBillingStatesTests.cs` family for status propagation. Infra: `MutableDateTimeProvider.Pin()`, `BillingSeed`, `DbTestHelpers`, `AuthzSeed` all exist.
- Frontend unit: `plan-panels.test.tsx`, `store-plan.test.tsx`, `my-stores.test.tsx` (new scenarios), new dialog-copy tests.
- Frontend E2E: new spec for owner plan-change flow (old S2-02/S2-01 semantics move to new authorized files where possible).

## Key Learnings

- **What**: Owner plan lock (DG-7) is enforced backend (`UpdateStoreCommand.cs:78–92`, `PlanLocked`) + FE (`store-plan.tsx:103`, `edit-plan-modal.tsx:62`, `plan-panels.tsx:31`); this feature removes/replaces it with owner-can-change-plan + payment-date preservation + 5-day grace on overdue Gratis→paid activation.
- **Why**: Every store starts its billing clock at creation (`CreateStoreService.cs:39–43`), so a Gratis store goes `Vencido` and newly activated paid modules are instantly gated by compute-on-read `FilterForBilling` — the grace override is the actual fix.
- **Where**: `UpdateStoreCommand.cs`, `StoreBillingUtils.cs`, `BillingService.cs`, `plan-panels.tsx`, `edit-plan-modal.tsx`, `store-plan.tsx`, `my-stores.tsx`, E2E suites listed in §3.
- **Learned**: (1) `UpdateStore` NEVER writes `StorePlanId` (only `Store.Create:50`) — pre-existing planType/modules desync defect; a plan-change feature must fix it. (2) No nextDue override mechanism exists; `GetNextDueDate` is compute-on-read from anchor+trial+lastPaid. (3) `UpdateStore` has no ownership check (OwnerAdmin can hit any store — H-11 gap); new path must enforce store-owner==caller. (4) S2-02/E-09 exist specifically to pin the lock being removed. (5) Plan hierarchy for "plan_anterior" = `StorePlan.Order` via ordered GET /v1/plans.

## Recommendation (approaches)

- **Approach A (recommended)**: New dedicated command `ChangeStorePlanCommand` (POST `/v1/stores/{id}/change-plan` with `storePlanId`) for the OWNER path: validates caller owns the store (owner-only per user mandate), derives moduleIds from `StorePlanModule` seeded membership (kills freeform module cherry-picking for owners), writes `StorePlanId` (fixes desync), preserves `PaymentStartDate`, applies grace override (new `Store.NextDueDateOverride` consumed by `GetNextDueDate`) when target plan is paid and computed nextDue <= today. UpdateStore keeps its lock REMOVED for plan-shaped changes or entirely (decision for design); SuperAdmin keeps freeform module editing.
- **Approach B**: Extend `UpdateStoreCommand` with `StorePlanId` param + relax the DG-7 lock to "module set must match a known plan membership for non-SuperAdmin". Less new surface, but entangles plan semantics with the generic store update and keeps the desync-prone moduleIds contract.
- Frontend: activation contract switches to planId (or keeps moduleIds if B); UI changes per user spec (remove per-module prices, plan-level original+current right-aligned, "Incluye todo lo del plan X y además:", bigger green "?", close button right-aligned per confirm-dialog convention).

**next_recommended**: propose (after pre-proposal question round)

## Open questions for the user (product/business)

1. **Downgrade to Gratis**: can the owner switch a paid store back to Gratis? If yes: does the payment clock keep running (anchor "maintained" literally) or nullify (ToggleStorePlan Paid→Free precedent)?
2. **Grace scope**: only Gratis→paid transitions (strict reading), or ANY plan change on an overdue store (e.g. Vencido Pago → Superior) gets nextDue := today+5?
3. **Gratis store with FUTURE due date (still in trial) activating a paid plan**: anchor untouched, trial continues (assumed per "la fecha de pago se debe mantener" — confirm).
4. **E2E authorization confirmation**: the named blocking tests (§3) — backend `StorePlanLockTests.cs` (4), parts of `StorePlanChangeTests.cs`; FE `store-plan-lock-regression.spec.ts`, `owner-stores.spec.ts` E-09 (+E-08 assertions), `store-plan-activation.spec.ts` S2-01 (PUT contract changes if planId-based). Unit suites (backend + vitest) updated as part of the behavior change.
5. UI micro-decisions to confirm in proposal: per-module row keeps the green discount badge or removes all price info; "Activar" vs "Activar ese plan" copy; X top-right stays alongside right-aligned Cerrar.

## Risks

- `GetNextDueDate` signature change ripples through every billing consumer (GetMe, to-collect, payments, toggle) — strict TDD + full suite mitigates.
- Removing DG-7 without an ownership check would let any OwnerAdmin change any store's plan — MUST add store-owner==caller guard (H-11 family).
- Reactivation StoreRoleFeature gap (first-role-row-only) resurfaces on every plan round trip — pre-existing, document; do not silently expand scope.
- FE E2E not locally runnable (Playwright) — analysis-based updates like store-plan-redesign did.
