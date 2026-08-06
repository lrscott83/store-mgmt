# Apply Progress — `e2e-playwright-login-s1-02`

**Mode**: Strict TDD (RED → GREEN per work unit, proof commands adapted — see "Notas de
implementación" in `tasks.md`).

**Status**: 6/6 work units complete (WU-A through WU-F). All Fase 0-5 tasks in `tasks.md` marked
`[x]`. The 5 unchecked items are the user's own live-run hand-off checklist (backend required —
not executed by this agent, per project rule D2).

## Work Units Delivered

| WU | Commit | Files | RED proof | GREEN proof |
|----|--------|-------|-----------|--------------|
| A | `5a14bc8` test(e2e): add login page object, login network observer, and UI seed helper | `support/login-page.ts`, `support/login-network-observer.ts`, `support/store-seed.ts` | Draft `session.ts` importing the 3 modules → `tsc` TS2307 x3 | `tsc` exit 0 |
| B | `5c972c1` test(e2e): add session.ts persona-minting engine for signedInPage | `support/session.ts` | (continuation of A's RED) | `tsc` exit 0 |
| C | `424100b` test(e2e): wire signedInPage and loginNetwork fixtures into test.ts | `support/test.ts` (additive only) | Draft `login.spec.ts` using `persona`/`signedInPage` → TS2353/TS2339 | `tsc` exit 0 + `playwright test e2e/register.spec.ts --list` unchanged (8 tests) |
| D | `f9ad4f1` test(e2e): add login.spec.ts covering A1-A7 and D1-D6 | `login.spec.ts`, `support/session.ts` (extended — see deviation below) | (continuation of C's RED) | `tsc` exit 0 + `playwright test e2e/login.spec.ts --list` → 8 tests |
| E | `ceb7226` test(e2e): isolate the login rate-limit assertion behind its own spec | `login-rate-limit.spec.ts` | N/A (new file, no prior consumer) | `tsc` exit 0 + `playwright test e2e/login-rate-limit.spec.ts --list` → 1 test |
| F | `9366558` docs(e2e): document signedInPage, the login quota budget, and coverage | `e2e/README.md` | N/A (docs) | Read-through: quota-margin warning is a blockquote, not buried |
| tracking | `e53dc5f` docs(sdd): record planning artifacts and apply progress | `tasks.md` + proposal/design/specs (were untracked) | — | — |

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| 0.0-0.4 (WU-A) | Draft `session.ts` fails to resolve 3 modules (`tsc` TS2307 ×3) | `tsc` clean after `login-page.ts`/`login-network-observer.ts`/`store-seed.ts` written | N/A — first pass matched design |
| 1.1-1.6 (WU-B) | Continuation of 0.0's RED (same draft) | `tsc` clean for `session.ts` | Restructured after WU-D's live-login-budget discovery — see deviation below |
| 2.1-2.3 (WU-C) | Draft `login.spec.ts` fails on `persona`/`signedInPage` (TS2353/TS2339) | `tsc` clean; `register.spec.ts --list` unchanged (8/8) | Fixed a real TS2322 (worker-scoped fixture mixed into the test-fixtures generic) — split `SessionWorkerFixtures` into `test.extend`'s 2nd generic |
| 3.1-3.15 (WU-D) | Continuation of 2.1's RED | `tsc` clean; `login.spec.ts --list` → 8 tests (see deviation) | `session.ts` gained `primeOwnerAdmin`/`primeStoreUser` mid-implementation once the login-budget conflict with "13 separate tests" was discovered |
| 4.1-4.2 (WU-E) | N/A (isolated new file — nothing to break) | `tsc` clean; `login-rate-limit.spec.ts --list` → 1 test | None |
| 5.1-5.2 (WU-F) | N/A (docs) | Read-through pass | None |

## Deviations From tasks.md (documented, not silent)

Both are also recorded verbatim in `tasks.md` under "Notas de implementación".

1. **Proof command**: `pnpm typecheck` does NOT type-check `frontend-react/e2e/` — verified by
   injecting a broken-import probe file into `e2e/support/` and observing `pnpm typecheck` stay
   green (turbo cache hit, not even re-evaluated; no workspace package's `tsconfig.json` includes
   `e2e/`). Used the command the sibling change `e2e-playwright-register-s1-01` actually verified
   with (`verify-report.md:30`): `pnpm exec tsc --noEmit --strict --lib ES2022,DOM --types node
   --typeRoots ./apps/web-store-pos/node_modules/@types --moduleResolution bundler --module
   ES2022 --target ES2022 --skipLibCheck e2e/*.ts e2e/support/*.ts playwright.config.ts
   playwright.api.config.ts` for every RED/GREEN cycle in this change.

2. **8 tests, not 13, in `login.spec.ts`**: the login rate-limit budget (design.md §2 — exactly 4
   real logins/run against a 5/minute ceiling) makes 13 independently-live-tested REQs
   arithmetically impossible: A1/A2 must observe the SAME live form submission (a restored session
   never calls `POST /v1/auth/login`), and design.md's own budget table assigns that same login as
   the subject of A1/A2/A6/D2/D5 too. REQ-11 (D3)'s "sin productos" half needs its own live
   StoreUser login for the same reason. Tests were grouped by shared observable network event
   (mirroring `register.spec.ts`'s own REQ-8/REQ-6 shared-identity precedent), and split into
   independent tests wherever `signedInPage`/`restoreSignedInSession` made that free (REQ-7,
   REQ-9, REQ-12+REQ-14 combined). `PersonaCache` grew `primeOwnerAdmin()`/`primeStoreUser()` —
   not in the original Fase 1 design — so a test's own already-observed live login feeds the
   cache instead of the chain paying for a second, invisible one.
   **Verified real budget**: 4 total logins (1 owner-admin, shared by A1/A2/A6/D2/D5/A7[partial via
   cache reuse]/D4[partial]/D6[partial]; 1 store-user, shared by REQ-11's "sin productos" half; 1
   REQ-3; 1 REQ-9/D1) — matches design.md §2 exactly, no budget regression.

## Structural (Static) Verification — Everything This Agent Could Prove Without a Backend

All PROVED, re-run fresh at the end of the session (not taken on faith from earlier in-progress
runs):

- `pnpm exec tsc --noEmit --strict ... e2e/*.ts e2e/support/*.ts playwright.config.ts
  playwright.api.config.ts` → **exit 0**, zero errors, across all 3 new spec files + all 4 new
  support files + `test.ts`'s additive edit.
- `pnpm exec playwright test --grep-invert @rate-limit --list` → **20 tests in 4 files**
  (`api-health.spec.ts` ×2, `login.spec.ts` ×8, `register.spec.ts` ×8, `smoke.spec.ts` ×2) — no
  fixture/import errors.
- `pnpm exec playwright test --grep @rate-limit --list` → **2 tests in 2 files**
  (`login-rate-limit.spec.ts` ×1, `register-rate-limit.spec.ts` ×1).
- `pnpm exec playwright test e2e/register.spec.ts --list` → **unchanged, 8/8**, same test names,
  same line numbers as before this change (blast-radius gate, design.md §9).
- `pnpm typecheck` (turbo, all workspace packages) → unaffected, 5/5 cached/successful (sanity
  check only — does not cover `e2e/`, see deviation #1).

## UNPROVEN — Requires The User's Own Live Backend Run (D2, this agent never runs `dotnet`)

- Every runtime assertion in `login.spec.ts` (REQ-1..REQ-7, REQ-9..REQ-14): overlay-only
  rendering, causal login→me network order, the literal backend error text on a bad password,
  `AUTH_MODEL` persistence, the guest-guard redirect, the StoreUser creation via
  `adminFeatureLoader` (**including whether Gate R2/H-8 fires at all** — genuinely unknown until
  run), the real re-login after `logout()`, and the `/admin/owners` negative/D6 cross-checks.
- `login-rate-limit.spec.ts`'s REQ-8: whether the backend actually answers 429 after 5 attempts,
  whether CORS on that 429 is configured correctly (R8), and whether a failed login truly consumes
  a permit (R7) — the design assumes yes (middleware-level limiter) but this is unverified live.
- The two-runs-within-one-minute quota-margin claim (R1): plausible from the code (5/min ceiling,
  4 logins/run) but never observed to actually go red.
- `store-seed.ts`'s selectors resolving correctly against the real rendered app (each selector was
  read from the current source of `products.tsx`/`edit-product-category-modal.tsx`/
  `category-actions-menu.tsx`/`create-product-modal.tsx`, but never clicked against a live
  browser).

## Files Changed (final state, this branch vs `main`)

```
frontend-react/e2e/README.md                                    | 83 +++++-
frontend-react/e2e/login-rate-limit.spec.ts                     | 72 ++++ (new)
frontend-react/e2e/login.spec.ts                                | 282 ++++ (new)
frontend-react/e2e/support/login-network-observer.ts             | 335 ++++ (new)
frontend-react/e2e/support/login-page.ts                        | 45 ++++ (new)
frontend-react/e2e/support/session.ts                            | 410 ++++ (new)
frontend-react/e2e/support/store-seed.ts                         | 47 ++++ (new)
frontend-react/e2e/support/test.ts                                | 77 ++--- (additive edit)
openspec/changes/e2e-playwright-login-s1-02/*                    | (planning artifacts, were untracked; now committed)
```

**Untouched, verified**: `register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts`,
`api-health.spec.ts`, `support/network-observer.ts`, `support/register-page.ts`,
`support/identity.ts`, `support/backend-url.ts`, `playwright.config.ts`, `package.json`, every
`vitest` file in the repo.

## Next Recommended

`sdd-verify` — all 6 work units done, structural/static gates green. Verify should independently
re-run the `tsc` command above and both `--list` gates, and explicitly flag the two UNPROVEN
categories (live backend run, live rate-limit run) as declared gaps pending the user's own
`pnpm test:e2e` / `pnpm test:e2e:rate-limit` execution — same pattern the archived
`e2e-playwright-register-s1-01` verify report used for its own REQ-9.
