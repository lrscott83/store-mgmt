# Proposal: sidebar-menu-parity

## Intent

**Problem.** The React sidebar shows fewer navigation items than the Angular source
and carries one group Angular does not have. The exploration audit (topic
`sdd/sidebar-menu-parity/explore`) confirmed 4 Angular sidebar links are missing from
React's `MENU_GROUPS`, and React has an extra `MENU.PROFILE` sidebar group that Angular
never had (Angular exposes profile only via the navbar dropdown, which React already
replicates).

**Why now.** This is the last known sidebar-parity gap in the Angular→React migration.
Every route, page, `featureLoader` guard, and i18n key for the 4 missing links is
already built — the entire defect is menu-link wiring (bucket A). Closing it removes a
visible, low-risk divergence with essentially one production file touched.

**Success looks like.** React's sidebar renders the same items in the same order as
Angular, gated by the same features, with no extra sidebar group.

## Scope (in-scope)

Single production file: `frontend-react/apps/web-store-pos/app/shared/lib/config/menu-config.ts`.

Exactly 5 edits:

1. **SALES group — insert `TODAY_CREDITS`** after `TODAY_ORDERS`:
   `{ label: 'MENU.TODAY_CREDITS', path: '/sales/today-credits', featureIds: [EFeatures.CreditSale], moduleId: EModules.Sales }`
2. **SALES group — insert `CREDITS_HISTORY`** after `TODAY_STATS`:
   `{ label: 'MENU.CREDITS_HISTORY', path: '/sales/credits', featureIds: [EFeatures.CreditSale], moduleId: EModules.Sales }`
3. **SALES group — insert `ORDERS_HISTORY`** after `CREDITS_HISTORY` (last in SALES):
   `{ label: 'MENU.ORDERS_HISTORY', path: '/sales/orders', featureIds: [EFeatures.SalesHistory], moduleId: EModules.Sales }`
   Resulting SALES order: PRODUCTS, SALE, TODAY_ORDERS, TODAY_CREDITS, TODAY_STATS, CREDITS_HISTORY, ORDERS_HISTORY.
4. **INVENTORY group — append `ENTRIES_HISTORY`** after `EGRESS` (last in INVENTORY):
   `{ label: 'MENU.ENTRIES_HISTORY', path: '/inventory/entries', featureIds: [EFeatures.EntriesHistory], moduleId: EModules.Inventory }`
5. **Remove the `MENU.PROFILE` group entirely** (current lines ~89–95): both `EDIT_PROFILE`
   and `CHANGE_PASSWORD` items and their group wrapper. Angular has no Profile sidebar
   group; profile lives only in the navbar dropdown, already replicated in `navbar.tsx`.

`moduleId` on each new row mirrors its sibling rows' group `moduleId` (Sales / Inventory).
Per the audit, `moduleId` is decorative (truthiness-only, never gated against
`storeModuleIds`) in both apps — keep it consistent, do not add any gating on it.

Test file to update: `app/shared/components/__tests__/sidebar.test.tsx` (exists) — add
coverage for the 4 new items' presence + feature-gating, and for absence of the Profile
group from the sidebar.

## Non-goals (out-of-scope)

- **Route-guard-layer divergence.** Angular `AuthGuard.isUserAuthorized` grants on
  `isOwnerAdmin` alone, while React `featureLoader` uses the sidebar `isUserAuthorized`
  algorithm. This is a pre-existing, separate divergence flagged for a future
  `route-guard-parity` SDD. Do **not** touch `loaders.ts` or any auth guard.
- **Commented-out / dead Angular menu items** (`inventory_stats`,
  `synchronization_download`, `management_profile`). Angular does not render them, so
  React must not either. No action.
- **No new views, routes, or i18n strings.** The audit found zero unmigrated views;
  all routes, pages, loaders, and `MENU.*` i18n keys for the 4 links already exist.
- No changes to sidebar filtering logic (`sidebar.tsx` / `authorization-service.ts`) —
  gating is already 1:1 parity.

## Affected files

| File | Change |
|------|--------|
| `app/shared/lib/config/menu-config.ts` | 4 rows added, `MENU.PROFILE` group removed |
| `app/shared/components/__tests__/sidebar.test.tsx` | new coverage for 4 items + Profile-group absence |

## Approach & rationale

Pure data change to a config array plus test coverage. Rationale: migration = strict
parity with Angular, not improvement. The 4 additions and the ordering fix are applied
atomically so no intermediate ordering defect is introduced. The Profile group removal
is deliberate parity cleanup (user-confirmed), not a UX regression — profile access is
preserved via the navbar dropdown.

## Risks

- **Ordering must match Angular exactly.** The 3 SALES insertions interleave with
  existing rows (TODAY_CREDITS between TODAY_ORDERS and TODAY_STATS), so position matters;
  must be applied atomically with the additions. Mitigation: spec/test pins the exact
  final order.
- **Removing the Profile sidebar group is product-visible.** Users lose the sidebar
  Profile links, but retain navbar-dropdown access. User-confirmed; acceptable per strict
  parity.
- **Low overall risk:** one production file, all downstream dependencies already built.

## Acceptance criteria

1. Sidebar renders `TODAY_CREDITS`, `CREDITS_HISTORY`, `ORDERS_HISTORY`, and
   `ENTRIES_HISTORY`, each gated by its feature (`CreditSale`, `CreditSale`,
   `SalesHistory`, `EntriesHistory` respectively).
2. SALES group order is PRODUCTS, SALE, TODAY_ORDERS, TODAY_CREDITS, TODAY_STATS,
   CREDITS_HISTORY, ORDERS_HISTORY; ENTRIES_HISTORY is last in INVENTORY.
3. The `MENU.PROFILE` sidebar group is gone; profile remains reachable via the navbar
   dropdown only.
4. The 23 previously-existing sidebar items are unchanged (labels, paths, features).
5. All existing sidebar tests pass; new tests cover presence + gating of the 4 items and
   absence of the Profile group. `pnpm test` green; `pnpm -C apps/web-store-pos exec tsc
   --noEmit` clean.
