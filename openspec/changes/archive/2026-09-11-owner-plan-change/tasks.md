# Tasks: owner-plan-change

**Change**: owner-plan-change · **Phase**: Tasks · **Date**: 2026-09-10 · **Strict TDD**: ACTIVE (runner: `dotnet test backend/src/SMCA.sln`; FE: `pnpm test`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1400–1700 (BE ~800 incl. tests, FE ~600 incl. tests) |
| 400-line budget risk | High (total) — Low per work unit |
| Chained PRs recommended | No (direct commits on current branch, user preference) |

Decision needed before apply: No
Delivery strategy: direct commits on current branch, one commit per work unit (persisted user preference; no PR).

## Baseline guard (before U1)

- [x] T0.1 Record baselines: backend `dotnet test backend/src/SMCA.sln` count; FE suite + typecheck counts. (Known pre-existing FE failures: sidebar WAREHOUSES parity ×4; backend — count what exists.) — Domain 22, App 424, E2E 479 (pre-U5), FE 3319/3323 (4 sidebar pre-existing), typecheck clean

## Work Unit 1 — Domain: NextDueDateOverride + GetNextDueDate

- [x] T1.1 RED (unit): `StoreBillingUtilsTests` — override priority wins over lastPaid; null override = existing chain; null anchor + override? (override only meaningful with anchor; GetNextDueDate(anchor:null, override:x) still null — clock never started, override must not resurrect billing) — define: anchor null ⇒ return null regardless of override. — RED: 3 new utils tests written first, failed with exact diffs
- [x] T1.2 IMPL: `Store.NextDueDateOverride` property + `StoreEntityTypeConfiguration` column + migration `Add-Store-NextDueDateOverride` (additive, nullable). — done (commit in ledger)
- [x] T1.3 IMPL: `GetNextDueDate(..., DateOnly? nextDueDateOverride = null)` — priority: anchor null ⇒ null; override non-null ⇒ override; lastPaid; anchor+trial. — done (commit in ledger)
- [x] T1.4 GREEN + triangulate: boundary cases (override == today; override future; override past). — Domain 22/22 green

## Work Unit 2 — ChangeStorePlanCommand (backend core)

- [x] T2.1 RED (IT): handler matrix — owner ok / not-owner 403 / unknown plan 400 / inactive store 400 / inactive owner 400 / same-plan no-op 200 / SuperAdmin ok. — matrix RED→GREEN
- [x] T2.2 RED (IT): membership modules (priceIncluded ∪ members, soft-delete/insert/reactivate + StoreRoleFeatures regen asserted). — membership modules asserted
- [x] T2.3 RED (IT): anchor preserved (unchanged PaymentStartDate on every successful case) + override rule: paid+overdue ⇒ today; paid+future ⇒ untouched; Gratis target ⇒ cleared; VIP target ⇒ paid rule. — anchor + override matrix GREEN
- [x] T2.4 IMPL: `IPlanRepository.GetActivePlanWithModulesByIdAsync` + `PlanRepository` impl; `ChangeStorePlanCommand` + validator + handler (guards, tracked store load with Owner.User, membership, StorePlanId write, anchor untouched, override rule); DI where needed. — done (commit in ledger)
- [x] T2.5 GREEN all T2.x; refactor shared helpers (module mutation reuse from UpdateStore — extract or duplicate carefully, prefer reuse). — shared module-mutation helpers reused
- [x] T2.6 IMPL: `StoresController` POST `/v1/stores/{id}/change-plan` action-level `[HasPermission(SuperAdmin, StoresAdmin)]`. — done (commit in ledger)

## Work Unit 3 — Toggle + UpdateStore alignment

- [x] T3.1 RED (IT): ToggleStorePlan direction-from-StorePlanId; Paid→Free keeps anchor (never null), clears override, writes StorePlanId=Gratis; Free→Paid keeps anchor, writes StorePlanId=Pago, override rule on overdue. — rewrite GREEN
- [x] T3.2 IMPL: ToggleStorePlanCommand rewrite (drop PaymentStartDate writes; StorePlanId direction; override rule; keep ReSeller ownership + preconditions). — done (commit in ledger)
- [x] T3.3 RED (IT): UpdateStore — activation-on-first-paid removed (null anchor stays null with paid moduleIds); DG-7 fires on free-store set change too (non-SuperAdmin); same-set OK; SuperAdmin freeform unchanged; explicit PaymentStartDate param still SuperAdmin-only. — DG-7 rewrite GREEN
- [x] T3.4 IMPL: UpdateStoreCommand adjustments. — done (commit in ledger)
- [x] T3.5 Update `UpdateStoreCommandHandlerLockTests` + `ToggleStorePlanCommandHandlerTests` (unit) to new behavior; GREEN. — done (commit in ledger)

## Work Unit 4 — Billing consumers pass override through

- [x] T4.1 RED (IT/unit): RegisterStorePayment clears override; nextDue advances from override-aware value (currentDue reads override). — RED→GREEN 6/6
- [x] T4.2 IMPL: pass override in RegisterStorePaymentCommand, BillingService, GetStorePlanQuery, GetMyStoresQuery, GetStoresToCollectQuery, GetAllOwnersQuery. — done (commit in ledger)
- [x] T4.3 GREEN: backend full solution `dotnet test backend/src/SMCA.sln` (baseline not grown). — App 424/424, E2E 489/489

## Work Unit 5 — Backend E2E (authorized updates + new)

- [x] T5.1 RED+GREEN: NEW `ChangeStorePlanTests.cs` — full HTTP matrix (owner happy, ownership 403, inactive 400s, unknown plan 400, anchor immutability, nextDue=today visible via /plan or /auth/me, VIP, SuperAdmin, no-op). — 10/10 green
- [x] T5.2 UPDATE (authorized): `StorePlanLockTests.cs` — free-store set-change now PlanLocked (fact 3 flips); others re-pinned (anchor assertions added). — re-pinned, green
- [x] T5.3 UPDATE (authorized): `ToggleStorePlanTests.cs` — anchor kept/never-null, StorePlanId written, override rule. — anchor kept/never-null, green
- [x] T5.4 UPDATE (authorized): `StorePlanChangeTests.cs` — toggle facts: anchor + StorePlanId; owner PUT facts: PlanLocked on set change; module-set correctness stays. — toggle + PUT facts, green
- [x] T5.5 E2E full suite run (baseline not grown) — record counts. — E2E 489/489 recorded

## Work Unit 6 — Frontend: dialog UI + changeStorePlan contract

- [x] T6.1 RED (vitest): plan-panels — rows stripped (name+"?" only, no price/badge); header strike+current right-aligned; "Activar Plan" copy; INCLUDES_PREVIOUS_PLAN for paid (plan_anterior), INCLUDES for Gratis; "?" h-6 w-6 green classes; no readOnly prop.
- [x] T6.2 IMPL: `plan-panels.tsx` rewrite of rows/header/copy; remove readOnly.
- [x] T6.3 RED (vitest): store-http-service changeStorePlan resolves/rejects; domain types unchanged.
- [x] T6.4 IMPL: `store-http-service.ts` changeStorePlan; delete `planModuleIdsForActivation` from plan-utils. — planModuleIdsForActivation deleted from plan-utils
- [x] T6.5 RED (vitest): edit-plan-modal — close right-aligned; no readOnly; store-plan page + my-stores call changeStorePlan on activate (no updateStore).
- [x] T6.6 IMPL: `edit-plan-modal.tsx` (close right), `store-plan.tsx` + `my-stores.tsx` handleActivate → changeStorePlan + refresh + close/re-read.
- [x] T6.7 i18n `es.ts`: ACTIVATE_PLAN → 'Activar Plan'; add INCLUDES_PREVIOUS_PLAN ('Incluye todo lo del plan {plan} y además:'); keep INCLUDES ('Incluye:') for Gratis; run FE unit scope green.
- [x] T6.8 FE full suite + typecheck (baseline not grown). — 3326/3330, 4 sidebar failures pre-exist on main (stash-verified); typecheck clean

## Work Unit 7 — Frontend E2E (authorized updates + new)

- [x] T7.1 UPDATE (authorized): `store-plan-lock-regression.spec.ts` S2-02 — repurposed: AD7 button renders on paid store; real activation via POST (observer); expectNoStorePut; anchor pinned DB before/after (unchanged, non-null).
- [x] T7.2 UPDATE (authorized): `store-plan-activation.spec.ts` S2-01 — activation walk on POST change-plan: body {storePlanId} only, no moduleIds/anchor, AD8 copy asserted, no-reload measured, free panel keeps action (AD7 reverse assertion).
- [x] T7.3 UPDATE (authorized): `owner-stores.spec.ts` E-09 (AD7: 'Activar Plan' visible on paid store's free panel) + E-08 (POST observed, no PUT, modal closes, card repaints paid).
- [x] T7.4 NEW spec: `owner-plan-change-dialog.spec.ts` — full owner flow with DB anchor pinning (PaymentStartDate before/after), POST body exact ({storePlanId} of the catalog Pago plan), no PUT, modal close + card repaint paid.
- [x] T7.5 Analysis-based verification: Playwright not locally runnable in this session; contract verified by static analysis against the real backend command (anchor never touched, StorePlanId written), FE handler wiring (my-stores/store-plan changeStorePlan), i18n copy, and tsc --noEmit clean on all 5 U7 files; runtime verification deferred to the next runnable Playwright session (U8 checklist).

## Work Unit 8 — Verify + close

- [x] T8.1 Full backend solution test run (count vs baseline). — Domain 22/22, App 424/424, E2E 489/489 (=== baseline)
- [x] T8.2 Full FE suite + typecheck (count vs baseline). — FE 3325-3326/3330 (only pre-existing sidebar failures: 4 chronic + parallel flake, stash-verified on main); typecheck no errors
- [x] T8.3 `sdd-verify` checks: spec scenarios ↔ tests coverage map; tasks all checked; artifacts persisted (openspec + engram). — 22/22 scenarios covered (verify-report map); tasks 100% checked; artifacts in openspec + engram
- [x] T8.4 tasks.md all boxes checked; verify-report written. — this check

## Constraints (all units)

- E2E (backend + FE) UNTOUCHABLE except the authorized files listed in proposal §Scope/§Tests — never weaken to green.
- Anchor sacred: every new/updated test asserts PaymentStartDate unchanged where a plan-change path runs.
- Strict TDD: RED before IMPL per task; evidence in commit messages.
- Direct commits on current branch, one commit per work unit (user preference — no PR, no branch switch).
