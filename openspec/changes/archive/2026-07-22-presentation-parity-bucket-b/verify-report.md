## Verification Report

**Change**: presentation-parity-bucket-b
**Branch**: feat/presentation-parity-bucket-b (5 WU commits over feat/presentation-parity-bucket-e base: f10df9c, 20a308b, 82a2175, 4f6e2f7, 350cefe)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 19 (WU1:3, WU2:4, WU3:5, WU4:3, WU5:4) |
| Tasks complete | 19 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Tests**: PASSED — `pnpm test` (frontend-react workspace, turbo → web-store-pos vitest) → **1993/1993 tests passed, 130/130 files passed**. (apply-progress claimed 1993/130 — confirmed by independent re-run.)

**Typecheck**: PASSED — `pnpm -C apps/web-store-pos exec tsc --noEmit` (run from `frontend-react/`) — zero errors, zero output.

**Build**: PASSED — `pnpm -C apps/web-store-pos build` (run from `frontend-react/`) — client + SSR-disabled SPA + PWA service-worker (113 precache entries) built successfully, `✓ built in 4.63s` / `✓ built in 273ms` (service-worker) / SPA mode index.html generated, no errors.

### Scope / Diff Integrity
- `git diff --stat 4e9ab34..4968519 -- '*store-list.tsx' '*inventory-today-sale-pdf.ts' '*sales/components/category-actions-menu.tsx' '*statistics/routes/dashboard.tsx'` → **empty diff** — `AdminStoreListPage` (`admin/stores/routes/store-list.tsx`), `reports/lib/pdf/inventory-today-sale-pdf.ts`, `category-actions-menu.tsx`, and `statistics/routes/dashboard.tsx` are all byte-for-byte unchanged.
- `git diff --stat 4e9ab34..4968519 -- '*/auth/*'` → **empty diff** — no auth-screen/auth-shell changes exist; confirms the auth decorative-shell item (cut from scope) was NOT implemented.
- Full diff `4e9ab34..350cefe`: 13 files changed, 979 insertions(+), 207 deletions(-) — 8 impl/test-pair files (tutorial, owner-edit, generate-product-rows [new], reports-routes, today-report, products.test, statistics-routes.test) + icons.tsx (+DownloadIcon) + es.ts (+2 i18n keys) + tasks.md. No files outside the WU1-5 scope touched. `docs/backend/*.md` modifications present in the working tree are unrelated pre-existing changes from a different workstream (confirmed via `git status`), correctly excluded from this review per instructions.

### Spec Compliance Matrix
| Requirement | Scenario | Evidence | Test | Result |
|---|---|---|---|---|
| Category actions menu stays the single action path (KEEP) | Only CategoryActionsMenu (⚙️) renders, no inline per-action fabs | `sales/components/category-actions-menu.tsx` confirmed unchanged (empty diff since bucket-e) | `sales/routes/__tests__/products.test.tsx:778-802` "REGRESSION: only the gear menu is the category-actions path" — asserts exactly 1 gear toggle, no `edit-category-button`/`add-product-button`/`add-products-button`, exactly 3 buttons in the row | ✅ COMPLIANT |
| Tutorial renders as a single grouped panel | Exactly ONE collapsible panel titled "Pasos para realizar una venta" with all 4 numbered steps | `help/routes/tutorial.tsx` rewritten (commit f10df9c) — single `TutorialPanel` wrapping all 4 numbered `<h6>` steps | `help/routes/__tests__/tutorial.test.tsx:55-133` — asserts `getAllByRole('button')` has length 1, panel titled correctly, defaults collapsed, expanding reveals all 4 steps, no 4 independent panels | ✅ COMPLIANT |
| Owner "Tiendas" tab renders the store grid only | `StoreCardList` only, no `<h1>` STORES.LIST_TITLE, no "+ Agregar" fab; approve/disapprove/edit work | `admin/owners/routes/owner-edit.tsx:419-429` renders `StoreCardList` directly with copied fetch/approve/disapprove/edit logic; `AdminStoreListPage` mount removed | `admin/owners/routes/__tests__/owner-edit.test.tsx:634-764` — 7 tests: renders cards, no duplicated h1, no add-fab, approve/disapprove/edit handlers fire with identical confirmDialog + service calls as `/admin/stores` | ✅ COMPLIANT |
| Statistics charts remain recharts (KEEP) | `SalesChart`/`ProfitChart` render, KPI/currency/top-products intact | `statistics/routes/dashboard.tsx` confirmed unchanged (empty diff since bucket-e) | `statistics/routes/__tests__/statistics-routes.test.tsx:449-479` "REGRESSION (bucket-b, KEEP)" — asserts `sales-chart`/`profit-chart` testids present alongside KPI text, currency selector, top-products | ✅ COMPLIANT |
| Reports dashboard preserved + working PDF export added | "Generar Reporte" button above dashboard; dashboard unchanged; row-builder + PDF invoked with matching shape | `reports/routes/today-report.tsx:158-163` adds fab-equivalent button above KPI/inventory sections, wired to `generateProductRows()` → `exportInventoryTodaySalePdf()`; `reports/lib/pdf/generate-product-rows.ts` is a 1:1 port of Angular's `generateProductRows()` (13-col row, `unit: 'U'` literal) | `reports/lib/pdf/generate-product-rows.test.ts` (5 cases: ROW-01 full aggregation, ROW-02 zero sales, ROW-03 zero stock, ROW-04 failed envelopes, ROW-05 multi-product no dropped rows); `reports/routes/__tests__/reports-routes.test.tsx:259-325` — button position via `compareDocumentPosition`, dashboard sections unchanged, real-data click → PDF mock invoked with matching row shape | ✅ COMPLIANT |

