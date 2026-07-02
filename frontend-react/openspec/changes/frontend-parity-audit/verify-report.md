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
