# Verify Report: Frontend Parity Audit — Stage 0 (RE-VERIFY)

**Change:** frontend-parity-audit
**Phase:** Verify (covers Stage 0 only — re-validation after Stage 1 Sales churn)
**Date:** 2026-07-02
**Supersedes:** the 2026-07-01 Stage 0 verify-report (PASS-WITH-WARNINGS). This report replaces it as the authoritative Stage 0 record.
**Mode:** Hybrid (engram + openspec file)
**Reason for re-verify:** Stage 1 (Sales) landed 8 batches, including a cart-parity batch (Batch 8, commits `0de0703`/`84d10aa`) that touched shared chrome (`cart-shell.tsx`) and added i18n keys. Stage 0 owns design tokens, base UI components, auth loaders, L1 domain, and the L7 catch-all — this re-verify checks those foundations for regressions from that churn, not first-time conformance.

---

## Verdict: PASS WITH WARNINGS

No CRITICAL findings. No Stage 0 foundation was regressed by Stage 1/cart/i18n work. Two low-severity documentation-drift WARNINGs and one SUGGESTION, detailed below.

---

## Test/Build Evidence (run 2026-07-02, actual output)

**Vitest full suite** (`cd frontend-react/apps/web-store-pos && ./node_modules/.bin/vitest run`):
```
 Test Files  88 passed (88)
      Tests  980 passed (980)
   Start at  03:13:38
   Duration  5.31s
```
Matches apply-progress's Batch 8 claim exactly (88 files / 980 tests, +4 files / +34 tests over the prior verify's 74/819 baseline — the delta is Stage 1's pure-function extractions + cart-shell test growth, not Stage 0 files).

**Shared-chrome subset** (`vitest run app/shared/components`):
```
 Test Files  9 passed (9)
      Tests  93 passed (93)
```
Covers `ui/{button,card,info-box}`, `cart-shell`, `navbar`, `sidebar`, `app-layout`, `footer`, `breadcrumbs`. `button.test.tsx` grew from 12 to 17 tests (the `fab` variant added in commit `df02889`, reviewed below).

**TypeScript** (`npx tsc -p apps/web-store-pos/tsconfig.json --noEmit`): zero errors (only an unrelated npm config warning about `auto-install-peers`).

**Production build** (`npx react-router build`): succeeded — client bundle, service worker (PWA v1.3.0, injectManifest, 100 precache entries), SPA `index.html` all generated without error.

---

## Stage 0 Requirement-by-Requirement Re-Validation

### 0.1 — L1 Models/Enums (spec Requirement L1)
**Status: PASS, unchanged.** `git log` confirms `packages/domain/src` has zero commits since the prior verify (last touch: `6fd7d4a`, pre-dates Stage 0). Zero regression risk — Stage 1 did not touch domain types. `TodayInventoryStats=32` dead-status unchanged.

### 0.2 — L2 Services (spec Requirement L2)
**Status: PASS, unchanged.** `service-factory.ts`'s `createService(offline, online)` still routes via `GlobalConfig.USE_ONLINE_SERVICE` (`app/shared/lib/services/service-factory.ts:11-15`). All offline-service counterparts still present and unchanged in location: `egress-offline-service.ts`, `inventory-offline-service.ts`, `product-offline-service.ts`, `order-offline-service.ts`, `product-category-offline-service.ts`, `sale-credit-offline-service.ts`, `expense-offline-service.ts`. PWA cross-cutting mapping remains deferred — task ownership was reshuffled (inventory-availability-on-increase/decrease moved from Stage 6 to new Stage 2.5, per tasks.md carry-over) but that is a **task-graph edit, not Stage 0 code**, and is explicitly out of this re-verify's scope per the request.

### 0.3 — L3 Auth (spec Requirement L3)
**Status: PASS, unchanged.** `authorization-service.ts`: `featureIds.some(...)` (lines 26-27, 38-39) still present, `effectiveStoreId = storeId ?? user.selectedStoreId` (line 33) still present. `loaders.ts`: `denyAccess()` still calls `useAuthStore.getState().logout()` then `redirect('/login')` (lines 14-15). All three semantics confirmed matching Angular guards. No file in this path was touched by Stage 1.

### 0.4 — L7 Routes / catch-all (spec Requirement L7)
**Status: PASS, minor implementation-detail change, not a regression.** `shared/routes/$.tsx` still redirects to `/`, matching Angular's `{path:'**',redirectTo:''}`. One change since the prior report: the export is now `clientLoader` (not `loader`), with an added comment: *"clientLoader (not loader) — SPA mode (ssr:false) rejects server `loader` exports."* This is an SPA-mode correctness fix, not a Stage 1 side effect — semantics (redirect to `/`) are identical. 1 test still passing (`$.test.tsx`).

### 0.5 — Design Tokens (spec Requirement L5, the hard gate) — REGRESSION CHECK
**Status: PASS, confirmed intact, zero regression from the cart batch.**
- `packages/web-common/styles.css:11` — `--color-primary: rgb(103 58 183)` — still #673ab7 (Material Deep Purple / deeppurple-amber theme). NOT cyan (`34 211 238`), NOT Bootstrap `#6f42c1`. Full token set (secondary/accent/success/danger/warning/info/background/surface/text/border/radii/shadows/font-sizes) unchanged since prior verify.
- `ui/button.tsx`, `ui/card.tsx`, `ui/info-box.tsx` all still exist, all still use `bg-primary`/`text-primary`/`border-primary`/`bg-primary-light` token utility classes. `card.tsx` and `info-box.tsx` have **zero commits** since Stage 0 creation — completely untouched by Stage 1. `button.tsx` gained one addition: a `fab` variant (commit `df02889`, "add extended-FAB button variant, apply to Products") — reviewed, it reuses `bg-primary`/`bg-primary-hover` (button.tsx:13), same token discipline, no hardcoded color introduced, 17/17 tests pass (was 12).
- **Cart-batch regression scan (explicit ask):** grepped `cart-shell.tsx` + the 4 new pure-function lib modules (`order-type-utils.ts`, `payment-type-icon.ts`, `payment-return.ts`, `cart-submission-validation.ts`) for `#[0-9a-fA-F]{3,6}` hex patterns and cyan-family hex values — **zero matches**. Cart-shell uses Tailwind semantic classes (success/danger/neutral) for the Vuelto readout, not hardcoded colors, per apply-progress's own claim. Also scanned the full shared-chrome set (`navbar.tsx`, `sidebar.tsx`, `app-layout.tsx`, `footer.tsx`) — zero hardcoded hex in any of them.
- Note: a broader app-wide hex grep surfaced hardcoded hex in `app/statistics/components/chart-core.tsx` and `app/home/routes/landing-deep.{tsx,css}`. Both predate Stage 0/1 entirely (commits `9231057`/`d296175`, unrelated prior work) — `chart-core.tsx` is Stage 8 (Statistics) scope, `landing-deep.*` is the public marketing landing page (not shared authenticated-app chrome). Neither is a Stage 0 or Stage 1 regression; flagged only for completeness, out of this report's scope.

