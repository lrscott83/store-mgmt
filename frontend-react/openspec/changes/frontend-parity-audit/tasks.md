# Tasks: Frontend Parity Audit (Angular → React)

**Change:** frontend-parity-audit
**Phase:** Tasks
**Date:** 2026-07-01
**Mode:** Hybrid (engram + openspec file)

---

Ordered checklist. Stage 0 is a hard prerequisite for all module slices (design tokens/base
components reviewed before any per-view styling). PWA cross-cutting audit deferred to Sync
stage per design but listed in Stage 0. Module order: Sales -> Inventory -> Expenses ->
Management -> Admin -> Sync -> Reports -> Statistics -> Profile -> Help.

Tracking device: per-layer diff matrix `[artifact | angular ref | react ref | status | gap | fix | verified]`,
persisted per module to `sdd/frontend-parity-audit/apply-progress` (merge, never overwrite).

Legend: `[TDD]` = behavior/logic change, test-first (Strict TDD Mode active). `[VISUAL]` = pure
visual/token change, spot-check instead of new test.

## Stage 0 — Cross-Cutting Foundations (sequential, blocks Stage 1-10) — STATUS: COMPLETE

- [x] 0.1 L1 Models/Enums: 0.1.1 enumerate Angular domain/enums; 0.1.2 enumerate React domain/enums;
  0.1.3 build diff matrix excluding ratified-dead (TodayInventoryStats=32 CONFIRMED dead - nav
  commented out; fleet/carrier enums; message.model.ts); 0.1.4 add missing live fields/enums to
  React domain [TDD]. RESULT: zero gaps found, no fix needed — full matrix in apply-progress.
