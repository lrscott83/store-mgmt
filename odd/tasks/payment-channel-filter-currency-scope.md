# Payment channel filter: scope to the selected currency, drop the currency suffix

## Objective

When the MultiMonedas module is active, the payment-channel radio filters in
`sales/today-orders`, `sales/orders` and `expenses/expenses` must:

1. Render the channel WITHOUT the currency suffix — "Transferencia", not
   "Transferencia (CUP)".
2. Re-derive the channel list whenever the currency filter changes, so the
   offered channels are the ones present in that currency.

## Problem

Requirement 2 does not hold today. In all three views the channel options are
computed from a set that is NOT currency-filtered, and independently of the
currency filter:

- `today-orders.tsx:82` — `collectOrderPaymentMethodKeys(orders)`
- `orders.tsx:326` — `collectOrderPaymentMethodKeys(baseOrders.filter(rangeFilter))`
- `orders.tsx:563` — `collectOrderPaymentMethodKeys(allOrders)`
- `expenses-history.tsx:206` — `collectExpensePaymentMethodKeys(baseExpenses)`
- `expenses-history.tsx:372` — `collectExpensePaymentMethodKeys(allExpenses)`

The two filters never read each other, so changing the currency leaves the
channel list untouched.

The two requirements are coupled, not independent. Dropping the suffix while
the channel list still spans every currency produces two identical "Transferencia"
radios for expenses (`transferencia-0` and `transferencia-1` both rendering the
same text). Scoping the list to the selected currency is what makes the
suffix-free label unambiguous — at most one Transferencia is offered at a time.

Extra constraint found while exploring: `orderToKey`
(`payment-filter-options.ts:49-51`) normalizes EVERY Transferencia order to
`transferencia-0` regardless of its real currency (T9). Sales therefore only
ever produce one Transferencia key, and the "CUP" in its label is a
normalization artifact, not the order's currency. The orders views work
correctly under the new rule because `matchesOrderPaymentFilter` normalizes
identically, so key generation and key matching stay symmetric.

## Decision (Owner, 2026-09-29)

The channel list stays **data-driven**: it offers only the channels actually
present in the rows of the selected currency, per the existing contract in
`payment-filter-options.ts:9-10`. It is NOT derived from the static
`paymentMethodOptionsForCurrency` catalogue, so a channel with no rows in the
selected currency is simply not offered.

## Scope

In scope:

- `frontend-react/apps/web-store-pos/app/shared/lib/payment-filter-options.ts`
- `frontend-react/apps/web-store-pos/app/sales/routes/today-orders.tsx`
- `frontend-react/apps/web-store-pos/app/sales/routes/orders.tsx`
- `frontend-react/apps/web-store-pos/app/expenses/routes/expenses-history.tsx`
- New unit tests covering the new behavior.

Out of scope / NOT touched:

- `salePaymentMethodLabel` in `@store-mgmt/domain` — 15 callers, and
  `shared/lib/payment-methods/channel-label.ts:11-18` documents that it is
  deliberately NOT modified. The suffix-free label lives in the app's
  `paymentMethodKeyToLabel` instead.
- `channelLabel` (`channel-label.ts`) — always appends the currency by design;
  used by channel-rates, configurations and the breakdowns, not by these
  filters.
- `orderToKey` T9 normalization — kept as is.
- The `frontend/` Angular tree (frozen) and every existing E2E test.

## Constraints

- Existing `paymentMethodKeyToLabel(key)` single-argument calls must keep
  returning the currency suffix; the new parameter is optional and defaults to
  `true` so `shared/lib/__tests__/payment-filter-options.test.ts` stays green
  untouched.
- `today-orders.tsx` must break a circular dependency: today its
  `currencyOptions` is derived from the payment-filtered set (line 91-93),
  which would invert once the channels depend on the currency. `currencyOptions`
  therefore moves to the unfiltered base `orders`, matching what
  `orders.tsx:213` and `expenses-history.tsx:157` already do.
