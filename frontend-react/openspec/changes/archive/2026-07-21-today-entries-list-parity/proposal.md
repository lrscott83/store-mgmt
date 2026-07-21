# Proposal: Today Entries List Parity

## Intent

The React "Entradas del día" (today's inventory entries) screen DIVERGES from
the Angular source of truth. User-reported: the React screen shows labeled cards
grouped by product name with fields "Precio de costo", "Cantidad" and an extra
"Fecha" field, plus two inline pill buttons (Editar/Eliminar). Angular renders
COMPACT TABLE ROWS (`productName | quantity | costPrice(green, owner-admin only)
| gear menu`) with NO date column and NO product grouping. Migration parity is a
hard project rule: React must mirror Angular code exactly.

## Scope

### In Scope
- Rewire `today-entries.tsx` to use the already-correct `EntryList` component
  (`<EntryList entries onEdit onDeactivate readOnly={false} isOwnerAdmin />`).
- Delete the now-dead `inventory-daily-entries.tsx` (React invention with no
  Angular correlate) and its test file.

### Out of Scope
- Any change to `EntryList` itself — already at parity (parity review confirms).
- The history screen `entries.tsx` (already correctly wired to `EntryList`).
- Delete/edit business logic, the "+ Entrada" create-modal button, and data
  fetching in `today-entries.tsx` — all stay untouched.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None. Pure component rewire + dead-code removal; no spec-level requirement
  change (both screens already specified around `EntryList` parity behavior).

## Approach

Root cause: the Angular-parity component ALREADY EXISTS in React (`EntryList`,
compact row + shared `ActionMenu` gear, gated `isOwnerAdmin` for cost price and
`isOwnerAdmin && !readOnly` for the gear). The today screen was simply wired to
the WRONG component. Fix = one-line component swap (callback names already
match), then remove `InventoryDailyEntries` as dead code per rule "migration
invents nothing new".

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web-store-pos/app/inventory/routes/today-entries.tsx` | Modified | Swap `InventoryDailyEntries` for `EntryList` |
| `apps/web-store-pos/app/inventory/components/inventory-daily-entries.tsx` | Removed | Dead React invention, no Angular correlate |
| `apps/web-store-pos/app/inventory/components/inventory-daily-entries.test.tsx` | Removed | Test for deleted component |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `EntryList` not truly 1:1 with Angular `entry-list.component` | Low | Parity review vs Angular source confirms before apply |
| `InventoryDailyEntries` has other importers | Low | Grep confirmed only `today-entries.tsx` imports it; re-grep before deletion |
| Breaking create-modal / data-fetch in today screen | Low | Scope limited to list component; leave button + fetch untouched |

## Rollback Plan

Single-commit change: `git revert` restores the `InventoryDailyEntries` wiring
and files. No data or schema impact.

## Dependencies

- None. `EntryList` and `ActionMenu` already exist and are in use.

## Success Criteria

- [x] `today-entries.tsx` renders `EntryList` (compact rows + gear menu, no date).
- [x] `inventory-daily-entries.tsx` + its test are deleted; no dangling imports.
- [x] `pnpm test` passes (Strict TDD).
- [x] Parity review confirms today screen matches Angular `today-entries` + `entry-list`.
