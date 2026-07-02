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
  Deferred sub-item (NOT implemented here): inventory-availability validation on cart
  increase/decrease (Angular's `ShoppingCartService.increaseCartItem` checks stock; React
  cart store is local-only). MOVED to Stage 2 (see 2.5) — it depends on
  `InventoryOfflineService`/stock data that Stage 2 owns, so it is an Inventory dependency,
  not a generic Sync one.
- [x] 1.4 Verify: matrix all-green, tests pass, visual spot-check.
- [x] 1.6 Verify-report follow-up fix batch (resolves verify-report.md W1 + W2 findings,
  2026-07-02):
  - `checkAvailability` FULL parity (closes W1 AND supersedes/completes 2.5.2 below): ported
    Angular's `InventoryOfflineService.hasAvailableProductToSale` 5-way branch exactly
    (`app/sales/lib/product-availability.ts` — `checkProductAvailabilityToSale`), including
    cart-quantity inclusion (`cart-store.ts getItemQuantity`), the
    `hasInventoryModuleAvailable() || !discountFromInvantory` gate
    (`authorization-service.ts hasInventoryModuleAvailable`, new), and a blocking
    error alert (`shared/lib/blocking-alert.ts` — native `window.alert`, matching Angular's
    blocking `Swal.fire`). Wired end-to-end `sale.tsx` -> `SaleCategoryProducts` ->
    `SaleProductRow`. This exceeds the originally-scoped 2.5.2 minimal wiring (which assumed
    reusing `hasAvailableStock(): boolean` unchanged) — `checkAvailability`'s signature
    changed from `boolean` to a typed `ProductAvailabilityResult` to carry the 5 distinct
    error codes/messages. 2.5.2 in Stage 2 below is now DONE, moved here.
  - W2 text-parity: `create-product-modal.tsx`, `edit-product-modal.tsx`,
    `edit-product-category-modal.tsx` — replaced hardcoded `'... is required'` English
    strings with `GENERAL.VALIDATION.REQUIRED` (exact Spanish, e.g. "Nombre es requerido").
    `edit-product-category-modal.tsx` — REMOVED the invented "Order must be a positive
    number" validation entirely (Angular's order field has only `required`); order field's
    visible label also fixed from hardcoded "Order" to `GENERAL.ORDER` ("Orden").
    `csv-product-importer-modal.tsx` — unified both error paths (parse throw + file-read
    error) to Angular's single hardcoded Spanish fallback literal "Error al importar los
    productos" (byte-identical, matches Angular hardcoding it too, not an i18n key).
  - New i18n keys added to `es.ts`: `PRODUCT_ERRORS.NOT_EXISTS/INACTIVE/
    NOT_AVAILABLE_TO_SALE/QUANTITY_NOT_AVAILABLE`, `GENERAL.RESPONSE.ERROR_TITLE`,
    `GENERAL.ORDER`. `NOT_AVAILABLE` reuses the pre-existing
    `SALES.NOT_INVENTORY_AVAILABLE_MESSAGE` key.
  - NOT in this batch's scope (flagged, carried forward): `edit-product-category-modal.tsx`'s
    hardcoded "Active" checkbox label (English) — not part of the verify-report's W2 finding
    or the explicit fix list, left untouched to avoid scope creep; candidate for a future L6
    pass. 2.5.1 (cart increase/decrease stock validation) also NOT touched — separate scope,
    remains in Stage 2.

NOTE: open question from Stage 0 — Angular's authenticated-root redirect
(`'' -> /sales/sale` inside ClientLayoutComponent) has no React equivalent yet; React's index
route always shows the public landing page regardless of auth state. MOVED to Stage 2 (see
2.6) — it is part of the login/auth carry-over, co-located there because the post-login
`navigateToUserHome` branch depends on product-availability (Inventory) data.

