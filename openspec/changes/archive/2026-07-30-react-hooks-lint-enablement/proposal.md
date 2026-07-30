# Proposal: react-hooks-lint-enablement

Date: 2026-07-29
Change: `react-hooks-lint-enablement`
Artifact store: hybrid (this file + engram `sdd/react-hooks-lint-enablement/proposal`)
Depends on: `openspec/changes/react-hooks-lint-enablement/explore.md` (engram `sdd/react-hooks-lint-enablement/explore`)
Branch: `fix/dev-preview-port-separation` @ 6138245

## Intent

### What problem

`eslint-plugin-react-hooks` is a declared devDependency of `@store-mgmt/eslint-config` that
was never registered in `packages/eslint-config/react-router.config.js`. Both hook rules —
`rules-of-hooks` and `exhaustive-deps` — have therefore never been evaluated in this repo.

Two consequences accumulated behind that gap:

1. **21 `eslint-disable` comments reference a rule ESLint does not know.** They produce
   `Definition for rule 'react-hooks/exhaustive-deps' was not found` instead of suppressing
   anything. Nine of them sit on effects that the rule would not have flagged at all — they
   suppress nothing and never did.
2. **Twelve disables silence a report nobody has ever read.** Someone muted a rule that was
   not running, so the muted output was never inspected. The exploration inspected it: all
   twelve are safe, but that safety is currently undocumented and unverifiable by the next
   reader.

### Why now

The plugin registration already exists as an uncommitted working-tree change to
`react-router.config.js`. It cannot be committed in isolation without landing the directive
cleanup alongside it, because committing it alone flips 15 previously-inert comments into
`--report-unused-disable-directives` territory and leaves 12 undocumented suppressions on a
now-live rule. Registration and cleanup are one atomic unit.

### What this change is worth — stated plainly

**It fixes zero bugs.**

The exploration checked all 18 live-or-suppressed sites. No effect in Group A or Group B
produces stale user-visible data; every one already re-fires on every reactive value its
`loadX` function reads. There is no defect here to fix.

The value is narrower and should not be inflated:

- a rule that was silently inert now actually runs;
- 15 suppressions that suppress nothing are deleted;
- the suppressions that remain state, in one line each, why they are correct.

That is the whole return. Anyone reading this proposal expecting a behavior fix should stop
here.

### Success looks like

- `react-hooks/rules-of-hooks` runs at `error` and `react-hooks/exhaustive-deps` at `warn`
  across `apps/web-store-pos`.
- Zero `rules-of-hooks` violations (already true — this change makes it *enforced*).
- Zero unused/dead disable directives referencing hook rules or the six verified non-hook
  rules.
- Every surviving `exhaustive-deps` disable carries a stated reason.
- No behavior change anywhere. No test outcome changes. `pnpm lint` and `tsc --noEmit` both
  stay green.

## Scope

### In scope

**1. Register the plugin.** `frontend-react/packages/eslint-config/react-router.config.js`
— import `eslint-plugin-react-hooks`, add `plugins: { 'react-hooks': reactHooks }`, set
`react-hooks/rules-of-hooks: 'error'` and `react-hooks/exhaustive-deps: 'warn'`. This is
already present in the working tree and must land as part of this change, not before it and
not after.

**2. Delete the dead disable directives.** Use the VERIFIED Group C list in `explore.md`,
which came from an actual eslint run — not the earlier grep-by-elimination guess, which
wrongly named `product-category-repository.ts:179,185` and must not be followed.

Nine dead hook-rule directives:
`app/inventory/routes/available.tsx:33`, `egress.tsx:54`, `egress.tsx:70`,
`today-quantities.tsx:148`, `today-sales-profit.tsx:200`;
`app/sales/routes/sale.tsx:48`, `sale.tsx:64`, `today-stats.tsx:140`;
`app/statistics/routes/dashboard.tsx:125`.

Six verified dead non-hook directives:
`app/expenses/routes/__tests__/expenses-routes.test.tsx:112`, `:169`, `:208`
(`@typescript-eslint/no-explicit-any`); `app/reports/routes/__tests__/reports-routes.test.tsx:178`
(`no-bitwise`); `app/service-worker.ts:2` (`no-restricted-globals`);
`app/shared/lib/http/api-client.ts:15` (`@typescript-eslint/no-empty-object-type`).

