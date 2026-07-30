# Archive Report: react-hooks-lint-enablement

Date: 2026-07-30
Branch: `fix/dev-preview-port-separation` (pushed to `origin`)
Artifact store: hybrid (this file + engram `sdd/react-hooks-lint-enablement/apply-progress`)

## Why this change has no spec, design, tasks or verify-report

It was closed by hand rather than through the full SDD chain. The proposal had already fixed
every decision, the apply was mechanical comment-and-config editing, and the verification is
the gate output rather than a spec-compliance matrix. Recording that here so the missing
files read as a deliberate shortcut, not as lost artifacts.

## What shipped

| Commit | What |
|---|---|
| `558808d` | Register `eslint-plugin-react-hooks` in the shared react-router config |
| `1b54897` | `today-report` effect keyed on the already-memoized `loadReport` |
| `5a54ba8` | Delete the 16 dead disable directives |
| `6980f09` | State a reason on each of the 11 surviving disables |
| `e703c5d` | Commit `explore.md` and `proposal.md` |

Delivery then went past the proposal on the same branch. The addendum in `proposal.md`
records each divergence against the statement it superseded; in short:

| Commit | What |
|---|---|
| `60381c5` | Drop `only-warn`; every lint script runs `--max-warnings=0` |
| `f6116e0` | Delete the dead bindings the now-real gate surfaced |
| `654b884` | Memoize the six mount-only loaders — the last live `exhaustive-deps` reports |
| `9ec5519` | Raise every remaining `warn` severity to `error` |

## Root cause worth carrying forward

The twelve `exhaustive-deps` directives were dead for a reason that is invisible on
inspection: the `// eslint-disable-next-line` sat on the line above the dependency array
(`}, [storeId]);`), but the rule anchors its report on the `useEffect` callback
(`useEffect(() => {`). A misplaced directive suppresses nothing. Verified empirically —
deleting all twelve produced no new report.

## Verification

Four gates, all executed with cold turbo caches:

- `lint` — 4 tasks, exit 0, zero warnings under `--max-warnings=0`
- `typecheck` — 5 tasks, exit 0
- `test` — 155 files, 2162 tests passed
- `build` — 3 tasks, exit 0

## Adjacent work on the same branch — deliberately not part of this change

Making the gate real exposed holes wider than hook rules, fixed in the same branch but
belonging to no SDD change: `f696075` (domain had no `lint` script at all — turbo skips such
packages silently), `ab5e332` (web-common globbed `src/**/*.ts` without the `x`, and its test
was outside the TypeScript project, hiding seven real type errors), `ae1c270` (the config
package now lints itself), and `1d9394e` / `cafd817` (two test files that asserted less than
their names claimed). Listed here so the branch's commit range has no unexplained remainder.

## Not closed by this change

- The 11 documented disables still silence a live rule. `owner-edit.tsx:177` remains the site
  the exploration flagged as most likely to collect that trade.
- The other 17 `loadX` functions are still un-memoized with `[]` dependency arrays. Out of
  scope in the proposal and still out of scope: they mirror Angular's bare `ngOnInit`, and no
  gate reports them.