**Conclusion: 0.5 gate remains satisfied. No Stage 1/cart/i18n change regressed the design-token foundation.**

---

## i18n Integrity Check (L6 — not Stage 0, but underpins shared chrome per the request)

`app/shared/lib/i18n/es.ts` is a flat `Record<string, 'DOTTED.KEY'>` (418 total keys, verified via bracket-balance + regex duplicate-key scan): **zero duplicate keys**. `SHOPPING_CART.*` (11 keys: PRODUCTS_LABEL, PRODUCT_LABEL, REGISTER, PRICE_LABEL, ORDER_CREATED, ORDER_NOT_CREATED, DON_NOT_PAY_EMPTY_CART, PRINT_INVOICE, CLEAR, DON_NOT_PAY_LESS_THAN_CART_TOTAL, DON_NOT_SALE_CREDIT_WITHOUT_CLIENT) and `GENERAL.PAY` all present and correctly keyed (es.ts:129-146). Pre-existing `CART.*` keys (TITLE, EFECTIVO, TARJETA, ZELLE, CREDIT_SALE, etc.) were left in place per apply-progress's stated intent — confirmed `cart-shell.tsx` still references exactly those 5 remaining `CART.*` keys and all 5 still exist in `es.ts` (no orphaned/broken references). File structurally valid.

---

## Findings

### CRITICAL
None.

### WARNING

