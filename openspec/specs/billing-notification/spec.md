# billing-notification Capability Specification

**Capability**: billing-notification — in-app payment status banner
**Origin**: SDD change `store-paid-plan-billing-frontend`
**Status**: Active
**Last Updated**: 2026-07-27

## Purpose

Define the visibility and content rules for `PaymentBanner`, the read-only in-app notice that
projects the backend-computed per-store paid-plan billing state (`paymentStatus`, `isInTrial`,
`paymentDueDate`) onto the authenticated user's shell. This is NEW feature work — there is no
Angular source to mirror. Enforcement (module gating when overdue) stays entirely backend-side;
the frontend only renders a notice.

## Capability Scope

### In Scope
- `PaymentBanner` mount point and visibility matrix driven by `useAuthStore().user.paymentStatus`/`isInTrial`.
- Neutral Latin American Spanish copy, no voseo.
- Date-only formatting of `paymentDueDate` (no timezone-dependent `Date`/`Intl` parsing — see
  the shared `formatDateOnly` helper, `app/shared/lib/date-utils.ts`).

### Out of Scope
- Any client-side entitlement or billing math — `paymentStatus`/`paymentDueDate` are computed
  server-side; the client only branches on them.
- Sidebar/menu entries — deep links suffice.
- Scheduled jobs, email/push notifications — in-app banner only.

## Requirements

### Requirement: Payment Status Banner Visibility Matrix

`PaymentBanner` MUST render in `app-layout.tsx` (between `<Navbar/>` and `<Breadcrumbs/>`),
based on `useAuthStore().user.paymentStatus`/`isInTrial`, in neutral Latin American Spanish
(no voseo):

| paymentStatus | isInTrial | Banner shown |
|---|---|---|
| `NoAplica` / missing | any | hidden |
| `AlDia` | any | hidden |
| `PorVencer` / `EnGracia` | `true` | trial notice (with due date) |
| `PorVencer` / `EnGracia` | `false` | due notice (with due date) |
| `Vencido` | any | overdue notice |

`Vencido` is evaluated first (overdue outranks trial). A missing `paymentStatus` on the user
object (stale/pre-backend payload) defaults to `'NoAplica'` at the point of consumption
(`user?.paymentStatus ?? 'NoAplica'`) — see `auth-http` capability S6 for the transport contract.

#### Scenario: Hidden for NoAplica or AlDia
- GIVEN `paymentStatus` is `'NoAplica'`, `'AlDia'`, or missing (undefined)
- WHEN `PaymentBanner` renders
- THEN nothing renders

#### Scenario: Trial notice
- GIVEN `paymentStatus` is `'PorVencer'` (or `'EnGracia'`) and `isInTrial` is `true`
- WHEN `PaymentBanner` renders
- THEN the trial notice renders with the formatted `paymentDueDate`

#### Scenario: Due notice
- GIVEN `paymentStatus` is `'PorVencer'` (or `'EnGracia'`) and `isInTrial` is `false`
- WHEN `PaymentBanner` renders
- THEN the due notice renders with the formatted `paymentDueDate`

#### Scenario: Overdue notice
- GIVEN `paymentStatus` is `'Vencido'`
- WHEN `PaymentBanner` renders
- THEN the overdue notice renders, regardless of `isInTrial`

## Verification Criteria

- [x] Banner mounted in `app-layout.tsx` between `<Navbar/>` and `<Breadcrumbs/>`.
- [x] All 5 visibility-matrix scenarios covered by `payment-banner.test.tsx` (10 tests, incl.
      selector-aware `useAuthStore` mock).
- [x] `paymentDueDate` formatted via the shared timezone-independent `formatDateOnly` helper
      (root-cause fix, commit `3e36fbf` — see `verify-report` for the empirical TZ-independence
      proof); no local `formatDueDate` duplicate remains (`rg formatDueDate` returns 0 matches
      outside `date-utils.ts`).
- [x] Copy is neutral Latin American Spanish, no voseo (`BILLING.TRIAL_NOTICE` /
      `BILLING.DUE_NOTICE` / `BILLING.OVERDUE_NOTICE` in `es.ts`).
- [x] Full suite (140 files / 2079 tests), `tsc --noEmit`, and build all pass.

## Related Specifications

- **auth-http** (S6 — `getMe()` billing fields raw passthrough; the source of the fields this
  banner reads).
- **management-stores** (`PlanPicker` read-only lock — the companion enforcement-adjacent UI
  change in the same SDD change).
- **billing-collections** — the super admin / ReSeller-facing counterpart (collections and
  commission views).

## Implementation Status

- **`PaymentBanner` component**: ✓ Done (`app/shared/components/payment-banner.tsx`)
- **Mount in `app-layout.tsx`**: ✓ Done
- **i18n (`BILLING.*` notice keys)**: ✓ Done (`app/shared/lib/i18n/es.ts`)
- **Timezone-independent date formatting root-cause fix**: ✓ Done (commit `3e36fbf`, applied
  post-verify, re-verified PASS)
- **Tests**: ✓ Done (19/19 relevant tests pass; full suite 2079/2079)
- **Verification**: ✓ Done (`sdd-verify`, verdict PASS WITH WARNINGS — 0 CRITICAL / 1 WARNING
  unrelated to this capability / 2 SUGGESTION)

## Notes

- NEW feature work — no Angular source exists; not a parity migration.
- Manual/e2e validation against a live backend is DEFERRED: the backend companion plan
  (`StorePaymentsController` and the `getMe` billing fields) had not landed as of this change's
  archival. No task in this change depended on it; the frontend is a strict-TDD, mock-driven,
  read-only projection.