[x] 1.7 SweetAlert2 (`sweetalert2`) port — dedicated cross-cutting parity slice (Batch 10,
2026-07-02), requested directly by the user: ported EVERY live (template-wired) Angular
Sale-module `Swal.fire` call site to use the real `sweetalert2` library (Angular pins
`^11.11.0`, React added `^11.26.25`, no global `Swal.mixin`/theme in Angular so stock
defaults used both sides). `app/shared/lib/blocking-alert.ts` rewritten: `showBlockingError`
(now real `Swal.fire`, replacing `window.alert`), NEW `confirmDialog` (question icon,
Yes/No, `#3456ff`/`#dc3545` colors), NEW `showAcknowledgeError` (OK-only error, explicit
translated button). RESTORED the payment confirm step in `sale-credit-payment-modal.tsx`
(previously dropped — code comment said "no SweetAlert2 equivalent in React") and the
deactivate confirm in `order-item-list.tsx` (previously a double-click gate). Added
error-dialog-on-failure to `sale-credit-payment-modal.tsx`, `edit-sale-credit-modal.tsx`,
`edit-order-modal.tsx`, `order-item-list.tsx` — `onSave`/`onPay`/`onUpdate`/
`onDeactivateOrder` callbacks now return `boolean`, propagated through `sale-credit-list.tsx`/
`order-list.tsx`/`today-orders.tsx`/`today-credits.tsx` (route-layer try/catch around
services that only fail via a not-found throw, no `DataResult` contract in React's ports).
Confirmed Angular's `sendOrderToShoppingCart`/`onDeteleOrder` in `order-item-list.component.ts`
are DEAD (unreachable from the component's own template) — not ported, not invented. Also
closed the `edit-product-category-modal.tsx` "Active" label gap flagged-but-deferred in 1.6
(`GENERAL.ACTIVE` = "Activo"), plus a full `app/sales/**` + `cart-shell.tsx` hardcoded-English
sweep: `csv-product-importer-modal.tsx`'s preview-table headers/status badges and
`csv-product-parser.ts`'s per-row validation messages (changed to error codes mapped to the
already-existing `PRODUCTS.CSV.ERROR.*` keys), and `cart-shell.tsx`'s 3 cart-item
`aria-label`s. FLAGGED (not silently changed): the entire CSV-import preview/validation table
has NO Angular counterpart at all (Angular's modal is just a file input + static sample text)
— only its text was made Spanish, the feature itself untouched; and the cart aria-labels are
a React-added a11y improvement Angular's template lacks entirely (translated, not removed).
`tsc --noEmit` clean; `vitest run` 95 files / 1028 tests (was 1015, +13 net); `react-router
build` succeeds (new `sweetalert2` chunk ~79.5 kB / 21.1 kB gzip).

## Stage 2 — Inventory

- [ ] 2.1 L4 functional diff (app/inventory/**) + fix [TDD].
- [ ] 2.2 L5 visual [VISUAL].
- [ ] 2.3 L6 i18n.
- [ ] 2.5 Inventory-availability cross-cutting wiring (CARRY-OVER pulled into Stage 2 from
  Stage 1 / Stage 6 — depends on `InventoryOfflineService`/stock data this stage builds) [TDD]:
  - [ ] 2.5.1 Cart increase/decrease stock validation (from 1.5 deferred sub-item): port
    Angular `ShoppingCartService.increaseCartItem`/`decreaseCartItem` stock check
    (`inventoryService.n(productId, qty)`) into the React cart flow; the local-only cart
    store must validate available stock before increasing.
  - [x] 2.5.2 Sale/POS `checkAvailability` wiring — DONE, moved to Stage 1 (see 1.6). Delivered
    as the FULL 5-way `hasAvailableProductToSale` parity (not just `hasAvailableStock` +
    gate as originally scoped here), including cart-quantity inclusion and a blocking error
    alert. `SaleProductRow`/`SaleCategoryProducts` DID change (checkAvailability's return
    type), contrary to this item's original "no further changes needed" assumption.
- [ ] 2.6 Login / auth parity (CARRY-OVER — login has no dedicated module stage; co-located
  here because the post-login redirect depends on product-availability/Inventory data. NOTE:
  2.6.1 is a pure guest-form view parity with NO Inventory dependency — placed here for
  scheduling only, keep it clearly labeled as auth, not inventory) [TDD]:
  - [ ] 2.6.1 Login form L4/L5 view parity: `app/auth/routes/login.tsx` +
    `auth/components/auth-layout.tsx` vs Angular `layouts/guest/**` +
    `presentation/auth/login/login.component.html` (functional + visual/token parity). No
    inventory dependency. CONCRETE GAP found 2026-07-02: React invented English copy
    "POS Management" that Angular has NOWHERE — appears in `auth-layout.tsx:9`
    (`<p>POS Management</p>`), `es.ts:4` (`'GENERAL.APP_SUBTITLE': 'POS Management'`), and
    `public/manifest.webmanifest:4` (`"description": "POS Management System"`). Angular's login
    shows brand "VendeDTo" + Spanish tagline "Automatiza tu Negocio"
    (`login.component.html:19,21`) and has no APP_SUBTITLE key. FIX: replace the subtitle with
    "Automatiza tu Negocio" (or i18n key), reconcile the manifest description, and drop/rename
    the invented APP_SUBTITLE key.
  - [ ] 2.6.2 Post-login `navigateToUserHome` product-availability branch: after login, a
    non-admin user with NO available-to-sale products redirects to the products view (to add
    products) instead of `/sales/sale`. Depends on `hasAnyAvailableToSaleProduct`
    (product-availability). Partially flagged in prior memory as not-migrated.
  - [ ] 2.6.3 Authenticated-root redirect (from Stage 1 NOTE / Stage 0 open question):
    Angular's `'' -> /sales/sale` for an authenticated user; React's index route currently
    always shows the public landing page. Reconcile.
- [ ] 2.7 Verify (incl. 2.5 + 2.6 carry-overs): matrix all-green, tests pass, visual spot-check.

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
  SCOPE NOTE: the cart UI + POS checkout FLOW parity (dropdown, payment/Vuelto, payment-type
  icons, credit gating, print-invoice toggle, validations) was done in Stage 1 (see 1.5). The
  `ShoppingCartService`/inventory-availability-on-increase/decrease stock check was MOVED to
  Stage 2 (see 2.5.1) — it is an Inventory dependency, not a generic Sync one. Stage 6 keeps
  ONLY the non-inventory PWA cross-cutting services (connection, download-manager, SW update,
  usage-tracker). Do NOT re-scope the cart flow or the inventory-availability check here.
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
| Stage 1 Sales | 500-800 ln | ACTUAL ~3,700+ ln across 9 batches (largest module by far) + Batch 10's SweetAlert2 cross-cutting slice (~1,000+ ln incl. tests, 24 files touched) |
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
