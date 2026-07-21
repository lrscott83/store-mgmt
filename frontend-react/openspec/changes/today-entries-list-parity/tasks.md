# Tasks: Today Entries List Parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~250-280 (mostly deletions: dead component + dead tests) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk (default; not specified by orchestrator) |
| Chain strategy | pending (not needed — risk is Low) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full change (RED test → swap → dead-code removal → verification) | PR 1 (single) | Small, atomic, no dependencies |

## ⚠️ Discovery (verified against Angular source, not in proposal) — SUPERSEDED

`EntryList` (`app/inventory/components/entry-list.tsx`) rendered an **unconditional
"Fecha" column** (`INVENTORY.ENTRY.DATE`, always shown, no `isOwnerAdmin` gate).
Angular's real source (`entry-list.component.html`) has **no date column at all**
— columns are only productName | quantity | costPrice(owner-admin) | gear
(owner-admin && !readOnly). This contradicted the proposal's claim that
`EntryList` was "already at parity." Orchestrator scope expansion (verified against
Angular source, supersedes the original proposal/tasks scope below): the Fecha
column IS removed in this change (Phase 3b), since it is a React invention absent
from Angular in both the today-entries and entries (history) screens.

## Phase 1: RED — failing test first

- [x] 1.1 In `apps/web-store-pos/app/inventory/routes/__tests__/inventory-routes.test.tsx`, added a test under the existing `describe('TodayEntriesPage — edit/deactivate actions stay reachable (regression guard)')` asserting: a compact row (name + quantity), the gear `ActionMenu` toggle (`entry-actions-toggle-{id}`) is present, no product-name grouping header, no inline pill buttons, and no "Fecha" text. Confirmed FAILS against `InventoryDailyEntries` (commit f536ec9) before the swap.
- [x] 1.2 Updated the existing test (same block) — it now opens the gear via `fireEvent.click(screen.getByTestId('entry-actions-toggle-e1'))` before asserting `Editar`/`Eliminar`. Also fixed 4 additional call-sites in the `'handleSave/handleDeactivate check .succeeded'` describe block that clicked `getByText('Eliminar')` directly (broke by the same swap) to open the gear first.

## Phase 2: GREEN — component swap

- [x] 2.1 In `apps/web-store-pos/app/inventory/routes/today-entries.tsx`: replaced the `InventoryDailyEntries` import with `import { EntryList } from '../components/entry-list';` and swapped the JSX to `<EntryList entries={entries} onEdit={handleEdit} onDeactivate={handleDeactivate} readOnly={false} isOwnerAdmin={isOwnerAdmin} />`. (commit 56c0e80)
- [x] 2.2 Ran `pnpm test` — 1.1/1.2 pass (Fecha assertion still red at this point, expected — fixed in Phase 3b).

## Phase 3: Cleanup — dead code removal

- [x] 3.1 Re-grepped `InventoryDailyEntries|inventory-daily-entries` repo-wide — confirmed `today-entries.tsx` was the only importer.
- [x] 3.2 Deleted `apps/web-store-pos/app/inventory/components/inventory-daily-entries.tsx`. (commit 1cbf51e)
- [x] 3.3 Deleted the two `describe('InventoryDailyEntries ...')` blocks (smoke render, isOwnerAdmin gating) and the `import { InventoryDailyEntries } from '../inventory-daily-entries'` line inside `inventory-components.test.tsx` — `InventoryProductList`, `EntryList`, and `EditInventoryEntryModal` blocks left untouched. (commit 1cbf51e)

## Phase 3b: Fecha-column removal (scope expansion, orchestrator-verified against Angular source)

- [x] 3b.1 Removed the unconditional `INVENTORY.ENTRY.DATE` header cell and the `toLocaleDateString('es')` body cell from `entry-list.tsx` — row is now `name | quantity | costPrice(owner-admin) | gear`, matching Angular's `entry-list.component.html` exactly (no date column, no product grouping). (commit 3aa4971)
- [x] 3b.2 Grepped `INVENTORY.ENTRY.DATE` repo-wide post-removal — orphaned (only remaining use was inside `inventory-daily-entries.tsx`, itself deleted in Phase 3). Removed the key from `apps/web-store-pos/app/shared/lib/i18n/es.ts` (no separate `en.ts` exists). (commit 1cbf51e)
- [x] 3b.3 `EntryList`'s own tests (`inventory-components.test.tsx`) never asserted a Fecha/date cell — nothing to remove there.
- [x] 3b.4 `entries.tsx` (history screen) unaffected directly — benefits automatically from the Fecha removal in the shared `EntryList` (its own per-day panel header already shows the date, per-row date was redundant).

## Phase 4: Verification

- [x] 4.1 Ran `pnpm test` — full suite green (1866/1866; 5 fewer than before Phase 3, from deleted dead tests).
- [x] 4.2 Ran `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean, no dangling references.
- [x] 4.3 Ran `pnpm -C apps/web-store-pos build` — build succeeds.
- [x] 4.4 Parity check: `today-entries.tsx` now renders `EntryList` identically to `entries.tsx`'s usage (aside from `readOnly={false}` vs `readOnly` — Angular parity, `today-entries.component.html:24` vs `entries.component.html:46`).
