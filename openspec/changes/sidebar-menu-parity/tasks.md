# Tasks: sidebar-menu-parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~40-60 (1 config file: +4 rows/-6 lines; 1 test file: +~35 lines) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single commit/PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Sidebar parity fix (tests + config edit) | single PR | One production file + its test file, no dependents |

## Phase 1: RED — Failing Tests First

- [x] 1.1 In `app/shared/components/__tests__/sidebar.test.tsx`, add a SuperAdmin test asserting SALES group renders `Créditos del día`, `Créditos`, and `Ventas` (order: Products, Vender, Ventas del día, Créditos del día, Cuadre del día, Créditos, Ventas).
- [x] 1.2 Add a StoreUser test: user with `CreditSale` only sees "Créditos del día" and "Créditos"; user without `CreditSale` sees neither (per spec Scenario "User without CreditSale").
- [x] 1.3 Add a StoreUser test: user with `SalesHistory` sees "Ventas"; without it, absent.
- [x] 1.4 Add a SuperAdmin test asserting INVENTORY group includes "Entradas/historial" after "Salida", full 6-item order intact.
- [x] 1.5 Add a StoreUser test: user without `EntriesHistory` does not see "Entradas/historial"; other 5 INVENTORY items unaffected.
- [x] 1.6 Add a test (any user) asserting no element with text matching Profile-group labels (`MENU.EDIT_PROFILE`/`MENU.CHANGE_PASSWORD` i18n strings) and no link to `/profile/edit` or `/profile/change-password` renders in the sidebar.
- [x] 1.7 Run `pnpm test` scoped to `sidebar.test.tsx` — confirm new assertions FAIL (items/removal not yet implemented) and existing tests still pass.

## Phase 2: GREEN — Implement menu-config.ts

- [x] 2.1 In `frontend-react/apps/web-store-pos/app/shared/lib/config/menu-config.ts` SALES group: insert `{ label: 'MENU.TODAY_CREDITS', path: '/sales/today-credits', featureIds: [EFeatures.CreditSale], moduleId: EModules.Sales }` immediately after TODAY_ORDERS.
- [x] 2.2 In the same SALES group: insert `{ label: 'MENU.CREDITS_HISTORY', path: '/sales/credits', featureIds: [EFeatures.CreditSale], moduleId: EModules.Sales }` immediately after TODAY_STATS.
- [x] 2.3 In the same SALES group: append `{ label: 'MENU.ORDERS_HISTORY', path: '/sales/orders', featureIds: [EFeatures.SalesHistory], moduleId: EModules.Sales }` as the last SALES item.
- [x] 2.4 In INVENTORY group: append `{ label: 'MENU.ENTRIES_HISTORY', path: '/inventory/entries', featureIds: [EFeatures.EntriesHistory], moduleId: EModules.Inventory }` immediately after EGRESS.
- [x] 2.5 Remove the entire `MENU.PROFILE` group object (groupLabel + EDIT_PROFILE + CHANGE_PASSWORD items) from `MENU_GROUPS`.
- [x] 2.6 Run `pnpm test` scoped to `sidebar.test.tsx` — confirm all tests (new + existing) PASS.

## Phase 3: Verification

- [x] 3.1 Run `pnpm -C apps/web-store-pos exec tsc --noEmit` — confirm no type errors (removed Profile group must not break any other reference to `EFeatures.Profile` or `/profile/*` menu paths).
- [x] 3.2 Run full `pnpm test` suite — confirm no regressions outside sidebar tests.
- [x] 3.3 Run `pnpm -C apps/web-store-pos build` — confirm production build succeeds.
- [x] 3.4 Grep the codebase for any other reference to the removed `MENU.PROFILE` menu-config group (e.g. docs, other tests) and confirm none remain stale; navbar dropdown profile links are out of scope and must stay untouched.
