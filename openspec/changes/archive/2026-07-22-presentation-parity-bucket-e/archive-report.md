# Archive Report — presentation-parity-bucket-e (2026-07-22)

**Change**: presentation-parity-bucket-e
**Mode**: openspec (file-based)
**Branch**: `feat/presentation-parity-bucket-e`, 7 commits (5 WU commits + verification), not yet merged/pushed
**Verify verdict**: PASS WITH WARNINGS (0 CRITICAL — the one WARNING is the same Strict-TDD documentation-format gap already noted in bucket-c's verify report; functional evidence substitutes for it)
**Independent adversarial code-only parity review vs Angular source**: CLEAN

## Spec Sync

`openspec/specs/presentation-parity-bucket-e/spec.md` did not exist prior to this change — this is a standalone presentation-parity domain (same precedent as `presentation-parity-bucket-c`). The delta spec graduates to the canonical spec verbatim (no post-review corrections were needed — unlike bucket-c, the parity-review round returned CLEAN on first pass, no follow-up fixes required):

- 6 requirements carried over unchanged: payment-method icon (Cuadre del día Gastos row), payment-method icon (Gastos-history radio filter, "Todas" excluded), admin dashboard range-button active state, owner "Gestor" field position parity (create first / edit third), owner card price·stores label order ("$X en N tiendas", pluralization preserved), inventory Disponible row cleanup (inline quantity, no redundant nodes).

The delta spec is preserved verbatim in the archived change folder's `specs/presentation-parity-bucket-e/spec.md` for audit-trail purposes; the canonical spec at `openspec/specs/presentation-parity-bucket-e/spec.md` is an identical copy and is now the source of truth for this domain.

## Delivered

Mechanical Angular→React presentation parity, 7 files under
`frontend-react/apps/web-store-pos/app/{sales,expenses,admin/dashboard,admin/owners,inventory}/`
(plus paired `__tests__` files) — 5 cosmetic fixes:

1. **WU1 — Payment-method icon before Gastos total** (commit `3b3010a`). Reused `PaymentMethodIcon` + `getPaymentTypeIconKind` (already wired in `expense-list.tsx`) in two places: `sales/routes/today-stats.tsx` (Cuadre del día Gastos rows) and `expenses/routes/expenses-history.tsx` (Gastos-history radio filter, icon only for non-null payment types — "Todas" stays icon-less).
2. **WU2 — Admin dashboard range-button active state** (commit `cff8b6e`). Bound `viewType === '7days'` / `'30days'` to an active class/`aria-pressed` on the two range buttons in `admin/dashboard/routes/dashboard.tsx`. `statistics/routes/dashboard.tsx` (the unrelated currency-toggle dashboard) confirmed untouched.
3. **WU3 — Owner "Gestor" field reorder** (commit `b1f17da`). Pure JSX relocation, no state/handler changes: `owner-create.tsx` now renders the `isSuperAdmin` reSeller select FIRST (before Full Name); `owner-edit.tsx` renders it THIRD (after Full Name, before the `isActive` toggle) — matching Angular's `create-owner`/`edit-owner-details` templates exactly.
4. **WU4 — Owner card price·stores label order** (commit `e5c86ad`). `owner-card-list.tsx` now renders `"{price} en {store-count-label}"` (price first, "en" connective, em-dash removed), matching `owners.component.html:70`, while explicitly KEEPING React's correct pluralization (`OWNER.STORE_PRICE_LABEL`) instead of replicating Angular's always-singular bug (`OWNER.STORE_SINGLE_PRICE`) — a deliberate, spec-mandated divergence, not a defect.
5. **WU5 — Inventory Disponible row cleanup** (commit `77099d2`). `inventory-product-list.tsx` now renders `"{productName} ({totalAvailable})"` inline next to the name; removed the redundant `categoryName` sub-label and the standalone "Disponible" stat block, matching `inventory-product-list.component.html:12-29`. Updated 4 pre-existing tests that asserted the old bare-name text.

### Item 4 — formatUSD Decision (documented deviation)

Task 4.2 originally planned to use `intl.formatNumber(totalPrice, { style: 'currency', currency: 'USD' })`. Under the app's `es` `IntlProvider` locale this renders `"100,00 US$"` (comma decimal, suffixed symbol) — not the literal `"$100.00"` the spec and Angular's un-localized `| currency` pipe require (Angular has no `LOCALE_ID` override, so its currency pipe renders en-US-style regardless of app language). Root-caused via a live probe of `intl.formatNumber` output under the test's `IntlProvider`, then resolved by introducing a local `formatUSD` helper (`new Intl.NumberFormat('en-US', {...})`), mirroring the existing precedent already established in `management/stores/components/module-picker.tsx`. This is a locale-formatting fix, not a scope change — same requirement, correct implementation path.

## Final Gate Results

| Gate | Result |
|------|--------|
| `pnpm test` (full `web-store-pos` suite) | **1978/1978 tests passed**, 129/129 files, 0 failed |
| `pnpm -C apps/web-store-pos exec tsc --noEmit` | Clean — zero errors, zero output |
| `pnpm -C apps/web-store-pos build` | Clean build (client + PWA precache, 108 entries, SPA mode) |
| `sdd-verify` | PASS WITH WARNINGS — 0 CRITICAL, 1 non-blocking documentation-format WARNING (same as bucket-c) |
| Independent parity-review vs Angular source | CLEAN — no follow-up fixes required (unlike bucket-c, which needed 2 review rounds) |
| Scope integrity | Confirmed via `git diff --stat` — only the 7 proposal-listed files (+ paired tests) changed; `statistics/routes/dashboard.tsx` and Buckets B/C/D empty-diff confirmed |

## Archive Contents

- proposal.md ✅
- specs/presentation-parity-bucket-e/spec.md ✅ (delta, as originally authored — audit trail)
- tasks.md ✅ (21/21 tasks across 6 work units, all complete)
- verify-report.md ✅ (PASS WITH WARNINGS, reconstructed verbatim from source artifact)
- archive-report.md ✅ (this file)

No `design.md` or `apply-progress.md` were produced for this change — consistent with this project's convention for mechanical presentation-parity changes (no architecture decisions; `tasks.md`'s inline DONE/commit annotations serve as the apply-progress record).