**Compliance summary**: 5/5 requirements compliant, 0 untested/failing.

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| All tasks have tests | ✅ | Every impl file (tutorial.tsx, owner-edit.tsx, generate-product-rows.ts, today-report.tsx) has a matching test file updated in the same commit |
| RED confirmed | ✅ | apply-progress states RED was confirmed via temp-hiding impl / real test-fail runs before every GREEN; test files show clear before/after structural assertions (e.g., tutorial "no 4 independent panels", owner-edit "no duplicated h1/add-fab") consistent with a real revert being tested |
| GREEN confirmed | ✅ | 1993/1993 pass on independent re-run — full suite green |
| Edge-case triangulation | ✅ | `generate-product-rows.test.ts` explicitly covers zero-sales, zero-stock, failed-envelope, and multi-product-no-dropped-rows edge cases per the spec's third reports scenario |
| Safety Net for modified files | ✅ | Full suite (1993 tests) run and green after the batch; regression guards (WU4) added specifically to lock in the two KEEP decisions going forward |

**TDD Compliance**: 5/5 checks passed

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Category menu KEEP | ✅ Verified unchanged + regression-guarded | Source file untouched, new test added |
| Tutorial single panel | ✅ Implemented | Matches `tutorial.component.html` structure literally |
| Owner Tiendas tab grid-only | ✅ Implemented | `AdminStoreListPage` untouched; tab now uses `StoreCardList` directly with copied handler logic |
| Statistics charts KEEP | ✅ Verified unchanged + regression-guarded | Source file untouched, new test added |
| Reports PDF export | ✅ Implemented | New `generate-product-rows.ts` is a faithful 1:1 port; wired to the existing faithful `inventory-today-sale-pdf.ts` (also confirmed unchanged) |

### Coherence (Tasks/Apply-Progress)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Auth decorative-shell item explicitly cut from scope | ✅ Yes | Confirmed via empty `*/auth/*` diff — nothing implemented there |
| `AdminStoreListPage` stays the sole `/admin/stores` mount, untouched | ✅ Yes | Confirmed via empty targeted diff |
| Row-builder narrow dependency-slice interfaces (not full service coupling) | ✅ Yes | `GenerateProductRowsProductService/OrderService/InventoryService` interfaces confirmed in `generate-product-rows.ts:11-23`, production passes real service instances |
| WU1/WU2 already-committed-before-batch reconciliation | ✅ Yes | Verified via `git log` — f10df9c and 20a308b predate the 4f6e2f7/82a2175/350cefe/d5b31b6 sequence, consistent with apply-progress's account of tasks.md having been reset by an intermediate rerun |

### Issues Found

**CRITICAL**: None.

**WARNING**: None found for this batch. (Note: the fab-variant CSS-class-coupling pattern flagged as a WARNING in the prior bucket-c verify report — `toHaveClass('rounded-full')` — recurs in `owner-edit.test.tsx:267` for the pre-existing submit fab, but that assertion is unchanged carry-over code, not new work from this bucket; not re-flagging as a bucket-b-introduced issue.)

**SUGGESTION**:
- Consider running `--coverage` once as a baseline snapshot for this bucket, purely for historical tracking (not blocking, consistent with prior bucket verify reports).

### Verdict
**PASS** — all 5 spec requirements independently verified against Angular source and current code; 2 KEEP requirements confirmed via byte-identical unchanged source files plus new regression-guard tests; 3 structural-change requirements (tutorial revert, owner Tiendas tab revert, reports PDF export) each have direct implementation evidence and a passing covering test, including edge-case triangulation for the row-builder aggregation. Full test suite (1993/1993), typecheck, and production build are all clean. Scope integrity is fully intact: `AdminStoreListPage`, `inventory-today-sale-pdf.ts`, and all auth screens are untouched, and the auth decorative-shell item correctly was NOT implemented (out of scope). Zero CRITICAL or WARNING issues.