**W1 — spec.md not updated for the Stage 2 carry-over reassignment (documentation drift, same class of issue as the prior report's W1).**
`specs/frontend-parity-audit/spec.md:136` (Sync row) still reads: *"only the cross-cutting offline `ShoppingCartService`/inventory-availability-on-increase/decrease audit is Sync scope"* — but `tasks.md` and `design.md` (both edited in the same commit, `84d10aa`, and further refined in the current uncommitted working-tree diff) now say this item was **MOVED to Stage 2 (Inventory)**, not Sync, because it depends on `InventoryOfflineService`/stock data that Stage 2 owns. `spec.md` was not updated to match. This is the exact same failure mode flagged as CRITICAL→WARNING in the prior report (artifact narrative drifting from the authoritative code/task state) — recurring, so worth calling out as a process pattern, not just a one-off. Does not block Stage 0 (spec.md's Stage 0 content is unaffected) but should be fixed before Stage 2 apply begins, to avoid a verify agent trusting the wrong scope owner.

**W2 — uncommitted openspec doc changes.**
`git status` shows `design.md` and `tasks.md` modified but not committed (the Stage 2 carry-over edits reviewed above). `apply-progress.md`/`spec.md` changes from Batch 8 are already committed (in `84d10aa`), but these two files are not. Not a code risk, but if a session ends here without a commit, the next agent's `git diff`/`git log` correlation (as used throughout this re-verify) becomes unreliable. Recommend committing docs alongside or immediately after this report, per the user's own instruction not to commit code changes — flagging so the user can decide when to commit.

### SUGGESTION

**S1 — pre-existing hardcoded hex in `chart-core.tsx` and `landing-deep.{tsx,css}`.**
Out of Stage 0/1 scope (see 0.5 above) but will need cleanup when Stage 8 (Statistics) and the landing-page work are eventually audited under the same L5 token-parity bar the rest of the app follows. Not urgent, not introduced by Stage 1.

---

## Regression Assessment (explicit answer to the re-verify's core question)

**No Stage 1 / cart / i18n change regressed a Stage 0 foundation.**

- Design tokens (`styles.css`): untouched by Stage 1, still #673ab7, still complete token set.
- Base UI components: `card.tsx`/`info-box.tsx` untouched; `button.tsx` gained one token-compliant variant (`fab`), tested, no hardcoded color.
- L1 domain: zero commits since Stage 0, no regression surface.
- L3 auth: zero commits since Stage 0 on the auth files, no regression surface.
- L7 catch-all: semantics unchanged; only the export changed from `loader` to `clientLoader` for SPA-mode correctness (a fix, not a regression).
- Cart batch (`cart-shell.tsx` + 4 new lib modules): zero hardcoded hex/cyan introduced, all styling goes through existing token utility classes.
- i18n (`es.ts`): additive only, zero duplicates, zero orphaned keys, existing `CART.*` keys left intact and still referenced correctly.

The prior report's one CRITICAL-turned-WARNING (stale apply-progress primary-color narrative) is **confirmed resolved**: the current `apply-progress.md` (openspec mirror) correctly documents `#673ab7` (rgb 103 58 183) with no remaining mention of the wrong `#6f42c1`/`111 66 193` value anywhere in the file.

---

## Scope Note

This report covers **Stage 0 only** (Foundations + Design Tokens), re-validated against the current code state as of 2026-07-02 after Stage 1 (Sales) completion. Stage 1's own functional/visual/i18n correctness (L4/L5/L6 for Sales views) is documented in `apply-progress.md` Batches 1-8 and is **not** re-litigated here — a full Stage 1 sdd-verify pass is still recommended separately before Stage 2 begins, per tasks.md's own note. Stage 2's newly added carry-over tasks (2.5, 2.6) are explicitly **out of scope** for this report.

---

# Verify Report: Frontend Parity Audit — Stage 1 (Sales)

**Change:** frontend-parity-audit
**Phase:** Verify (Stage 1 — Sales module, first formal pass)
**Date:** 2026-07-02
**Mode:** Hybrid (engram + openspec file)
**Scope:** Stage 1 tasks 1.1-1.5 (Products, Sale/POS, Orders, Sale Credits, Today Stats, Category Stats, Cart/nav-right). Stage 2 carry-overs (2.5, 2.6, incl. the login "POS Management" copy gap) are explicitly OUT OF SCOPE for this report — they are Stage 2 tasks by design, not Stage 1 failures.

---

## Verdict: PASS WITH WARNINGS

No CRITICAL findings. Three WARNINGs (one functional-parity gap, one i18n/hardcoded-string gap covering two components, one confirmation that prior Stage 0 documentation drift is now resolved). Two SUGGESTIONs.

---

## Test/Build Evidence (run 2026-07-02, actual output)

**TypeScript** (`pnpm -C apps/web-store-pos exec tsc --noEmit`, from `frontend-react/`): zero errors, no output (clean).

**Full test suite** (`pnpm test`, turbo across `@store-mgmt/domain`, `@store-mgmt/web-common`, `@store-mgmt/web-store-pos`):
```
Test Files  88 passed (88)
     Tests  980 passed (980)
  Duration  5.65s
```
Matches apply-progress's Batch 8 claim exactly (88 files / 980 tests). All Stage 1 Sales test files pass, including the new pure-function tests added in Batch 8: `order-type-utils.test.ts` (2), `payment-type-icon.test.ts` (4), `payment-return.test.ts` (6), `cart-submission-validation.test.ts` (5), and `cart-shell.test.tsx` (23, was 6 pre-Batch-8). One unrelated `stderr` line in `api-client.test.ts` (jsdom "Not implemented: navigation" warning) is expected test noise, not a failure — the test still passes.

---

## Task Completeness (tasks.md Stage 1)

| Task | Status | Evidence |
|---|---|---|
| 1.1 L4 functional diff + fix gaps | [x] claimed done | Confirmed for Products/Sale/Orders/Sale-Credits/Today-Stats/Category-Stats. One tracked exception found: see W1 below (SaleProductRow `checkAvailability` not wired in `sale.tsx`) — explicitly deferred to Stage 2 (task 2.5.2), consistently documented in tasks.md/design.md/spec.md, not a silent gap. |
| 1.2 L5 visual (tokens + Button/Card/InfoBox) | [x] claimed done | Confirmed — `sale.tsx` uses `Card`/`InfoBox`, `products.tsx` uses the new `fab` Button variant (commit `df02889`), `cart-shell.tsx` uses Tailwind semantic classes for Vuelto, no hardcoded hex found in any Stage 1 file (see regression scan below). |
| 1.3 L6 i18n | [x] claimed done | Mostly confirmed — `SHOPPING_CART.*`/`GENERAL.PAY`/`SALES.NOT_INVENTORY_AVAILABLE_MESSAGE` keys byte-identical to Angular's `es.ts`. Exception found: see W2 below (hardcoded English strings in two Products-view components, not part of Batch 8's claimed scope). |
| 1.5 Cart (nav-right) parity | [x] claimed done | Confirmed by direct code comparison against `nav-right.component.ts`/`.html` — see Cart Parity Detail below. |
| 1.4 Verify (matrix, tests, visual spot-check) | [x] claimed done | Per-batch tsc/vitest/build evidence in apply-progress is accurate; this is the first *formal* `sdd-verify` pass on the full Stage 1 module, as tasks.md itself notes was still outstanding. |

---

## Spec Requirement Compliance (Sales module, per spec.md Per-Module Acceptance table)

### L4 — Fields/controls/validations/actions match Angular

**Products view** (`app/sales/routes/products.tsx` vs `presentation/products/products.component.*`): structure, bulk-edit, CSV import entry point confirmed present. Two component-level string gaps found (W2).

**Sale/POS view** (`app/sales/routes/sale.tsx` vs `presentation/sale/sale.component.*`): PASS. Category selector, `SaleCategoryProducts`, no-category-selected alert all match. Angular's barcode-scanner button is commented out in its own template (`sale.component.html:6-11`) and `QuickSaleScannerComponent` is never imported/used anywhere in the Angular app (confirmed via full-repo grep — only self-references inside its own file) — correctly NOT ported to React (S1). Angular's fixed `orderType = OrderType.Normal` (no selector on this screen) correctly mirrored (`sale.tsx:18`).

**`SaleProductRow`** (`app/sales/components/sale-product-row.tsx` vs `sale-product-row.component.ts`): structurally matches (name/price/quantity/add-button, price field editable only for non-Normal sales). **Gap (W1):** Angular's `addProductToCart()` calls `inventoryService.hasAvailableProductToSale(productId, qty)` unconditionally when adding to cart and blocks the add with an error dialog if insufficient stock (`sale-product-row.component.ts:58-104`). React's `SaleProductRow` has the equivalent `checkAvailability` prop, correctly gated behind `product.discountFromInvantory` (`sale-product-row.tsx:36`), and it is unit-tested (10 tests in `sale-product-row.test.tsx`, 2 specifically for the gate). However, `sale.tsx` — the actual route that renders `SaleProductRow` in production — does **not** pass a `checkAvailability` callback (confirmed via grep: zero references to `checkAvailability` in `sale.tsx`). **Net effect: the live Sale/POS screen currently allows adding a stock-tracked product to the cart with no availability check, diverging from Angular's live behavior.** This is a known, already-tracked gap (tasks.md 2.5.2, "Batch 4 flagged gap"), consistently documented across tasks.md/design.md/spec.md's Inventory row, and deliberately deferred to Stage 2 because it's framed as depending on `InventoryOfflineService`. That framing is only partially accurate: `InventoryOfflineService.hasAvailableStock(productId, quantity)` already exists and is tested today (27 tests, `inventory-offline-service.test.ts`) — the missing piece is a one-line wiring call in `sale.tsx`, not new infrastructure. See Findings/W1 for the recommendation.

**Orders / Today Orders / Sale Credits / Today Sale Credits / Today Stats / Category Stats**: spot-checked, all present with matching structure. `today-stats.tsx`'s hardcoded `"Resumen Efectivo"` string matches Angular's own hardcoded literal in `today-stats.component.html:18` (no `[translate]` pipe there either) — legitimate parity, not a gap.

**Cart (nav-right) — full detail check:**
- Header "Venta actual" + `getOrderTypeText(OrderType.Normal)` subtitle: confirmed 1:1 port of `OrderTypeUtils.getOrderTypeText` (`order-type-utils.ts`).
- Payment/Vuelto: `getPaymentReturn()`/`getPaymentReturnClass()` ported as `payment-return.ts`, semantics match `nav-right.component.ts:154-159` exactly (positive/negative/neutral).
- `createOrder()` validation sequence: `validateCartSubmission()` in `cart-submission-validation.ts` is byte-exact in check order and condition logic vs `nav-right.component.ts:162-199` (empty-cart → payment-less-than-total → credit-without-client), confirmed by direct source read.
- Credit toggle gating: `hasCreditsModuleAvailable(user)` call confirmed present in `cart-shell.tsx:86`, matching Angular's `authorizationService.hasCreditsModuleAvailable()` (`nav-right.component.ts:128`).
- Payment-type literals (`Efectivo`/`Tarjeta`/`Zelle`) hardcoded in `orders.tsx`/`today-orders.tsx`/`edit-order-modal.tsx`/`sale-credit-payment-modal.tsx`: confirmed these mirror Angular's own `PaymentTypeUtils.getPaymentTypes()` (`payment-type.ts:4-6`), which hardcodes the same Spanish literals with **no** i18n pipe — legitimate parity, not a hardcoded-string violation.

### L5 — Visual/token parity
PASS. No hardcoded hex found in any Stage 1 file via `#[0-9a-fA-F]{3,6}` grep across `app/sales/**` and `cart-shell.tsx`. All styling goes through `bg-primary`/`text-primary`/Tailwind semantic classes and the shared `Card`/`InfoBox`/`Button` components.

### L6 — i18n parity
PASS WITH WARNING. `SHOPPING_CART.*`, `GENERAL.PAY`, `SALES.NOT_INVENTORY_AVAILABLE_MESSAGE`, `ORDERS.*`, `TODAY_ORDERS.*`, `TODAY_STATS.*`, `SALE_CREDIT.*` all confirmed present and byte-identical to Angular's `es.ts`. **Gap (W2):** two Products-view components contain hardcoded **English** strings that don't exist in Angular at all, or diverge from Angular's Spanish equivalent — see Findings.

---

## Findings

### CRITICAL
None.

### WARNING

**W1 — `sale.tsx` does not wire `SaleProductRow`'s `checkAvailability`, live Sale/POS screen allows overselling stock-tracked products.**
`app/sales/routes/sale.tsx` renders `<SaleCategoryProducts products={categoryProducts} orderType={ORDER_TYPE} onAdded={handleAdded} />` with no `checkAvailability` prop, so `SaleProductRow`'s stock-gate (`sale-product-row.tsx:36`, gated on `product.discountFromInvantory`) never fires in production — it only fires in tests where the prop is passed directly. Angular's equivalent (`sale-product-row.component.ts:58-104`) performs this check unconditionally on every add-to-cart click. This is a real, live divergence in the Sales module's core action, not a cosmetic issue: a cashier can currently add more units of a stock-tracked product than are available. It is already tracked as tasks.md 2.5.2 (Stage 2 carry-over) with consistent documentation across tasks.md/design.md/spec.md's Inventory row — not a silently-missed gap. However, the stated rationale ("depends on `InventoryOfflineService`... that Stage 2 owns") is only partially accurate: `InventoryOfflineService.hasAvailableStock()` already exists and is fully tested (27 tests) as of Stage 0. The remaining work is a small integration change confined to `sale.tsx` (pass `checkAvailability={(id, qty) => inventoryService.hasAvailableStock(id, qty)}`), not new cross-cutting infrastructure. **Recommendation:** either close this 1-line wiring gap before Stage 1 is archived as fully parity-complete (it would take a small, low-risk, already-tested-downstream change), or explicitly record it as an accepted interim risk in spec.md's Sales row (currently only the Inventory row mentions the carry-over; the Sales row's "actions match Angular (L4)" claim has no caveat for this specific action).