**3. Document the surviving disables.** Replace each bare
`// eslint-disable-next-line react-hooks/exhaustive-deps` with the same directive carrying a
one-line stated reason. Wording is per-site and English, matching the surrounding comment
style, which in these files is sentence-case prose that cites Angular parity where relevant
(e.g. `today-expenses.tsx:27-28`). Examples of the intended register:
`loadExpenses only reads storeId, already in deps`;
`loadUsers hits the global GET /v1/users/all/true, no reactive input`.

**4. The one free code fix — `app/reports/routes/today-report.tsx:77`.** `loadReport` is
already `useCallback(() => { setReport(computeTodayReport(storeId)); }, [storeId])` at lines
71-73, two lines above the effect. Swapping the effect's dependency array from `[storeId]`
to `[loadReport]` satisfies the rule directly. `loadReport`'s identity changes exactly when
`storeId` changes, so the effect fires on exactly the same transitions as today: zero
behavior change.

### Counting note (arithmetic, not a reopened decision)

Group B contains 12 disables. Item 4 resolves one of them (`today-report.tsx:77`) by fixing
the deps, which makes that directive dead — so it is deleted rather than documented, under
the same policy as the other dead directives in item 2. The resulting split is:

- **16 directives deleted** — 15 already-dead, plus `today-report.tsx:77` newly dead.
- **11 directives kept and documented** — the remaining Group B sites.

The decision is unchanged; only the tally is stated precisely so the spec and tasks phases
do not inherit an off-by-one.

### Out of scope