- The channel list must NOT be payment-filtered (otherwise selecting a channel
  collapses the list); the currency filter is applied to the rows on top, as today.
- Self-healing already exists and is the mechanism for requirement 2:
  `paymentKey !== null && paymentOptions.includes(paymentKey) ? paymentKey : null`
  resets to "Todas" when the selected channel is absent from the new currency.
- No i18n key changes: the suffix-free label is derived from the existing label.

## Checklist

- [x] T1 — `paymentMethodKeyToLabel(key, withCurrency = true)` returns
      "Transferencia" when `withCurrency` is false; "Efectivo"/"Zelle" unchanged.
- [x] T2 — `today-orders.tsx`: `currencyOptions` from the unfiltered base;
      `paymentOptions` scoped to the selected currency; label drops the suffix
      when `multiMonedas`.
- [x] T3 — `orders.tsx`: both branches (multi-store `:326`, single-store `:563`)
      scope `paymentOptions` to the selected currency; both label sites (`:370`,
      `:629`) drop the suffix when `multiMonedas`.
- [x] T4 — `expenses-history.tsx`: both branches (`:206`, `:372`) scope
      `paymentOptions`; both label sites (`:285`, `:444`) drop the suffix.
- [x] T5 — New tests: suffix-free label with the module, channel list re-derived
      on currency change, and no behavior change without the module.
- [x] T6 — Verify: `pnpm test`, `pnpm typecheck`, `pnpm lint`.

## Route

Delegated direct is unavailable in this session (the `subagent` tool fails with
"OpenCode's free tier can only be used from within OpenCode"), so the mapping and
the edits are done inline with CodeGraph. Disclosed rather than silently skipped.

## Authorized scope

Frontend React only. Adding NEW unit tests is allowed. No existing test is
modified or weakened. No backend change. No E2E change.

## Acceptance criteria

- With MultiMonedas active, the channel filters in the three views render
  "Transferencia" with no currency suffix.
- Changing the currency re-derives the channel list to that currency's rows.
- Without MultiMonedas, both views behave exactly as before (suffix kept, list
  unfiltered by currency).
- No existing test changes result.

## Applicable checks

`pnpm test`, `pnpm typecheck`, `pnpm lint` from `frontend-react/`.

## Progress

All six tasks complete and verified.

### Verification evidence

- **RED observed, not assumed.** The production files
  (`expenses-history.tsx`, `payment-filter-options.ts`) were stashed and the new
  tests re-run against the OLD code: **3 failed / 21 passed**. Two failed with
  `Unable to find an accessible element with the role "radio" and name
  "Transferencia"`, one with `expected 'Transferencia (CUP)' to be
  'Transferencia'`. The 21 pre-existing tests in those two files stayed green,
  and the new gate-OFF regression test passed against the old code too — correct,
  since it guards unchanged behavior rather than new behavior.
- **GREEN after restore**: both files 24/24.
- **Full frontend suite**: `Test Files 329 passed (329)`,
  `Tests 4825 passed (4825)`, `Type Errors no errors` — exactly +4 against the
  4821 baseline (3 view tests + 1 helper test).
- `pnpm typecheck`: 5 successful / 5 total.
- `pnpm lint`: 4 successful / 4 total.

### Notes for the next reader

- The forced change in `today-orders.tsx` is intentional: its `currencyOptions`
  used to come from the payment-filtered set, which becomes circular once the
  channels depend on the currency. It now comes from the unfiltered base, which
  also matches what `orders.tsx` and `expenses-history.tsx` already did.
- `orderToKey` (T9) still normalizes every order Transferencia to
  `transferencia-0`. That is why the sales filters never show a second
  Transferencia for USD, and why the suffix-free label is unambiguous there
  without touching the normalization.

## Next step

Committed as a single work unit. Push is the owner's decision.
