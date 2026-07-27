# billing-collections Capability Specification

**Capability**: billing-collections — super admin / ReSeller collections and commission views
**Origin**: SDD change `store-paid-plan-billing-frontend`
**Status**: Active
**Last Updated**: 2026-07-27

## Purpose

Define the two new routes that let a super admin or ReSeller (1) see which stores owe money and
register manual payments, and (2) see ReSeller commission totals by period. This is NEW feature
work — there is no Angular source to mirror. Both routes are read-only projections of
backend-computed data (`getStoresToCollect`, `getReSellerCommissions`) plus one write action
(`registerStorePayment`); no client-side billing math.

## Capability Scope

### In Scope
- Route gating for `collections` and `reseller-commissions` (`resellerFeatureLoader([EFeatures.Owners])`).
- Collections view: list, formatted amounts, mark-paid action + reload, empty state.
- Reseller commission view: list by `MM/YYYY` period, count, total, empty state.
- Neutral Latin American Spanish copy, no voseo.

### Out of Scope
- Any backend work (endpoints, entitlement gate, migrations, commission math) — backend
  companion plan owns it.
- Payment gateway / online payment; payments are recorded manually via `registerStorePayment`.
- Sidebar/menu entries for the two routes — deep links suffice.

## Requirements

### Requirement: Route Gating is Reseller Feature Loader, Not Admin Feature Loader