**Wrapping the other 17 `loadX` functions in `useCallback`.** Rejected deliberately. It is a
structural refactor with zero behavior change spread across 18 files; it violates the
project's standing "parity, not improvement" rule
(`docs/migration/playbook-migracion-servicios-angular-react.md`, and the Angular parity
evidence in `explore.md` — `owners.component.ts:53-56` is a bare `ngOnInit` single call,
which `owner-list.tsx`'s `useEffect(…, [])` mirrors exactly); and it requires hand-writing
18 new dependency arrays, trading zero known defects for 18 fresh opportunities to create
one — a stale closure, or a refetch-per-render loop if a `loadX` reference lands in an array
without the `useCallback` wrapper actually applied.

**Group A's 6 live warnings are left visible on purpose.** `dashboard.tsx:50`,
`owner-list.tsx:30`, `reseller-list.tsx:29`, `store-list.tsx:38`, `collections.tsx:39`,
`reseller-commissions.tsx:40` have no disable comment and will emit `exhaustive-deps`
warnings after registration. The lint script is `eslint .` with no `--max-warnings=0`, so
these do not fail the gate. Suppressing them would mean adding six new disables to silence a
rule we are switching on in the same change; leaving them is the honest signal.

**Registering the other declared-but-unregistered plugins** — `eslint-plugin-react`,
`eslint-plugin-import`, `eslint-plugin-unused-imports`, `eslint-plugin-prettier`. Exactly
the same class of defect, deliberately a separate change: each will surface its own warning
backlog that needs its own triage.

**The unrelated warning backlog** — 28 `no-unused-vars`, 8
`turbo/no-undeclared-env-vars`, 3 `prefer-const`, 2 `no-explicit-any`. Separate cleanup.

**`app/admin/owners/routes/owner-edit.tsx:177` — knowingly untouched.** `loadStores()`
(line 85) calls `storeHttpService.listStores()`, a global unfiltered store list, refetched on
every "Tiendas" tab activation under the ADR-9 lazy-tab pattern. It is not owner-scoped. This
is pre-existing, already documented in the WU2 comment, and mirrors `store-list.tsx`. It is
recorded here as a conscious "known, out of scope" rather than a silent pass, per the
exploration's open decision #3. Its disable is documented like the other survivors; the
underlying scoping question is not addressed.

## Approach

One work unit, one commit, in this order:

1. **Land the config registration.** Commit the existing working-tree change to
   `react-router.config.js` as the first hunk of this change, so the rest of the edits are
   made against a lint run that actually evaluates hook rules.
2. **Run eslint and capture the baseline.** Re-derive the dead-directive list from the run
   rather than from any prior grep. The exploration already did this once and caught one
   wrong guess; repeating it is cheap insurance against a stale list.
3. **Delete the 16 dead directives.**
4. **Fix `today-report.tsx:77`** — deps `[storeId]` → `[loadReport]`.
5. **Document the 11 survivors**, one stated reason each, worded per-site.
6. **Verify.** `pnpm lint` shows zero `rules-of-hooks` errors, zero unused disable
   directives, and only the 6 Group A warnings plus the unrelated backlog. `tsc --noEmit`
   clean. Test suite unchanged — no test should change outcome, because no behavior changes.

### Rationale for the shape

The change is deliberately kept as *enable + honest cleanup*, not *enable + refactor*. The
exploration established that there is no defect to fix, which removes the usual justification
for touching 18 components. Once the payload is "make the linter's state truthful", the
cheapest correct implementation is the one that edits comments and one dependency array —
because every additional line of code changed is pure added risk against a zero-bug baseline.

Registration must be committed together with the cleanup rather than split, because the two
halves are only correct as a pair: registration alone leaves 15 newly-detectable dead
directives and 12 undocumented live suppressions.

## Residual risk of the chosen option — stated, not minimized

**The 11 documented disables still silence a rule that is now live.** That is the accepted
cost of option A. If someone later introduces a reactive value inside one of those `loadX`
functions — a filter, a date range, a second route param — the linter will not catch it,
because the disable is still there. The stated reason in the comment is the *only* defence.

This is a real, permanent trade. Option A buys a zero-risk implementation today by pushing
the enforcement burden onto comment discipline tomorrow. The `useCallback` refactor would
have removed that burden, at the cost of 18 hand-written dependency arrays against a codebase
with zero known dependency defects. The choice was to take the documentation burden.

`owner-edit.tsx:177` is where that trade is most likely to be collected: it is the one site
the exploration flagged as fragile, and the most plausible future edit — adding owner-id
filtering to the Tiendas tab store list — is exactly the edit that would need a dependency
the disable will hide.

## Open questions

None blocking. The exploration's three open decisions are all resolved and recorded above:
(1) option A for the 18 SAFE items, (2) take the `today-report.tsx` free fix, (3)
`owner-edit.tsx` global store fetch acknowledged as knowingly untouched.

---

## Addendum — where delivery went past this proposal (2026-07-30)

Everything above is preserved as written. It recorded the decisions honestly at the time it
was written, and rewriting it to match the outcome would destroy the only record of *why*
the outcome had to change. Four of its statements are no longer true of the shipped result;
each is listed here with what superseded it.

**1. `exhaustive-deps` ships at `error`, not `warn`.** The "Success looks like" bullet
specified `warn`. Every lint script now runs with `--max-warnings=0` (`60381c5`), which makes
`warn` and `error` fail identically — so a severity of `warn` described a leniency that does
not exist. Raised to `error` in `9ec5519`.

**2. Group A's 6 live warnings were fixed, not left visible.** The "Out of scope" section
kept them visible on the explicit grounds that *"the lint script is `eslint .` with no
`--max-warnings=0`, so these do not fail the gate."* Both halves of that premise died in
`60381c5`: the gate now fails on any warning. With the premise gone the exemption had no
support, and the user asked for zero deferred findings. `654b884` wraps each of the six
`loadX` in `useCallback` over the `intl` object it reads. This is narrower than the refactor
this proposal rejected — that rejection covered the *other 17* sites, which remain untouched
and out of scope.

**3. The other declared-but-unregistered plugins were removed, not registered later.**
`eslint-plugin-react`, `-import`, `-unused-imports`, `-prettier` and `only-warn` were deleted
from `@store-mgmt/eslint-config`'s devDependencies in `60381c5`. A declared-but-unregistered
plugin is the exact illusion that hid the dead hook directives for months; deleting the
declaration removes the illusion, where a deferred "separate change" would have preserved it.

**4. The "unrelated warning backlog" is gone.** The 28 `no-unused-vars`, 8
`turbo/no-undeclared-env-vars`, 3 `prefer-const` and 2 `no-explicit-any` deferred here were
resolved in `60381c5` (the `^_` convention for deliberately-unread bindings, node globals for
`scripts/**/*.mjs`) and `f6116e0` (dead bindings deleted). The gate reports zero.

The residual-risk section stands unchanged: the 11 documented disables still silence a live
rule, and `owner-edit.tsx:177` is still where that trade is most likely to be collected.
