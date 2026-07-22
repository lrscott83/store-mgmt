# Archive Report — presentation-parity-bucket-b (2026-07-22)

**Change**: presentation-parity-bucket-b
**Mode**: openspec (file-based)
**Branch**: `feat/presentation-parity-bucket-b`, 5 WU commits over the `feat/presentation-parity-bucket-e` base (f10df9c, 20a308b, 82a2175, 4f6e2f7, 350cefe) + doc commit 4968519, not yet merged/pushed
**Verify verdict**: PASS — 0 CRITICAL, 0 WARNING
**Independent adversarial code-only parity review vs Angular source**: CLEAN (item-3 PDF fidelity independently verified column-by-column)

## Spec Sync

`openspec/specs/presentation-parity-bucket-b/spec.md` did not exist prior to this change — this is a standalone presentation-parity domain (same precedent as `presentation-parity-bucket-c` and `presentation-parity-bucket-e`). The delta spec graduates to the canonical spec verbatim (parity-review returned CLEAN, no follow-up corrections needed):

- 5 requirements carried over unchanged: category actions menu (KEEP, single ⚙️ path), tutorial single-grouped-panel revert, owner "Tiendas" tab grid-only revert, statistics charts (KEEP, recharts), reports dashboard preserved + working PDF export added.

The delta spec is preserved verbatim in the archived change folder's `specs/presentation-parity-bucket-b/spec.md` for audit-trail purposes; the canonical spec at `openspec/specs/presentation-parity-bucket-b/spec.md` is an identical copy and is now the source of truth for this domain.

## Delivered

Mechanical + structural Angular→React presentation-parity fixes across 5 requirements. **Note**: a 6th item originally considered for this bucket — an auth decorative-shell treatment — was **CUT from scope mid-change by user decision** and was NOT implemented. This is confirmed in the verify report via an empty `git diff --stat` against `*/auth/*` for the full commit range.

1. **Tutorial revert — single grouped panel** (commit `f10df9c`). `help/routes/tutorial.tsx` rewritten from 4 independent collapsibles back to Angular's single `mat-expansion-panel` structure: ONE panel titled "Pasos para realizar una venta" (literal), containing all 4 numbered steps, under card title `TUTORIAL.TITLE`.
2. **Owner "Tiendas" tab revert — grid-only** (commit `20a308b`). `admin/owners/routes/owner-edit.tsx` no longer mounts the full `AdminStoreListPage` (which duplicated a page title + "+ Agregar" fab inside the tab). Now renders `StoreCardList` directly, with fetch/approve/disapprove/edit logic copied from `admin/stores/routes/store-list.tsx:26-70`. `AdminStoreListPage` itself (used at `/admin/stores`) remains byte-for-byte unchanged.
3. **Reports — row-builder port + working PDF export** (commits `82a2175`, `4f6e2f7`). New `reports/lib/pdf/generate-product-rows.ts` is a faithful 1:1 port of Angular's `generateProductRows()` (`inventory-today-sale.component.ts:176-226`), producing `InventoryTodaySaleRow[]` (13 columns, column-2 `unit` literal `'U'`) from real offline data. `reports/routes/today-report.tsx` gained a "Generar Reporte" button above the existing KPI/inventory dashboard (unchanged), wired to call the row-builder then the pre-existing, already-faithful orphaned port `reports/lib/pdf/inventory-today-sale-pdf.ts` (also confirmed byte-for-byte unchanged — it needed no corrections, only wiring).
4. **Regression guards for KEEP items** (commit `350cefe`). Test-only commit: added a regression assertion in `sales/routes/__tests__/products.test.tsx` locking in that only `CategoryActionsMenu` (⚙️) renders per category row (no inline per-action fabs), and a regression assertion in `statistics/routes/__tests__/statistics-routes.test.tsx` locking in that `SalesChart`/`ProfitChart` (recharts) render alongside KPI/currency/top-products — both are accepted intentional divergences from Angular, ratified by user decision, not reverted.
5. **Docs** (commit `4968519`). Proposal + spec documentation for the bucket.

### Item 3 — PDF Fidelity Note (independently re-verified)

The orphaned port `inventory-today-sale-pdf.ts` was verified column-by-column against Angular's commented-out `generateReport()` (`inventory-today-sale.component.ts:44-99`) and found to be a **faithful 1:1** port requiring zero corrections:

- 13 headers (Producto…Importe Final) — verbatim.
- `ENCABEZADO` 4-line header block + `TITLE` positioned at `(300,100)` — verbatim.
- Row shape / column-2 `unit` = literal `'U'` — matches Angular line 212 exactly.
- `toFixed(2)` applied on columns 7-11 and 13 — matches.
- `autoTable` styling (fontSize 8, cellPadding 3, `fillColor [220,220,220]`, margins top120/left40/right40, `didDrawPage` redraw on page > 1) — matches.
- `jsPDF` landscape/pt/letter document, blob + `window.open` (no filename/save prompt) — matches.