The `collections` and `reseller-commissions` routes' `clientLoader` MUST be
`resellerFeatureLoader([EFeatures.Owners])` (verified: `~/auth/routes/loaders.ts`), mirroring
the backend gate `[HasPermission(StoreRoleFeatures.OwnersAdmin)]` on `OwnersController`
(verified: roles `{SuperAdmin, ReSeller}` + feature `Owners`). The routes MUST NOT use
`adminFeatureLoader`, which authorizes `{SuperAdmin, OwnerAdmin}` — it excludes the ReSeller
(who needs the view) and wrongly admits a plain store Owner-Admin (who must not see other
stores' collections/commissions).

#### Scenario: Super admin is granted access unconditionally
- GIVEN the current user has `isSuperAdmin: true`
- WHEN the collections or commissions route loader runs
- THEN access is granted regardless of `featureIds`

#### Scenario: Reseller with the Owners feature is granted access
- GIVEN the current user has `isReSeller: true` and `featureIds` includes `EFeatures.Owners`
- WHEN the route loader runs
- THEN access is granted

#### Scenario: Reseller without the Owners feature is denied
- GIVEN the current user has `isReSeller: true` and `featureIds` does not include `EFeatures.Owners`
- WHEN the route loader runs
- THEN access is denied (redirect to `/login`, mirroring `denyAccess()`)

#### Scenario: Owner-admin is denied regardless of feature grants
- GIVEN the current user has `isOwnerAdmin: true` and `isSuperAdmin: false` and `isReSeller: false`
- WHEN the route loader runs
- THEN access is denied — `resellerFeatureLoader`'s role gate rejects before any feature check

### Requirement: Collections View Lists Stores To Collect

The collections route MUST list stores returned by `getStoresToCollect` (`GET
/v1/stores/to-collect`), one row per store with columns store name, owner, amount, due date,
status; amounts MUST format via `formatCurrency`. Clicking "Registrar pago" MUST call
`registerStorePayment(storeId)` (`POST /v1/stores/{storeId}/payments`) and then reload the
list. An empty result MUST show an empty-state message instead of a table.

#### Scenario: Rows render with formatted amount
- GIVEN `getStoresToCollect` resolves two stores
- WHEN the collections page renders
- THEN both rows show store/owner/due-date/status, with amount formatted via `formatCurrency`

#### Scenario: Mark-paid records the payment and reloads
- GIVEN a rendered row for store `storeId`
- WHEN "Registrar pago" is clicked
- THEN `registerStorePayment(storeId)` is called, and the list reloads afterward

#### Scenario: Empty state
- GIVEN `getStoresToCollect` resolves an empty array
- WHEN the collections page renders
- THEN the empty-state message renders instead of a table

### Requirement: Reseller Commission View Totals By Period

The commissions route MUST list rows from `getReSellerCommissions` (`GET
/v1/stores/reseller-commissions`), one row per period formatted `MM/YYYY`, showing payment
count and total commission via `formatCurrency`. An empty result MUST show an empty-state
message. All copy MUST be neutral Latin American Spanish, no voseo.

#### Scenario: Period rows render
- GIVEN `getReSellerCommissions` resolves `[{year:2026,month:5,paymentCount:2,totalCommission:800}]`
- WHEN the commissions page renders
- THEN a row shows period `05/2026`, count `2`, and total formatted via `formatCurrency`

#### Scenario: Empty state
- GIVEN `getReSellerCommissions` resolves an empty array
- WHEN the commissions page renders
- THEN the empty-state message renders instead of a table

## Verification Criteria

- [x] Both routes gated by `resellerFeatureLoader([EFeatures.Owners])`; `adminFeatureLoader` has
      zero grep matches in either file.
- [x] All 4 gating scenarios covered by wiring-only tests (`vi.resetModules()` + re-import
      technique) plus pre-existing `loaders.test.ts` role/feature coverage.
- [x] Collections: rows, `formatCurrency`, mark-paid → reload, empty state — all covered
      (`collections.test.tsx`, 6/6).
- [x] Commissions: `MM/YYYY` formatting, count, total, empty state — all covered
      (`reseller-commissions.test.tsx`, 6/6, including a 2nd-row triangulation case).
- [x] `paymentDueDate`/due-date column formatted via the shared timezone-independent
      `formatDateOnly` helper (root-cause fix, commit `3e36fbf`); no local `formatDueDate`
      duplicate remains in `collections.tsx`.
- [x] Both routes registered in `routes.ts` inside the `app-layout` block; build emits both as
      separate chunks (`collections-*.js`, `reseller-commissions-*.js`).
- [x] Copy is neutral Latin American Spanish, no voseo (`BILLING.COLLECTIONS.*` /
      `BILLING.COMMISSIONS.*` / `BILLING.STATUS.*` in `es.ts`; `grep`-verified for voseo markers,
      zero matches).
- [x] Full suite (140 files / 2079 tests), `tsc --noEmit`, and build all pass.

## Related Specifications

- **billing-notification** — the owner-facing counterpart (`PaymentBanner`), same source fields.
- **management-stores** (`PlanPicker` read-only lock) — companion enforcement-adjacent UI change.
- **auth-http** (S6) — transport contract for the fields this capability's data ultimately
  derives from (backend-side; these two routes call dedicated `store-http-service` methods, not
  `getMe`).
- **admin-owners-resellers** — the precedent route (`admin/owners/routes/owner-list.tsx`) whose
  gating pattern (`resellerFeatureLoader([EFeatures.Owners])`) this capability mirrors.

## Implementation Status

- **`store-http-service` new methods** (`getStoresToCollect`, `registerStorePayment`,
  `getReSellerCommissions`): ✓ Done — each `return response.data` raw, no mapping
  (`app/management/stores/lib/services/store-http-service.ts`)
- **`collections.tsx` route**: ✓ Done
- **`reseller-commissions.tsx` route**: ✓ Done
- **Route registration** (`routes.ts`): ✓ Done
- **i18n** (`BILLING.COLLECTIONS.*`, `BILLING.COMMISSIONS.*`, `BILLING.STATUS.*`): ✓ Done — both
  blocks landed in the same `es.ts` edit (WU-F commit `c87e23c`); WU-G's own commit message
  (`d8e621b`) self-discloses this attribution, functionally correct and non-colliding (open
  non-blocking WARNING noted in the verify report, unrelated to functionality)
- **Timezone-independent date formatting root-cause fix**: ✓ Done (commit `3e36fbf`, applied
  post-verify, re-verified PASS)
- **Tests**: ✓ Done (12/12 route tests; full suite 2079/2079)
- **Verification**: ✓ Done (`sdd-verify`, verdict PASS WITH WARNINGS — 0 CRITICAL / 1 WARNING
  (i18n commit-attribution, non-blocking) / 2 SUGGESTION)

## Notes

- NEW feature work — no Angular source exists; not a parity migration.
- Manual/e2e validation against a live backend is DEFERRED: the backend companion plan
  (`StorePaymentsController` and its 3 endpoints) had not landed as of this change's archival.
  No task in this change depended on it; both routes are strict-TDD, mock-driven, read-only
  projections plus one mocked write action.
- Open, non-blocking WARNING carried from the verify report: `BILLING.COMMISSIONS.*` i18n keys
  landed in the WU-F commit (`c87e23c`) rather than WU-G (`d8e621b`) — a commit-boundary/
  task-ledger attribution artifact only, functionally correct, self-disclosed, additive
  (no collision risk). Does not block archival.