## Known Non-Blocking Follow-ups

- Verify report's one WARNING (missing formal "TDD Cycle Evidence" table in apply-progress, per-task RED/GREEN/TRIANGULATE/SAFETY-NET columns) is the same documentation-format gap independently flagged in the bucket-c verify report — functional evidence (RED tests present, all GREEN, full suite green, deviation documented with root-cause investigation) substitutes for it in practice. Non-blocking, not re-litigated here.
- `svg` tag-name assertions (today-stats, expenses-history tests) are a reasonable proxy for "icon rendered" given `PaymentMethodIcon` has no `data-testid` hook — consistent with the pre-existing pattern accepted in the bucket-c report.

## SDD Cycle Complete

The change has been fully planned, implemented, verified (`sdd-verify` PASS WITH WARNINGS, 0 CRITICAL), independently parity-reviewed against Angular source (CLEAN, no follow-up rounds needed), and archived. This closes Bucket E — the final cosmetic cleanup pass of the Angular→React presentation-parity audit (Buckets B/C/D handled separately; Bucket C already archived).

## Filesystem Note (orchestrator action required)

This archive sub-agent has no filesystem delete/move capability (no Bash tool in this execution context) and did NOT run `git commit`. All 3 source artifacts (`proposal.md`, `specs/presentation-parity-bucket-e/spec.md`, `tasks.md`, `verify-report.md`) were **copied** (via Write) into
`openspec/changes/archive/2026-07-22-presentation-parity-bucket-e/`, alongside this `archive-report.md`. The canonical spec was also written to `openspec/specs/presentation-parity-bucket-e/spec.md`.

The orchestrator MUST:
1. `git rm -r openspec/changes/presentation-parity-bucket-e/` (delete the original, now-duplicated source folder — it still exists on disk untouched by this sub-agent).
2. `git add openspec/changes/archive/2026-07-22-presentation-parity-bucket-e/ openspec/specs/presentation-parity-bucket-e/spec.md`.
3. Commit the archive as its own commit (e.g. `docs(sdd): archive presentation-parity-bucket-e`).