- [x] 0.2 L2 Services: 0.2.1 enumerate Angular application/* methods + _services/* cross-cutting
  (connection, download-manager, update, usage-tracker, shopping-cart) - list only, full audit
  deferred to Stage 6; 0.2.2 confirm service-factory.ts offline routing when USE_ONLINE_SERVICE=false;
  0.2.3 map each Angular method -> React *-offline-service.ts, build method-gap matrix per module.
  RESULT: offline-service counterparts confirmed present for all core entities; PWA cross-cutting
  method-level mapping deferred to Stage 6 as designed.
- [x] 0.3 L3 Auth: 0.3.1 list Angular canActivate guards; 0.3.2 spot-verify React loaders 1:1 (.some()
  over roles, selectedStoreId check, deny->logout->/login) - mostly done, verification only unless
  gap found [TDD only if gap fixed]. RESULT: no gap found, all three checks confirmed matching.
- [x] 0.4 L7 Routes: 0.4.1 extract Angular route table incl. renames; 0.4.2 extract React route tree +
  catch-all shared/routes/$.tsx; 0.4.3 reconcile paths/params/guards/menu 1:1, fix mismatches [TDD
  if behavior changes]. RESULT: catch-all gap found+fixed (was static 404, now redirects to / per
  Angular's `{path:'**',redirectTo:''}`) [TDD, 1 test]. Full per-route reconciliation for all
  ~35+ routes deferred to each module's Stage 1-9 L7 sub-task (partial completion, documented).
- [x] 0.5 Design tokens (L5 foundation, blocking gate for Stage 1+): 0.5.1 extract Angular tokens from
  frontend/src/scss/settings/color-variables.scss + theme-variables.scss - primary PURPLE #6f42c1
  (CONFIRMED live from running-app screenshot per task instructions; static analysis found Angular
  Material's rendered primary is actually #673ab7 via deeppurple-amber theme — recorded as open
  question, screenshot authority followed), blue #1677ff = link/secondary accent only, amber =
  install-app, --pc-* vars (sidebar #fff, header shadow, header height 60px, sidebar width 260px,
  card box-shadow); 0.5.2 replace packages/web-common/styles.css :root/@theme block - removed wrong
  cyan primary (34 211 238), added purple + full token set [VISUAL] DONE; 0.5.3 build
  app/shared/components/ui/button.tsx (Button + FloatingButton) [TDD] DONE — 12 tests; 0.5.4 build
  ui/card.tsx (Card) [TDD+VISUAL] DONE — 5 tests; 0.5.5 build ui/info-box.tsx (InfoBox) [TDD+VISUAL]
  DONE — 5 tests; 0.5.6 review checkpoint - blocking gate, no per-view styling starts before this
  passes. DONE — gate satisfied, Stage 1 may begin.

## Stage 1 — Sales

- [x] 1.1 L4 functional diff (Angular Sales components vs React app/sales/**) + fix gaps [TDD].
- [x] 1.2 L5 visual: apply tokens + Button/Card/InfoBox to Sales views [VISUAL].
- [x] 1.3 L6 i18n: flatten-diff Sales keys vs es.ts, fill gaps, remove hardcoded Spanish.
- [x] 1.5 Cart (nav-right) L4/L5/L6 parity — badge+header total, payment/Vuelto,
  payment-type icons, credit-module gating, print-invoice toggle, validations. Scope
  RESOLUTION: the cart UI + POS checkout FLOW (dropdown header "Venta actual"+order-type,
  payment/Vuelto, payment-type selector with icons, credit toggle+client input gated by
  `hasCreditsModuleAvailable`, print-invoice toggle (UI-only, no print output — parity with
  Angular's disabled jsPDF path), Limpiar/Registrar buttons, createOrder validations) is
  Sales-stage (L4/L5/L6) parity work, done here. Only the cross-cutting offline
  `ShoppingCartService`/inventory-availability-on-increase/decrease audit stays referenced
  under Stage 6 Sync (see 6.1 note below) — this reconciles the prior contradiction between
  explore.md (verify in Sales stage) and design.md/this file (routed cart service to Sync).
  Deferred sub-item (NOT implemented here, candidate for Stage 2 Inventory or Stage 6 Sync):
  inventory-availability validation on cart increase/decrease (Angular's
  `ShoppingCartService.increaseCartItem` checks stock; React cart store is local-only).
- [x] 1.4 Verify: matrix all-green, tests pass, visual spot-check.

NOTE: also resolve open question from Stage 0 — Angular's authenticated-root redirect
(`'' -> /sales/sale` inside ClientLayoutComponent) has no React equivalent yet; React's index
route always shows the public landing page regardless of auth state.

## Stage 2 — Inventory

- [ ] 2.1 L4 functional diff (app/inventory/**) + fix [TDD].
- [ ] 2.2 L5 visual [VISUAL].
- [ ] 2.3 L6 i18n.
- [ ] 2.4 Verify.

## Stage 3 — Expenses

- [ ] 3.1 L4 functional diff (app/expenses/**) + fix [TDD].
- [ ] 3.2 L5 visual [VISUAL].
- [ ] 3.3 L6 i18n.
- [ ] 3.4 Verify.

## Stage 4 — Management

- [ ] 4.1 L4 functional diff (Angular EditStoreComponent + Users + Configurations vs app/management/**)
  [TDD].
- [ ] 4.2 UX-parity DECISION: Angular EditStoreComponent (single component, list root doubles
  as edit form) vs React's confirmed split routes (store-list.tsx/store-create.tsx/store-edit.tsx)
  - decide keep-split-if-UX-matches or restructure; document rationale - BLOCKING for module
  completion per spec.
- [ ] 4.3 L5 visual (Stores/Users/Configurations) [VISUAL].
- [ ] 4.4 L6 i18n.
- [ ] 4.5 Verify incl. 4.2 decision documented.

## Stage 5 — Admin

- [ ] 5.1 L4 functional diff (Owners/Resellers/Features/Dashboard/admin-Stores vs app/admin/**),
  EXCLUDE admin/roles (ratified dead) [TDD].
- [ ] 5.2 L5 visual [VISUAL].
- [ ] 5.3 L6 i18n.
- [ ] 5.4 Verify.

## Stage 6 — Sync (includes deferred PWA cross-cutting audit)

- [ ] 6.1 PWA cross-cutting audit: for each Angular _services/* (connection, download-manager, SW
  update, usage-tracker) determine React coverage - Angular has dedicated
  services, React coverage scattered/unconfirmed per design; build gap matrix per service.
  SCOPE NOTE (resolved this batch): `_services/order/shopping-cart.service.ts` here is ONLY the
  cross-cutting offline `ShoppingCartService`/inventory-availability-on-increase/decrease audit
  (Angular's `increaseCartItem`/`decreaseCartItem` stock checks — React's cart store is
  local-only and does not validate stock). The cart UI + POS checkout FLOW parity (dropdown,
  payment/Vuelto, payment-type icons, credit gating, print-invoice toggle, validations) was
  done in Stage 1 (see 1.5) — do NOT re-scope that here.
- [ ] 6.2 Fix identified gaps, consolidate scattered React logic into dedicated services where missing
  [TDD].
- [ ] 6.3 L4 functional diff (app/sync/**) + fix [TDD].
- [ ] 6.4 L5 visual [VISUAL].
- [ ] 6.5 L6 i18n.
- [ ] 6.6 Verify incl. PWA cross-cutting confirmed as prerequisite per spec.

## Stage 7 — Reports

- [ ] 7.1 L4 functional diff (app/reports/**) + fix [TDD].
- [ ] 7.2 L5 visual [VISUAL].
- [ ] 7.3 L6 i18n.
- [ ] 7.4 Verify.

## Stage 8 — Statistics

- [ ] 8.1 L4 functional diff (charts/aggregations, app/statistics/**) + fix [TDD].
- [ ] 8.2 L5 visual incl. charts [VISUAL].
- [ ] 8.3 L6 i18n.
- [ ] 8.4 Verify.

## Stage 9 — Profile

- [ ] 9.1 L4 functional diff (app/profile/**) + fix [TDD].
- [ ] 9.2 L5 visual [VISUAL].
- [ ] 9.3 L6 i18n.
- [ ] 9.4 Verify.

## Stage 10 — Help

- [ ] 10.1 Ratify tutorial-page consolidation: confirm React app/help/routes/tutorial.tsx (already
  exists) is intentional replacement for Angular's 25 per-page help-dialogs - document
  ratification, NOT a mechanical port.
- [ ] 10.2 L6 i18n: verify tutorial-page keys in es.ts, byte-identical Spanish where reused [text spot-check].
- [ ] 10.3 L5 visual if needed [VISUAL].
- [ ] 10.4 Verify: ratification + L6 check only, no L4 matrix needed (dialogs intentionally not ported).

## Dependency / Parallelism Summary

Stage 0 is strictly sequential internally and blocks all of Stage 1-10; 0.5.6 (token/base
component review gate) is the hard blocker for any L5 task in later stages — SATISFIED, Stage 1
may now begin. 0.1-0.4 can run in parallel with each other and with 0.5 (no file overlap). Within
each module stage, keep L4 -> L5 -> L6 -> Verify sequential per design's Per-Module Execution
Template to avoid rework. Modules (Stage 1-9) have no cross-module code dependency and CAN run in
parallel across engineers/PRs once Stage 0 merges - fixed module order is priority, not a
technical dependency, EXCEPT Stage 6 (Sync) depends on the PWA cross-cutting matrix started in
0.2.1. Stage 10 (Help) has no L4 task, smallest slice, can be done anytime after Stage 0.

## Review Workload Forecast

Estimated changed lines per stage (based on ~205 files in app/, work concentrated in
components/routes/lib-services/i18n plus shared styles.css/ui/):

| Stage | Estimate | Actual / Notes |
|---|---|---|
| Stage 0 Foundations | 600-900 ln | ACTUAL ~376 ln (audit found zero L1/L2/L3 gaps requiring code, only L7 catch-all needed a fix; tokens+ui components as estimated) |
| Stage 1 Sales | 500-800 ln | largest module, 14+ components |
| Stage 2 Inventory | 300-450 ln | 8 components |
| Stage 3 Expenses | 200-300 ln | 4 components |
| Stage 4 Management | 350-550 ln | incl. UX-parity decision, possible route restructure |
| Stage 5 Admin | 400-600 ln | Owners/Resellers/Features/Dashboard, 4 sub-areas |
| Stage 6 Sync | 350-550 ln | incl. PWA cross-cutting consolidation |
| Stage 7 Reports | 150-250 ln | |
| Stage 8 Statistics | 250-350 ln | 3 chart components |
| Stage 9 Profile | 100-200 ln | smallest functional module |
| Stage 10 Help | 50-100 ln | |

TOTAL estimated: ~3,250-5,050 changed lines across the full audit (Stage 0 actual came in under
forecast).

Chained PRs recommended: YES. Any single-PR delivery blows past the 400-line review budget -
every stage after Stage 0 individually risks or exceeds 400 lines with tests included; Stage 0
alone is borderline-to-over (came in under budget in practice at ~376 ln).

Natural PR boundaries: one PR per stage/module, in order:
PR #0 Stage 0 foundations (MERGED as 3 work-unit commits directly on feat/frontend-parity-audit
per explicit no-PR instruction for this batch) -> PR #1 Sales -> PR #2 Inventory -> PR #3
Expenses -> PR #4 Management (flag: UX-parity decision, extra review time) -> PR #5 Admin -> PR #6
Sync (flag: PWA cross-cutting consolidation, higher-risk logic changes) -> PR #7 Reports -> PR #8
Statistics -> PR #9 Profile -> PR #10 Help (smallest, fast-track candidate).

Decision needed before apply: NO (for Stage 0, resolved — delivered as direct commits per
instruction). Still YES for Stage 1+: orchestrator must confirm chain strategy
(stacked-to-main vs feature-branch-chain) before those stages' sdd-apply begins.