**W2 — Hardcoded English strings in two Products-view components, one also invents an untested validation rule not present in Angular.**
- `app/sales/components/edit-product-category-modal.tsx:27`: `newErrors.order = 'Order must be a positive number'` — hardcoded English, no i18n key. Angular's equivalent (`edit-product-category-modal.component.html:24-28`) only validates `required` on the order field via `GENERAL.VALIDATION.REQUIRED` (translated); it has **no** "must be positive" rule at all. React invented an extra validation Angular doesn't have, in English, uncovered by any test.
- `app/sales/components/csv-product-importer-modal.tsx:34,41`: `setParseError('Failed to parse CSV file')` and `setParseError('Failed to read file')` — hardcoded English. Angular's equivalent error path (`csv-product-importer-modal.component.ts:71-72`) shows a Spanish fallback: `error.message || 'Error al importar los productos'` (also a literal, but in Spanish, matching the app's language). Neither React string matches Angular's language or wording.
Neither of these two components has a dedicated component-level test file (only `csv-product-parser.test.ts` exists, covering the pure parsing logic, not the modal's error-message strings) — these paths are currently untested at the UI layer.
**Recommendation:** translate both error messages to Spanish (ideally via new i18n keys, consistent with the rest of the module's L6 discipline), and reconsider whether the "positive number" validation should be kept as an intentional improvement (if so, document it as a deliberate deviation) or removed to match Angular exactly.

**W3 — (informational, not a new problem) Prior Stage 0 report's W1 documentation-drift finding is now confirmed resolved.**
The 2026-07-02 Stage 0 re-verify (obs #465) flagged `spec.md` as not yet updated to match `tasks.md`/`design.md`'s reassignment of the cart's inventory-availability audit from Sync to Inventory scope. As of this Stage 1 pass, `specs/frontend-parity-audit/spec.md:131-132,136` (commits `e4331bc`/`76e2311`) now correctly reflects the three-way split (Sales = cart UI/flow, Inventory = stock-check wiring incl. `sale.tsx checkAvailability`, Sync = only the generic PWA cross-cutting services). No further action needed; noting for continuity since this was an open item from the prior report.

### SUGGESTION

**S1 — Angular's `QuickSaleScannerComponent` (barcode scanner) confirmed dead code; correctly not ported, but not yet on the ratified dead-code list.**
`frontend/src/app/presentation/sale/quick-sale-scanner/*` exists but is never imported or referenced anywhere else in the Angular codebase (confirmed via full-repo grep — the component's own file is the only place its name appears, and its own `sale.component.html` has the trigger button commented out). Its core scanning logic is also internally disabled (`BrowserMultiFormatReader`/zxing imports commented out, `continuousScan()` is a no-op placeholder). React correctly did not port this. Recommend adding it to spec.md's ratified dead-code list explicitly, for audit-trail completeness (it currently isn't named there, unlike the other ratified-dead items).

**S2 — (carried from Stage 0 report) pre-existing hardcoded hex in `chart-core.tsx`/`landing-deep.*`.**
Still out of Stage 1 scope; will need cleanup under Stage 8 (Statistics) / landing-page's own L5 audit. Not introduced by Stage 1.

---

## Scope Note

This report covers **Stage 1 only** (Sales module: Products, Sale/POS, Orders, Sale Credits, Today Stats, Category Stats, Cart/nav-right), validated against current code as of 2026-07-02. Stage 0 (Foundations) was re-verified separately (see the RE-VERIFY section above, obs #465) and is not re-litigated here. Stage 2's carry-over tasks (2.5 inventory-availability wiring, 2.6 login/auth parity incl. the "POS Management" copy gap at 2.6.1) are explicitly **out of scope** — they are correctly scheduled as Stage 2 work, not Stage 1 failures, and this report treats W1 as a *tracked* Stage 1 exception rather than an undiscovered defect.

---

# Verify Report: Frontend Parity Audit — Stage 1 (Sales) — RE-VERIFY

**Change:** frontend-parity-audit
**Phase:** Verify (Stage 1 — Sales module, RE-VERIFY after two fix batches)
**Date:** 2026-07-02
**Mode:** Hybrid (engram + openspec file)
**Reason for re-verify:** Two commits landed since the prior formal Stage 1 verify pass (obs #465, PASS WITH WARNINGS): `60b0e09` (W1 stock-availability wiring + W2 text-parity fixes) and `fbdbafd` (SweetAlert2 port, 1.7). This pass confirms whether W1/W2 are actually closed and checks for regressions/new gaps, including a specifically flagged suspicion about the 3 new ERROR500 fallback dialogs added in `fbdbafd`.
**Scope:** Same as the prior Stage 1 report — Products, Sale/POS, Orders, Sale Credits, Today Stats, Category Stats, Cart/nav-right, plus the new SweetAlert2 dialog layer (task 1.7). Stage 2 carry-overs (2.5.1, 2.6.x) remain explicitly out of scope.

---

## Verdict: PASS WITH WARNINGS

Zero CRITICAL. Prior W1 (overselling gap) and W2 (hardcoded English/invented validation) are **CONFIRMED RESOLVED**. Two new WARNINGs found during this re-verify: one CONFIRMED text-parity miss (the suspected ERROR500 issue — real, not a false alarm) and one newly-introduced edge-case behavioral deviation in the W1 fix itself. Zero new SUGGESTIONs beyond the two carried from the prior pass.

---

## Test/Build Evidence (run 2026-07-02, actual output, this session)

**TypeScript** (`pnpm -C apps/web-store-pos exec tsc --noEmit`, from `frontend-react/`): clean, zero errors, no output.

**Full test suite** (`pnpm test`, turbo across `@store-mgmt/domain`, `@store-mgmt/web-common`, `@store-mgmt/web-store-pos`):
```
 Test Files  95 passed (95)
      Tests  1028 passed (1028)
   Duration  5.93s
```
Matches apply-progress's Batch 10 claim exactly (95 files / 1028 tests, +7 files / +48 tests over the prior verify's 88/980 baseline — the delta is Batch 9's W1/W2 fix tests plus Batch 10's SweetAlert2/CSV/cart-aria-label tests). One expected `stderr` noise line in `api-client.test.ts` (jsdom navigation warning), not a failure.

**Production build** (`pnpm -C apps/web-store-pos exec react-router build`): succeeded. New `sweetalert2` chunk `blocking-alert-*.js` ~79.5 kB / 21.1 kB gzip, present in the client asset manifest. No build errors or warnings beyond normal chunk-size output.

---

## W1 Re-Verification (stock-availability parity) — RESOLVED

`app/sales/lib/product-availability.ts` (`checkProductAvailabilityToSale`) is a faithful port of Angular's `InventoryOfflineService.hasAvailableProductToSale` (`inventory-offline.service.ts:397-423`):

| Branch | Angular | React |
|---|---|---|
| 1. Not found | `Result.Failure([ProductErrors.NotExists])` | `{ succeeded:false, errorCode:'NOT_EXISTS' }` |
| 2. Inactive | `ProductErrors.Inactive` | `'INACTIVE'` |
| 3. Not available to sale | `ProductErrors.ProductNotAvailableToSale` | `'NOT_AVAILABLE_TO_SALE'` |
| 4. Gate | `!hasInventoryModuleAvailable() \|\| !discountFromInvantory` → Success | same condition → `succeeded:true` |
| 5. No active inventory entries | `ProductErrors.ProductNotAvailable` | `'NOT_AVAILABLE'` (see WARNING below re: entry-detection edge case) |
| 6. Quantity check | `available >= quantity` (quantity = form qty only, no cart addition **in the service itself** — see note) | `inventory.available >= (quantity + cartQuantity)` |

All 5 error-code Spanish messages verified byte-identical against `product.errors.ts`/`es.ts` (`PRODUCT_ERRORS.NOT_EXISTS` = "El producto no existe.", `.INACTIVE` = "El producto no está activo.", `.NOT_AVAILABLE_TO_SALE` = "El producto no está disponible para la venta.", `SALES.NOT_INVENTORY_AVAILABLE_MESSAGE` = "El producto no está disponible en el inventario." for NOT_AVAILABLE, `PRODUCT_ERRORS.QUANTITY_NOT_AVAILABLE` = "La cantidad del producto no está disponible en el inventario.").

Wiring confirmed end-to-end: `sale.tsx:67-77` (`checkAvailability`, includes `getCartItemQuantity` from the cart store and `hasInventoryModuleAvailable(user)`) → `SaleCategoryProducts` (prop passthrough) → `SaleProductRow.handleAddToCart` (`sale-product-row.tsx:35-49`), which calls `showBlockingError` with `GENERAL.RESPONSE.ERROR_TITLE` + the mapped message and **aborts the add** (`return` before `onAdded`) on failure — matches Angular's blocking `Swal.fire({icon:'error',...})` in `sale-product-row.component.ts:62-104`.

Cart-quantity accumulation confirmed: React explicitly adds `cartQuantity` to the requested `quantity` before comparing against `available` (`product-availability.ts:76-77`), which is the *correct* interpretation of Angular's intent — Angular's own `hasAvailableProductToSale` signature takes a raw `quantity` argument, and the cart-quantity accumulation happens at the **caller** level in Angular (`sale-product-row.component.ts` computes `quantity = form qty + existing cart qty` before calling the service — confirmed by reading the call site, not just the service). React's single-function `checkProductAvailabilityToSale` folds both into one call, functionally equivalent.

**Conclusion: W1 CLOSED. No remaining overselling gap in the live Sale/POS screen.**

### NEW — WARNING found during W1 re-verify (not present in the original W1 finding)

`app/inventory/lib/services/inventory-offline-service.ts:323-327` (`getAvailableQuantity`, added in commit `60b0e09`):
```ts
getAvailableQuantity(productId: string): { hasEntries: boolean; available: number } {
  const activeEntries = this.repo.getByProductId(this.storeId, productId).filter((e) => e.isActive);
  const available = activeEntries.reduce((sum, e) => sum + e.available, 0);
  return { hasEntries: activeEntries.length > 0, available };
}
```
filters `isActive` **before** computing `hasEntries`. Angular's `hasAvailableProductToSale` (`inventory-offline.service.ts:410-419`) checks `inventories.length === 0` on the **raw, unfiltered** result of `getProductInventoriesByProductId` first (branch 5, `ProductErrors.ProductNotAvailable`), and only filters `isActive` afterward when summing `available` for the quantity comparison (branch 6, `ProductErrors.ProductQuantityNotAvailable`).

**Edge case:** a product whose inventory entries all exist but are all `isActive: false` (deactivated inventory rows, not deleted). Angular: `inventories.length > 0` (raw) → passes the NOT_AVAILABLE check, falls through to the quantity sum which computes `0` (all filtered out) → `0 >= quantity` is false → returns `ProductQuantityNotAvailable` ("La cantidad del producto no está disponible en el inventario."). React: `activeEntries.length === 0` → `hasEntries: false` → returns `NOT_AVAILABLE` ("El producto no está disponible en el inventario."). Both **block the sale** (no functional/security regression — overselling is still prevented), but the **specific error text shown to the user differs from Angular** in this one edge case, which is a genuine (if narrow) violation of spec.md's L6 "byte-identical Spanish text" requirement. This is a new deviation introduced by the W1 fix itself, not present before `60b0e09`.

---

## W2 Re-Verification (text-parity fixes) — RESOLVED

- `create-product-modal.tsx` (3 sites), `edit-product-modal.tsx` (2 sites), `edit-product-category-modal.tsx` (2 sites) — all 7 `GENERAL.VALIDATION.REQUIRED` call sites confirmed, rendering `"{name} es requerido"`, matching Angular's `VALIDATION.REQUIRED = '{{name}} es requerido'` (`es.ts:232`) — same rendered Spanish text, syntax difference is only the react-intl `{name}` vs ngx-translate `{{name}}` placeholder convention, not a text discrepancy.
- The invented "Order must be a positive number" check is gone from `edit-product-category-modal.tsx`; code comment at line 30 explicitly notes *"Angular's ONLY validation on `order` is `required`"* — confirmed against Angular's template, which has no positivity rule.
- `csv-product-importer-modal.tsx:46,53`: both `setParseError` calls now use `'Error al importar los productos'`, matching Angular's Spanish fallback literal (`csv-product-importer-modal.component.ts:71-72`, `error.message || 'Error al importar los productos'`).

**Conclusion: W2 CLOSED. No remaining hardcoded English or invented validation found in the re-checked components.**

---

## SweetAlert2 Parity (task 1.7, new since prior verify) — CONFIRMED

`app/shared/lib/blocking-alert.ts` — all 3 exported wrappers (`showBlockingError`, `confirmDialog`, `showAcknowledgeError`) verified against Angular's 3 distinct `Swal.fire` shapes used across the Sale module (error-only, question+confirm/cancel, error+explicit-OK-button), including exact `#3456ff`/`#dc3545` button colors and `icon: 'question'`/`'error'` values. No global `Swal.mixin` exists on either side (confirmed by repo grep) — stock defaults on both, correctly not invented.

**Restored confirm dialogs, both verified byte-exact:**
1. **Payment confirm** (`sale-credit-payment-modal.tsx:56-61` vs `sale-credit-payment-modal.component.ts:52-60`): title `SALE_CREDIT.PAYMENT_CONFIRM_TITLE` = "Confirmación de Pago", message `SALE_CREDIT.PAYMENT_CONFIRM_MESSAGE` = "Usted está segura(o) que desea pagar este crédito por venta?" — byte-identical both sides (`es.ts:305-306` React vs `es.ts:523-524` Angular).
2. **Deactivate confirm** (`order-item-list.tsx:36-45` vs `order-item-list.component.ts:34-53`): title `GENERAL.DELETE_CONFIRM_TITLE` = "Confirmación para eliminar", message `GENERAL.DELETE_CONFIRM_MESSAGE_A` with `{name}` = `TODAY_ORDERS.TEXT` = "¿Está seguro que desea eliminar esta Ventas del día?" — byte-identical. The failure path is also correctly layered: React's `showAcknowledgeError` interpolates Angular's own hardcoded literal *inside* the `TODAY_ORDERS.ERROR_DELETING_ORDER` template (`"Ocurrió un error eliminando la venta. {message}"`), exactly matching Angular's `showErrorMessage(['La venta no pudo ser cancelada...'])` → `translate.instant('TODAY_ORDERS.ERROR_DELETING_ORDER', {message: errors.join('<br>')})` composition (`order-item-list.component.ts:50-51,96-99,124-135`). This is a subtle two-key composition that was easy to get wrong (e.g. by only porting the inner literal) and it was ported correctly.

"Active"→"Activo" label gap (flagged-but-deferred in the prior W2) confirmed closed: `edit-product-category-modal.tsx:99` now uses `GENERAL.ACTIVE` = "Activo".

Hardcoded-English sweep confirmed clean: grepped `app/sales/**` (excluding `__tests__`) and `cart-shell.tsx` for capitalized-English-word patterns — zero hits outside of legitimate Spanish/code-comment/i18n-key content. `cart-shell.tsx`'s 3 cart-item aria-labels (`CART.DECREASE_QUANTITY`/`INCREASE_QUANTITY`/`REMOVE_ITEM`) now resolve to Spanish, not English.

---

## §4 — Suspected ERROR500 Miss: CONFIRMED AS A REAL TEXT-PARITY GAP (not a false alarm)

Read Angular's exact `Swal.fire` call at all three flagged sites:

- `edit-sale-credit-modal.component.ts:66-70`: `Swal.fire({ icon:'error', title: translate.instant('GENERAL.ERROR'), text: dataEntry.errors[0].description })`
- `edit-order-modal.component.ts:49-53`: identical shape.
- `sale-credit-payment-modal.component.ts:71-75`: identical shape.

Traced the underlying service calls to determine what `dataEntry.errors[0].description` actually resolves to at runtime:

| Call site | Service method | Angular's ONLY failure branch | `errors[0].description` |
|---|---|---|---|
| `edit-sale-credit-modal` | `SaleCreditOfflineService.updateSaleCredit` (`sale-credit-offline.service.ts:67-79`) | `!saleCredit` (not found) | `SaleCreditErrors.NotExists` = **"El gasto no existe."** |
| `sale-credit-payment-modal` | `SaleCreditOfflineService.paidSaleCredit` (`:81-97`) | `!saleCredit` (not found) | `SaleCreditErrors.NotExists` = **"El gasto no existe."** |
| `edit-order-modal` | `OrderOfflineService.updateTodayOrder` (`order-offline.service.ts:342-352`) | `!order` (not found) | `OrderErrors.NotExists` = **"La orden no existe"** |

In all three cases the "dynamic" description is **not actually dynamic** — each local-storage service method has exactly one failure branch (record not found), so the text shown is a single, known, static string per call site. Angular's title is `GENERAL.ERROR`, not `GENERAL.RESPONSE.ERROR_TITLE`.

React (`edit-sale-credit-modal.tsx:49-52`, `edit-order-modal.tsx:47-51`, `sale-credit-payment-modal.tsx:67-71`) uses the correct title (`GENERAL.ERROR`) but shows `GENERAL.RESPONSE.ERROR500_MESSAGE` = **"Por favor, vuelva a intentarlo y si persiste el error contacte al equipo de soporte técnico."** at all three sites — a generic, unrelated fallback message. Apply-progress's stated rationale for this choice ("React's services can't surface a dynamic description like Angular's `DataResult.errors[0].description`") does not hold up under inspection: the description is static and knowable per call site, not truly dynamic, so a generic fallback was an avoidable simplification rather than a forced tradeoff.

**Exact expected Spanish (what Angular actually shows):**
- `edit-sale-credit-modal.tsx` and `sale-credit-payment-modal.tsx` failure dialogs should show: title "Error", text **"El gasto no existe."**
- `edit-order-modal.tsx` failure dialog should show: title "Error", text **"La orden no existe"**

**Severity: WARNING** (confirmed text-parity miss on an edge-case failure path — only reachable if the underlying record is deleted/missing between load and submit — not a blocking regression to the primary happy-path flows, consistent with the severity given to the original W1/W2 findings). **Recommended fix:** add `SALE_CREDIT.NOT_EXISTS`/`ORDER.NOT_EXISTS`-equivalent i18n keys (or reuse existing ones if present) with the exact Spanish above, and have React's local `sale-credit-offline-service.ts`/`order-offline-service.ts` return a distinguishable not-found signal so the modals can show the specific message instead of the generic `ERROR500_MESSAGE` fallback.

---

## Findings Summary

### CRITICAL
None.

### WARNING

**W1 (was CRITICAL-tracked gap, now CLOSED)** — confirmed resolved, see "W1 Re-Verification" above.

**W2 (was text-parity gap, now CLOSED)** — confirmed resolved, see "W2 Re-Verification" above.

**NEW-W1 — `getAvailableQuantity`'s active-filter ordering diverges from Angular's `hasAvailableProductToSale` in an edge case (inventory entries exist but are all inactive), producing the wrong error message (`NOT_AVAILABLE` instead of Angular's `QUANTITY_NOT_AVAILABLE`) though blocking behavior itself is preserved.** `app/inventory/lib/services/inventory-offline-service.ts:323-327` vs `frontend/src/app/application/entries/inventory-offline.service.ts:410-419`. Newly introduced in commit `60b0e09`. Low practical impact (narrow edge case, does not allow overselling), but a confirmed code-level L6 text-parity deviation.

**NEW-W2 — Confirmed ERROR500 text-parity miss at 3 call sites (edit-sale-credit-modal, edit-order-modal, sale-credit-payment-modal failure dialogs).** See "§4" section above for full detail and exact expected Spanish per site. Introduced in commit `fbdbafd`.

### SUGGESTION

Carried unchanged from the prior Stage 1 report (not re-litigated, no new evidence found this pass):
- **S1** — `QuickSaleScannerComponent` confirmed dead code, correctly not ported; recommend adding to spec.md's ratified dead-code list.
- **S2** — pre-existing hardcoded hex in `chart-core.tsx`/`landing-deep.*`, out of Stage 1 scope.

---

## Accepted-as-Superset (confirmed present, explicitly not flagged as failures per user direction)

- CSV importer preview table + per-row validation (`csv-product-importer-modal.tsx`/`csv-product-parser.ts`) — Angular has only a file input; React's richer UI confirmed intact, text now Spanish.
- Cart +/- and remove aria-labels (`cart-shell.tsx`) — Angular has none; React's a11y addition confirmed intact, text now Spanish.
- `onSave`/`onPay`/`onUpdate`/`onDeactivateOrder` boolean-return contracts — confirmed as a faithful port of Angular's `DataResult.succeeded` branching, not an invented business rule.

---

## Scope Note

This report covers **Stage 1 (Sales) RE-VERIFY only**, validated against code as of 2026-07-02 (commits `60b0e09`, `fbdbafd`). Stage 0 and the original Stage 1 formal pass are preserved unchanged above. Out of scope (per explicit direction): login "POS Management" copy (tasks.md 2.6.1), cart increase/decrease stock validation (tasks.md 2.5.1) — both remain Stage 2 carry-overs.

---

# Stage 1 (Sales) FINAL RE-VERIFY — 2026-07-02 (commit `e552258`)

**Reason for this pass:** Batch 11 (commit `e552258`) landed to close the two WARNINGs (NEW-W1, NEW-W2) found in the prior RE-VERIFY pass above. This pass confirms both are actually closed, checks for regressions, and produces the final Stage 1 verdict before archive.

**Scope:** Same as prior Stage 1 passes — Products, Sale/POS, Orders, Sale Credits, Today Stats, Category Stats, Cart/nav-right, SweetAlert2 dialog layer. Stage 2 carry-overs (2.5.1, 2.6.x) remain explicitly out of scope.

---

## Verdict: PASS

Zero CRITICAL. Zero WARNING. NEW-W1 and NEW-W2 both **CONFIRMED RESOLVED** with no regressions to any prior finding (original W1, W2, or SweetAlert2 task 1.7). Two SUGGESTIONs carried unchanged from prior passes (both out of Stage 1 scope, not re-litigated). Stage 1 (Sales) is now fully closed.

---

## Test/Build Evidence (run 2026-07-02, actual output, this session)

**TypeScript** (`pnpm -C apps/web-store-pos exec tsc --noEmit`, from `frontend-react/`): clean, zero errors, no output.

**Full test suite** (`pnpm test`, turbo across `@store-mgmt/domain`, `@store-mgmt/web-common`, `@store-mgmt/web-store-pos`):
```
@store-mgmt/domain:test:      Tests  66 passed (66)
@store-mgmt/web-common:test:  Tests  11 passed (11)
@store-mgmt/web-store-pos:test:  Test Files  95 passed (95)
@store-mgmt/web-store-pos:test:       Tests  1028 passed (1028)
 Tasks:    3 successful, 3 total
```
Matches expected counts exactly (domain 66, web-common 11, web-store-pos 95/1028 — same totals as the prior RE-VERIFY pass; apply-progress Batch 11 confirms 0 net new tests, 3 existing assertions corrected to the right literals). One expected `stderr` noise line in `api-client.test.ts` (jsdom navigation warning), not a failure.

**Production build** (`pnpm -C apps/web-store-pos exec react-router build`): succeeded. `blocking-alert-C1w1tbeV.js` chunk (sweetalert2) present, 79.51 kB / 21.13 kB gzip. No build errors or new warnings.

---

## NEW-W1 Re-Verification (inventory active-filter branch order) — RESOLVED

`app/inventory/lib/services/inventory-offline-service.ts:328-334` (`getAvailableQuantity`) re-read at the current commit:

```ts
getAvailableQuantity(productId: string): { hasEntries: boolean; available: number } {
  const allEntries = this.repo.getByProductId(this.storeId, productId);
  const available = allEntries
    .filter((e) => e.isActive)
    .reduce((sum, e) => sum + e.available, 0);
  return { hasEntries: allEntries.length > 0, available };
}
```

`hasEntries` now derives from `allEntries` (the raw, unfiltered result), and `isActive` filtering is applied only when summing `available` — matching Angular's `hasAvailableProductToSale` (`inventory-offline.service.ts:410-419`, re-read at the source this pass) exactly: `inventories.length === 0` is checked against the raw list (line 411) before the `isActive` filter is applied to the quantity sum (lines 415-419). The all-inactive-entries edge case now falls through to the quantity check (`0 >= quantity` fails) and returns the `QUANTITY_NOT_AVAILABLE` message, identical to Angular, instead of the previous `NOT_AVAILABLE` message.

Test evidence: `app/inventory/lib/services/__tests__/inventory-offline-service.test.ts` INV-08 all-inactive-entries case asserts `{hasEntries: true, available: 0}` — confirmed passing in this session's `pnpm test` run (31/31 in that file).

**Conclusion: NEW-W1 CLOSED. No regression to the overselling-prevention behavior (still blocks the sale in every branch); the edge-case error text now matches Angular byte-for-byte.**

---

## NEW-W2 Re-Verification (ERROR500 fallback → NotExists literal) — RESOLVED

Read the current React source at all three flagged call sites and the i18n dictionary, cross-checked against Angular's exact source (both re-read fresh this pass, not from apply-progress claims):

| Call site | React (current) | Angular source-of-truth | Match |
|---|---|---|---|
| `edit-sale-credit-modal.tsx:51-54` | `intl.formatMessage({id:'SALE_CREDIT_ERRORS.NOT_EXISTS'})` → **"El gasto no existe."** | `sale-credit.errors.ts:6` `SaleCreditErrors.NotExists.description` = `` `El gasto no existe.` `` | ✅ byte-identical, trailing period preserved |
| `sale-credit-payment-modal.tsx:70-73` | same key → **"El gasto no existe."** | same | ✅ byte-identical |
| `edit-order-modal.tsx:50-53` | `intl.formatMessage({id:'ORDER_ERRORS.NOT_EXISTS'})` → **"La orden no existe"** | `order.errors.ts:6` `OrderErrors.NotExists.description` = `'La orden no existe'` | ✅ byte-identical, **no** trailing period — the punctuation asymmetry between the two error messages is correctly preserved, not normalized away |

i18n dictionary (`app/shared/lib/i18n/es.ts:245-246`):
```
'SALE_CREDIT_ERRORS.NOT_EXISTS': 'El gasto no existe.',
'ORDER_ERRORS.NOT_EXISTS': 'La orden no existe',
```
Both confirmed present and byte-identical to the Angular literals, including the deliberate period/no-period asymmetry.

None of the three call sites reference `GENERAL.RESPONSE.ERROR500_MESSAGE` any longer.

Test evidence: `credit-components.test.tsx` (2 assertions) and `order-components.test.tsx` (1 assertion) assert the exact literals above — confirmed passing in this session's `pnpm test` run (22/22 and 15/15 respectively).

**Conclusion: NEW-W2 CLOSED. All 3 error dialogs now show Angular's exact static NotExists description instead of the generic ERROR500 fallback.**

---

## Regression Check

Re-scanned the full Stage 1 finding history for drift:
- Original **W1** (overselling gap) — still closed, `product-availability.ts` 5-way branch parity unchanged by this batch.
- Original **W2** (hardcoded English/invented validation) — still closed, no files in Batch 11's diff touch the previously-fixed validation/CSV-import call sites.
- **SweetAlert2 (task 1.7)** — `blocking-alert.ts` wrapper untouched by Batch 11; both restored confirm dialogs (payment, deactivate) unaffected.
- Batch 11's diff scope (per apply-progress): `es.ts` + 3 component call sites + 1 service file (`inventory-offline-service.ts`) + 3 test files — confirmed narrow, no incidental changes to unrelated Stage 1 surface area found during this pass's source reads.

No regressions found.

---

## Findings Summary (Final)

### CRITICAL
None.

### WARNING
None. NEW-W1 and NEW-W2 both closed, see sections above. All prior WARNINGs (original W1, W2) remain closed with no regression.

### SUGGESTION

Carried unchanged from all prior Stage 1 passes (not re-litigated, no new evidence found this pass, both explicitly out of Stage 1 scope):
- **S1** — `QuickSaleScannerComponent` confirmed dead code, correctly not ported; recommend adding to spec.md's ratified dead-code list.
- **S2** — pre-existing hardcoded hex in `chart-core.tsx`/`landing-deep.*`, out of Stage 1 scope.

---

## Accepted-as-Superset (unchanged, confirmed still accurate)

- CSV importer preview table + per-row validation — Angular has only a file input.
- Cart +/- and remove aria-labels — Angular has none.
- `onSave`/`onPay`/`onUpdate`/`onDeactivateOrder` boolean-return contracts — faithful port of Angular's `DataResult.succeeded` branching.

---

## Final Stage 1 Verdict

**PASS.** 0 CRITICAL, 0 WARNING, 2 SUGGESTION (both carried, both out of scope). Stage 1 (Sales) is fully closed. `next_recommended`: `sdd-archive` for Stage 1, or proceed directly to Stage 2 (Inventory) `sdd-apply` for the remaining carry-over items (2.5.1 cart increase/decrease validation, 2.6 login/auth parity — login "POS Management" copy gap, post-login redirect branch, authenticated-root redirect).

## Scope Note

This section covers the **Stage 1 (Sales) FINAL RE-VERIFY only** (commit `e552258`), validated against code as of 2026-07-02. All prior sections (Stage 0, original Stage 1 pass, first Stage 1 RE-VERIFY) are preserved unchanged above for history. Out of scope (per explicit direction, deferred to Stage 2): login "POS Management" copy (tasks.md 2.6.1), cart increase/decrease stock validation (tasks.md 2.5.1).
