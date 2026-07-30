# Explore: react-hooks-lint-enablement

Date: 2026-07-29
Change: `react-hooks-lint-enablement`
Artifact store: hybrid (this file + engram `sdd/react-hooks-lint-enablement/explore`)

## Root cause

`eslint-plugin-react-hooks` was **never registered** in
`frontend-react/packages/eslint-config/{base.config.js,react-router.config.js}`, despite
being a declared devDependency of `@store-mgmt/eslint-config`. The hook rules were never
evaluated in this repo.

The 21 "exhaustive-deps warnings" seen when lint was first enabled were not dependency
warnings at all — they were `Definition for rule 'react-hooks/exhaustive-deps' was not
found`, fired at the `eslint-disable` comments that referenced a rule ESLint did not know.

With the plugin registered (working-tree change to `react-router.config.js`), the real
output is:

| Result | Count |
| --- | --- |
| `react-hooks/rules-of-hooks` violations | 0 |
| Live `exhaustive-deps` warnings (Group A) | 6 |
| Disable comments genuinely suppressing a report (Group B) | 12 |
| Dead `exhaustive-deps` disable directives (Group C) | 9 |
| Dead disable directives for other rules | 6 |

## The single shared pattern

All 18 Group A + Group B items have one cause: `exhaustive-deps` does mechanical
reference-checking, not alias analysis. Every flagged effect calls a plain
(non-`useCallback`) `loadX`/`loadData` defined in the component body. In every case
either the function has zero reactive inputs (mount-once fetch against a module-singleton
HTTP service), or every reactive value it reads is already listed explicitly in the same
effect's dependency array (`[storeId]`, `[storeId, paymentType, isCredit]`, …).

ESLint wants the function reference itself in the array. That is a syntactic gap, not a
stale-closure bug.

**Angular parity confirms it.** `frontend/src/app/presentation/owners/owners.component.ts:53-56`
is `ngOnInit(): void { this.loadOwners(); }` — a single call, no reactive re-fetch. That
is exactly what `owner-list.tsx`'s `useEffect(() => { loadOwners(); }, [])` mirrors. Per
the standing parity constraint, a missing dep that reproduces Angular's behavior is
parity, not a defect.

## Group A — 6 live warnings, no disable comment

All six are SAFE. None has a `storeId`, route param, or prop to add — the dependency
array is legitimately empty.

| File:line | Evidence |
| --- | --- |
| `app/admin/dashboard/routes/dashboard.tsx:50` | `loadData('7days')` on mount; `viewType` toggles call `loadData` from click handlers, not the effect |
| `app/admin/owners/routes/owner-list.tsx:30` | mount-once, mirrors Angular `owners.component.ts:53-56` |
| `app/admin/resellers/routes/reseller-list.tsx:29` | same shape, global admin list |
| `app/admin/stores/routes/store-list.tsx:38` | same shape |
| `app/management/stores/routes/collections.tsx:39` | same shape, backend-computed data |
| `app/management/stores/routes/reseller-commissions.tsx:40` | same shape |

## Group B — 12 disables that ARE suppressing a real report

Someone silenced a rule that was never running, so nobody ever saw what it would say.
Now we know: all SAFE, one flagged fragile.

| File:line | Deps in array | Verdict |
| --- | --- | --- |
| `app/expenses/routes/today-expenses.tsx:37` | `[storeId]` | SAFE |
| `app/expenses/routes/expenses-history.tsx:104` | `[storeId, paymentType]` | SAFE |
| `app/sales/routes/credits.tsx:70` | `[storeId]` | SAFE |
| `app/sales/routes/today-orders.tsx:47` | `[storeId, paymentType, isCredit]` | SAFE |
| `app/sales/routes/orders.tsx:75` | `[storeId, paymentType, isCredit]` | SAFE |
| `app/management/users/routes/user-list.tsx:36` | `[]` | SAFE — `GET /v1/users/all/true` is global, not store-scoped |
| `app/sales/routes/today-credits.tsx:35` | `[storeId]` | SAFE |
| `app/sales/routes/products.tsx:66` | `[storeId]` | SAFE |
| `app/inventory/routes/today-entries.tsx:50` | `[storeId]` | SAFE |
| `app/reports/routes/today-report.tsx:77` | `[storeId]` | SAFE — **and free to fix**: `loadReport` (line 71-73) is already `useCallback(…, [storeId])`; swapping the effect's deps to `[loadReport]` satisfies the rule with zero behavior change |
| `app/inventory/routes/entries.tsx:101` | `[storeId]` | SAFE |
| `app/admin/owners/routes/owner-edit.tsx:177` | `[isSuperAdmin, activeTab]` | **SAFE BUT FRAGILE** — `loadStores()` (line 85) calls `storeHttpService.listStores()`, a global unfiltered list, refetched on every "Tiendas" tab activation (ADR-9 lazy tab pattern). Documented as intentional (WU2 comment, mirrors `store-list.tsx`). Not a lint bug, but the one place a future contributor is likely to add owner-id filtering and forget the dep |

## Group C — dead directives, safe to delete

9 hook-rule dead disables:
`app/inventory/routes/available.tsx:33`, `egress.tsx:54`, `egress.tsx:70`,
`today-quantities.tsx:148`, `today-sales-profit.tsx:200`;
`app/sales/routes/sale.tsx:48`, `sale.tsx:64`, `today-stats.tsx:140`;
`app/statistics/routes/dashboard.tsx:125`.

6 dead disables for other rules, **verified by an actual eslint run** (an earlier
grep-by-elimination guess named `product-category-repository.ts:179,185` — that guess was
wrong and is not in the list):

- `app/expenses/routes/__tests__/expenses-routes.test.tsx:112`, `:169`, `:208` — `@typescript-eslint/no-explicit-any`
- `app/reports/routes/__tests__/reports-routes.test.tsx:178` — `no-bitwise`
- `app/service-worker.ts:2` — `no-restricted-globals`
- `app/shared/lib/http/api-client.ts:15` — `@typescript-eslint/no-empty-object-type`

## Findings summary

**Zero real bugs.** No effect in Groups A or B produces stale user-visible data; every one
already re-fires on every value it reads.

The value of this change is therefore not bug-fixing — it is turning on a rule that was
silently inert, deleting 15 suppressions that suppress nothing, and leaving behind an
honest signal for future code.

## Open decisions for the user

1. **What to do with the 18 SAFE items.** Leave the arrays as they are and record why, or
   express the intent explicitly (a disable with a stated reason, or `useCallback`)?
   Adding `loadX` to the arrays without `useCallback` would cause refetch-per-render — a
   real regression. This is the main decision.
2. **`today-report.tsx:77`** — the one free, zero-behavior-change fix. Take it as a
   template or leave it for consistency with the other 17?
3. **`owner-edit.tsx:177`** — confirm the team is fine leaving the Tiendas tab on the
   global (not owner-scoped) store list. Pre-existing and documented; wants a conscious
   "known, out of scope" rather than a silent pass.

## Risks

- The plugin registration in `packages/eslint-config/react-router.config.js` is still an
  uncommitted working-tree change. It must land before or with any dependency-array edit.
- `eslint-plugin-react`, `eslint-plugin-import`, `eslint-plugin-unused-imports` and
  `eslint-plugin-prettier` are also declared devDependencies that are never registered.
  Registering them is out of scope here but is the same class of defect.
