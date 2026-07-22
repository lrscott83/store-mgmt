# Tasks: Presentation Parity — Bucket B

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~500-650 total across 6 WUs (commits-only, not a single PR) — auth shell markup + `generateProductRows` port are the heaviest |
| 400-line budget risk | Medium-High aggregate; Low-Medium per-commit |
| Chained PRs recommended | No — project convention is commits-only delivery on the current branch, no PRs regardless of size |
| Suggested split | Not needed — commit per work unit on branch |
| Delivery strategy | commits-only (no PRs) |
| Chain strategy | pending (not applicable — no PRs) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

Branch: `feat/presentation-parity-bucket-b` (or current active parity branch). Strict TDD active: test runner `pnpm test` (vitest + @testing-library/react, jsdom), every implementation task pairs with a RED test task first. Type check: `pnpm -C apps/web-store-pos exec tsc --noEmit`. Build: `pnpm -C apps/web-store-pos build`. i18n: components using `useIntl` must be wrapped in `IntlProvider` in tests.

No design artifact exists for this change (pure presentation-parity revert/port work; proposal + spec + source-map are the full basis, consistent with prior bucket-c/e treatment).

### Suggested Work Units

| Unit | Goal | Commit | Notes |
|------|------|--------|-------|
| WU1 | Tutorial revert — single grouped panel | 1 commit | `help/routes/tutorial.tsx` |
| WU2 | Owner Tiendas tab revert — grid-only | 1 commit | `admin/owners/routes/owner-edit.tsx`, reuse handlers from `admin/stores/routes/store-list.tsx` |
| WU3 | Auth decorative shell (light theme) | 1 commit | `auth/components/auth-layout.tsx` |
| WU4 | Reports — row-builder port + PDF fab | 1-2 commits (aggregator, then wiring) | `reports/routes/today-report.tsx` + new row-builder module |
| WU5 | Regression guards for KEEP items | 1 commit (both assertions) | category-actions-menu, dashboard charts |
| WU6 | Final verification | no commit (gate) | `pnpm test` + tsc + build |

## Phase 1: WU1 — Tutorial revert (Requirement: "Tutorial renders as a single grouped panel")

- [x] 1.1 RED: write test in `help/routes/tutorial.test.tsx` asserting exactly ONE collapsible panel with title "Pasos para realizar una venta" containing all 4 numbered steps, under card title `TUTORIAL.TITLE`; assert no 4 independent per-step panels exist.
- [x] 1.2 GREEN: rewrite `help/routes/tutorial.tsx` to render the single grouped panel matching `tutorial.component.html`, removing the 4-independent-collapsible structure.
- [x] 1.3 Verify: `pnpm test help/routes/tutorial` passes; manual DOM check confirms one panel only.

## Phase 2: WU2 — Owner Tiendas tab revert (Requirement: "Owner Tiendas tab renders the store grid only")

- [ ] 2.1 RED: write test in `admin/owners/routes/owner-edit.test.tsx` (Tiendas tab section) asserting `StoreCardList` renders store cards, no `<h1>` with `STORES.LIST_TITLE`, no "+ Agregar" fab within the tab.
- [ ] 2.2 RED (cont.): add assertion that approve/disapprove/edit handlers on a rendered store card fire the same as `/admin/stores` (mirror expectations from `admin/stores/routes/store-list.test.tsx` if it exists, else assert callback invocation directly).
- [ ] 2.3 GREEN: in `admin/owners/routes/owner-edit.tsx`, replace the `AdminStoreListPage` mount with direct `StoreCardList` render; copy fetch/approve/disapprove/edit logic from `admin/stores/routes/store-list.tsx:26-70`. Do not modify `admin/stores/routes/store-list.tsx` (`AdminStoreListPage` stays intact).
- [ ] 2.4 Verify: `pnpm test admin/owners/routes/owner-edit` passes; confirm `admin/stores/routes/store-list.test.tsx` (if present) is unaffected.

## Phase 3: WU3 — Auth decorative shell (Requirement: "Auth layout renders the decorative shell on the light theme")

- [ ] 3.1 RED: write test in `auth/components/auth-layout.test.tsx` asserting literal text "VendeDTo" and "Automatiza tu Negocio" are present (not sourced from intl keys), bg-decoration SVG shapes present, card header-ornament SVGs present, legal footer still present.
- [ ] 3.2 RED (cont.): add assertion that the card background remains the existing light theme (no dark-mode background class/color introduced).
- [ ] 3.3 GREEN: edit `auth/components/auth-layout.tsx` — add bg-decoration SVGs (3 shapes, gold `#f5b026` stroke), replace `GENERAL.APP_NAME`/`APP_SUBTITLE` intl usage with literal brand header (`VendeDTo` + divider + "Automatiza tu Negocio" tagline), add card header-ornament SVGs. Do not touch the footer or theme background classes (batch-1, closed).
- [ ] 3.4 Verify: `pnpm test auth/components/auth-layout` passes; visually confirm no dark-theme colors leaked in.

## Phase 4: WU4 — Reports row-builder + PDF fab (Requirement: "Reports dashboard is preserved and a working PDF export is added")

- [ ] 4.1 RED: create `reports/lib/pdf/generate-product-rows.test.ts` — port test cases from Angular `generateProductRows()` (`inventory-today-sale.component.ts:176-226`), covering normal data plus edge cases (zero sales, zero available stock — no divide-by-zero, no dropped rows).
- [ ] 4.2 GREEN: create `reports/lib/pdf/generate-product-rows.ts` exporting a function producing `InventoryTodaySaleRow[]` (13 columns, col-2 `unit` literal `'U'`) from real offline data, matching Angular's aggregation exactly.
- [ ] 4.3 RED: write test in `reports/routes/today-report.test.tsx` asserting a "Generar Reporte" button renders ABOVE the existing KPI summary + inventory table, and that activating it calls the row-builder then invokes `inventory-today-sale-pdf.ts` (mock the pdf module) with rows matching the built shape.
- [ ] 4.4 GREEN: edit `reports/routes/today-report.tsx` to add the "Generar Reporte" fab-equivalent button above the dashboard, wired to call `generate-product-rows.ts` then the existing `inventory-today-sale-pdf.ts`. Do not alter the existing KPI/inventory-table dashboard markup.
- [ ] 4.5 Verify: `pnpm test reports/` passes; confirm dashboard sections render unchanged alongside the new button.

## Phase 5: WU5 — Regression guards for KEEP items (Requirements: "Category actions menu stays the single action path", "Statistics charts remain recharts")

- [ ] 5.1 Add/confirm test in `sales/components/category-actions-menu.test.tsx` (or category-list test) asserting only `CategoryActionsMenu` (⚙️) renders per row and no inline per-action fab buttons are present.
- [ ] 5.2 Add/confirm test in `statistics/routes/dashboard.test.tsx` asserting `SalesChart` and `ProfitChart` render (not plain tables) and KPI/currency-selector/top-products sections still render.
- [ ] 5.3 No implementation changes for either file — commit as a test-only regression-guard commit.

## Phase 6: WU6 — Final verification

- [ ] 6.1 Run full suite: `pnpm test` (web-store-pos) — all green, no regressions.
- [ ] 6.2 Run `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean.
- [ ] 6.3 Run `pnpm -C apps/web-store-pos build` — succeeds.
- [ ] 6.4 Confirm all 6 spec requirements satisfied; confirm `AdminStoreListPage` and auth footer/success-screen removal remain untouched.
