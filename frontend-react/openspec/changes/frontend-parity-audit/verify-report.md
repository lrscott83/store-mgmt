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