The only real gap was the **row source**, not the PDF itself: `today-report`'s existing `computeTodayReport` builds a different (non-13-column) shape, so `generateProductRows()` had to be ported separately (`reports/lib/pdf/generate-product-rows.ts`) to feed the pre-existing PDF generator. This aggregator was Strict-TDD'd with 5 test cases (ROW-01 full aggregation, ROW-02 zero sales, ROW-03 zero stock, ROW-04 failed envelopes, ROW-05 multi-product no dropped rows) covering the edge cases explicitly called out in the spec (no divide-by-zero, no dropped rows).

## Final Gate Results

| Gate | Result |
|------|--------|
| `pnpm test` (full `web-store-pos` suite) | **1993/1993 tests passed**, 130/130 files, 0 failed |
| `pnpm -C apps/web-store-pos exec tsc --noEmit` | Clean — zero errors, zero output |
| `pnpm -C apps/web-store-pos build` | Clean build (client + SSR-disabled SPA + PWA service-worker, 113 precache entries) |
| `sdd-verify` | PASS — 0 CRITICAL, 0 WARNING |
| Independent parity-review vs Angular source | CLEAN — item-3 PDF fidelity independently verified column-by-column, no follow-up fixes required |
| Scope integrity | Confirmed via `git diff --stat` — `AdminStoreListPage`, `inventory-today-sale-pdf.ts`, `category-actions-menu.tsx`, `statistics/routes/dashboard.tsx`, and all `*/auth/*` paths are byte-for-byte unchanged; the auth decorative-shell item correctly was NOT implemented |

## Archive Contents

- proposal.md ✅
- specs/presentation-parity-bucket-b/spec.md ✅ (delta, as originally authored — audit trail)
- tasks.md ✅ (19/19 tasks across 5 work units, all complete)
- verify-report.md ✅ (PASS, 0 CRITICAL/0 WARNING, reconstructed verbatim from source artifact)
- archive-report.md ✅ (this file)

No `design.md` or `apply-progress.md` were produced for this change — consistent with this project's convention for mechanical presentation-parity changes (no architecture decisions; `tasks.md`'s inline DONE/commit annotations serve as the apply-progress record).

## Known Non-Blocking Follow-ups

- None. This is the first bucket in the presentation-parity-audit series to close with 0 CRITICAL AND 0 WARNING on first verify pass, plus a CLEAN independent parity-review requiring no follow-up rounds.
- The fab-variant CSS-class-coupling pattern (`toHaveClass('rounded-full')`) noted in prior bucket-c/e verify reports recurs at `owner-edit.test.tsx:267` for the pre-existing submit fab, but that assertion is unchanged carry-over code from before this bucket — not a new issue introduced here, and not re-flagged as blocking.

## Scope Note — Auth Decorative Shell CUT

An auth decorative-shell treatment was originally under consideration for inclusion in this bucket but was **explicitly cut from scope mid-change by user decision** before implementation began. It does not appear in the final proposal's In-Scope list, and its exclusion was independently confirmed by both `sdd-verify` and the adversarial parity-review via an empty `git diff` against all `*/auth/*` paths across the full commit range. No follow-up action is implied — this was a deliberate scope decision, not a deferred item.

## SDD Cycle Complete

The change has been fully planned, implemented, verified (`sdd-verify` PASS, 0 CRITICAL/0 WARNING), independently parity-reviewed against Angular source (CLEAN, no follow-up rounds needed, PDF fidelity re-verified column-by-column), and archived. This closes Bucket B of the Angular→React presentation-parity audit (Buckets C and E already archived).

## Filesystem Note (orchestrator action required)

This archive sub-agent has no filesystem delete/move capability (no Bash tool in this execution context) and did NOT run `git commit`. All source artifacts (`proposal.md`, `specs/presentation-parity-bucket-b/spec.md`, `tasks.md`, `verify-report.md`) were **copied** (via Write) into
`openspec/changes/archive/2026-07-22-presentation-parity-bucket-b/`, alongside this `archive-report.md`. The canonical spec was also written to `openspec/specs/presentation-parity-bucket-b/spec.md`.

The orchestrator MUST:
1. `git rm -r openspec/changes/presentation-parity-bucket-b/` (delete the original, now-duplicated source folder — it still exists on disk untouched by this sub-agent).
2. `git add openspec/changes/archive/2026-07-22-presentation-parity-bucket-b/ openspec/specs/presentation-parity-bucket-b/spec.md`.
3. Commit the archive as its own commit (e.g. `docs(sdd): archive presentation-parity-bucket-b`).
